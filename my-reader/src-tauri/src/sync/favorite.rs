use sea_orm::{DatabaseConnection, DatabaseTransaction, TransactionTrait};
use tracing::info;
use uuid::Uuid;

use crate::error::AppError;
use crate::repositories::favorite_book_repo::SqliteFavoriteBookRepository;

use super::contract::{Change, DomainState, FavoriteState, FavoriteValue, Lww};
use super::hlc::Hlc;
use super::kernel::{enqueue_change, ensure_replica_identity, read_hlc_state, write_hlc_state};

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

pub async fn write_local_favorite(
    db: &DatabaseConnection,
    library_uuid: &str,
    book_id: i64,
    is_favorite: bool,
    now_ms: u64,
) -> Result<(), AppError> {
    if book_id < 1 {
        return Err(sync_error("Favorite book ID is invalid"));
    }
    let identity = ensure_replica_identity(db, library_uuid).await?;
    let replica_id =
        Uuid::parse_str(&identity.replica_id).map_err(|_| sync_error("Invalid replica ID"))?;
    let txn = db
        .begin()
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;
    let current = SqliteFavoriteBookRepository::find_by_book_id(&txn, book_id).await?;
    if current
        .as_ref()
        .is_some_and(|row| (row.is_favorite != 0) == is_favorite)
        || (current.is_none() && !is_favorite)
    {
        txn.commit()
            .await
            .map_err(|error| AppError::Database(error.to_string()))?;
        return Ok(());
    }
    let (physical_ms, counter) = read_hlc_state(&txn).await?.unwrap_or((0, 0));
    let next = Hlc::next_local(physical_ms, counter, now_ms, replica_id)
        .map_err(|error| sync_error(error.to_string()))?;
    let clock = next
        .encode()
        .map_err(|error| sync_error(error.to_string()))?;
    let book_id_contract =
        u64::try_from(book_id).map_err(|_| sync_error("Favorite book ID is invalid"))?;
    let state = FavoriteState {
        book_id: book_id_contract,
        register: Lww {
            clock: clock.clone(),
            value: FavoriteValue {
                is_favorite,
                added_at_ms: is_favorite.then_some(now_ms),
            },
        },
    };
    let added_at = if is_favorite {
        now_ms as f64
    } else {
        current.as_ref().map_or(0.0, |row| row.added_at)
    };
    SqliteFavoriteBookRepository::write_state(&txn, book_id, added_at, is_favorite, &clock).await?;
    write_hlc_state(&txn, next.physical_ms, next.counter).await?;
    enqueue_change(
        &txn,
        &Change {
            change_id: Uuid::new_v4().as_simple().to_string(),
            clock,
            state: DomainState::Favorite(state),
        },
    )
    .await?;
    txn.commit()
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;
    info!(
        target: "myreader_sync",
        event = "book_favorite.local_write",
        library_uuid,
        replica_id = %identity.replica_id,
        book_id,
        is_favorite,
        "Committed local favorite state"
    );
    Ok(())
}

pub(super) async fn apply_favorite_change(
    txn: &DatabaseTransaction,
    segment: &super::contract::Segment,
    change: &Change,
    incoming: &FavoriteState,
) -> Result<(), AppError> {
    let book_id =
        i64::try_from(incoming.book_id).map_err(|_| sync_error("Favorite book ID is invalid"))?;
    let current = SqliteFavoriteBookRepository::find_by_book_id(txn, book_id).await?;
    let current_clock = current
        .as_ref()
        .and_then(|row| row.sync_clock.as_deref())
        .map(str::to_owned);
    let merged = if let Some(current) = current.as_ref().filter(|row| row.sync_clock.is_some()) {
        let current_state = DomainState::Favorite(FavoriteState {
            book_id: incoming.book_id,
            register: Lww {
                clock: current.sync_clock.clone().expect("filtered sync clock"),
                value: FavoriteValue {
                    is_favorite: current.is_favorite != 0,
                    added_at_ms: (current.is_favorite != 0).then_some(current.added_at as u64),
                },
            },
        });
        match current_state
            .merge(&DomainState::Favorite(incoming.clone()))
            .map_err(|error| sync_error(error.to_string()))?
        {
            DomainState::Favorite(state) => state,
            _ => unreachable!("favorite merge returns a favorite"),
        }
    } else {
        incoming.clone()
    };
    let added_at = if merged.register.value.is_favorite {
        merged.register.value.added_at_ms.unwrap_or(0) as f64
    } else {
        current.as_ref().map_or(0.0, |row| row.added_at)
    };
    SqliteFavoriteBookRepository::write_state(
        txn,
        book_id,
        added_at,
        merged.register.value.is_favorite,
        &merged.register.clock,
    )
    .await?;
    info!(
        target: "myreader_sync",
        event = "book_favorite.merge",
        source_replica_id = %segment.replica_id,
        sequence = %segment.sequence,
        change_id = %change.change_id,
        book_id = incoming.book_id,
        current_clock = ?current_clock,
        incoming_clock = %incoming.register.clock,
        selected_clock = %merged.register.clock,
        selected_source = if merged.register.clock == incoming.register.clock {
            "remote"
        } else {
            "local"
        },
        is_favorite = merged.register.value.is_favorite,
        "Merged remote favorite state"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use sea_orm::{Database, EntityTrait, TransactionTrait};
    use sea_orm_migration::MigratorTrait;

    use crate::entities::app::{favorite_books, sync_outbox};
    use crate::sync::contract::{Segment, PROTOCOL};
    use crate::sync::kernel::SegmentProjection;
    use crate::sync::projection::LibrarySidecarProjection;

    use super::*;

    const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";

    #[tokio::test]
    async fn should_persist_projection_hlc_and_outbox_when_book_is_favorited() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        crate::migration::LibraryMigrator::up(&db, None)
            .await
            .unwrap();

        write_local_favorite(&db, LIBRARY_UUID, 42, true, 900)
            .await
            .unwrap();

        let favorite = favorite_books::Entity::find()
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(favorite.book_id, 42);
        assert_eq!(favorite.is_favorite, 1);
        assert!(favorite.sync_clock.is_some());
        let outbox = sync_outbox::Entity::find().all(&db).await.unwrap();
        assert_eq!(outbox.len(), 1);
        assert_eq!(outbox[0].domain, "book_favorite.v1");
    }

    #[tokio::test]
    async fn should_keep_newer_local_tombstone_when_older_remote_favorite_is_replayed() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        crate::migration::LibraryMigrator::up(&db, None)
            .await
            .unwrap();
        write_local_favorite(&db, LIBRARY_UUID, 42, true, 700)
            .await
            .unwrap();
        write_local_favorite(&db, LIBRARY_UUID, 42, false, 2_000)
            .await
            .unwrap();
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        let remote_replica_id = "018f2f8d-980b-40ef-b72e-c6e86cb7cc30";
        let remote_clock = Hlc {
            physical_ms: 1_500,
            counter: 0,
            replica_id: Uuid::parse_str(remote_replica_id).unwrap(),
        }
        .encode()
        .unwrap();
        let segment = Segment {
            protocol: PROTOCOL.to_owned(),
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: remote_replica_id.to_owned(),
            sequence: "1".to_owned(),
            changes: vec![Change {
                change_id: Uuid::new_v4().as_simple().to_string(),
                clock: remote_clock.clone(),
                state: DomainState::Favorite(FavoriteState {
                    book_id: 42,
                    register: Lww {
                        clock: remote_clock,
                        value: FavoriteValue {
                            is_favorite: true,
                            added_at_ms: Some(1_500),
                        },
                    },
                }),
            }],
        };
        let projection = LibrarySidecarProjection::new(&identity.replica_id, 1_600).unwrap();
        let txn = db.begin().await.unwrap();
        projection.apply(&txn, &segment).await.unwrap();
        txn.commit().await.unwrap();

        let favorite = favorite_books::Entity::find()
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(favorite.is_favorite, 0);
    }
}
