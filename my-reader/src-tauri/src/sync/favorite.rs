use sea_orm::DatabaseConnection;
use tracing::info;

use crate::error::AppError;

use super::automerge_document::{favorite_projections, set_favorite, FavoriteValue};
use super::automerge_projection::LibrarySidecarAutomergeProjection;
use super::automerge_store::commit_library_sidecar_automerge_mutation;
use super::replica_identity::ensure_replica_identity;

pub async fn write_local_favorite(
    db: &DatabaseConnection,
    library_uuid: &str,
    book_id: i64,
    is_favorite: bool,
    now_ms: u64,
) -> Result<(), AppError> {
    if book_id < 1 {
        return Err(AppError::Sync("Favorite book ID is invalid".into()));
    }
    let identity = ensure_replica_identity(db, library_uuid).await?;
    let projection = LibrarySidecarAutomergeProjection;
    let mut changed = false;
    commit_library_sidecar_automerge_mutation(
        db,
        &identity,
        now_ms,
        |document| {
            let current = favorite_projections(document)?
                .into_iter()
                .find(|(id, _)| *id == book_id)
                .map(|(_, value)| value);
            if current.as_ref().map(|value| value.is_favorite) == Some(is_favorite)
                || (current.is_none() && !is_favorite)
            {
                return Ok(());
            }
            changed = true;
            set_favorite(
                document,
                book_id,
                &FavoriteValue {
                    is_favorite,
                    added_at: if is_favorite {
                        Some(now_ms as i64)
                    } else {
                        current.and_then(|value| value.added_at)
                    },
                    recorded_at: now_ms as i64,
                    replica_id: identity.replica_id.clone(),
                },
            )?;
            Ok(())
        },
        Some(&projection),
    )
    .await?;
    if changed {
        info!(
            target: "myreader_sync",
            event = "book_favorite.local_write",
            library_uuid,
            replica_id = %identity.replica_id,
            book_id,
            is_favorite,
            "Committed local favorite state"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use sea_orm::{Database, EntityTrait};
    use sea_orm_migration::MigratorTrait;

    use crate::entities::app::{favorite_books, sync_automerge_outbox};
    use crate::migration::LibraryMigrator;

    use super::*;

    #[tokio::test]
    async fn should_persist_projection_and_outbox_when_book_is_favorited() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        LibraryMigrator::up(&db, None).await.unwrap();

        write_local_favorite(&db, "018f2f8d-980b-40ef-b72e-c6e86cb7cc28", 42, true, 900)
            .await
            .unwrap();

        let favorite = favorite_books::Entity::find()
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(favorite.book_id, 42);
        assert_eq!(favorite.is_favorite, 1);
        assert_eq!(
            sync_automerge_outbox::Entity::find()
                .all(&db)
                .await
                .unwrap()
                .len(),
            2
        );
    }
}
