use sea_orm::{DatabaseConnection, DatabaseTransaction, TransactionTrait};
use tracing::info;
use uuid::Uuid;

use crate::entities::app::bookmarks;
use crate::error::AppError;
use crate::repositories::bookmark_repo::SqliteBookmarkRepository;

use super::contract::{
    BookmarkState, BookmarkValue, Change, DomainState, Lww, ReaderLocator, Segment,
};
use super::hlc::Hlc;
use super::kernel::{enqueue_change, ensure_replica_identity, read_hlc_state, write_hlc_state};

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

fn format_name(format: &str) -> Result<String, AppError> {
    let value = format.trim().to_uppercase();
    if value.is_empty() {
        return Err(sync_error("Bookmark format is empty"));
    }
    Ok(value)
}

async fn project_bookmark(
    txn: &DatabaseTransaction,
    state: &BookmarkState,
) -> Result<bookmarks::Model, AppError> {
    let book_id =
        i64::try_from(state.book_id).map_err(|_| sync_error("Bookmark book ID is invalid"))?;
    let locator_json = serde_json::to_string(&state.register.value.locator)
        .map_err(|error| AppError::Serialize(error.to_string()))?;
    let physical_ms = Hlc::parse(&state.register.clock)
        .map_err(|error| sync_error(error.to_string()))?
        .physical_ms;
    SqliteBookmarkRepository::write_state(
        txn,
        &state.register.value.id,
        book_id,
        &state.format,
        &state.locator_key,
        &locator_json,
        state.register.value.created_at_ms as f64,
        physical_ms as f64,
        state.register.value.deleted_at_ms.map(|value| value as f64),
        &state.register.clock,
    )
    .await
}

async fn write_local_bookmark(
    db: &DatabaseConnection,
    library_uuid: &str,
    book_id: i64,
    format: &str,
    locator_key: &str,
    locator: Option<ReaderLocator>,
    present: bool,
    now_ms: u64,
) -> Result<Option<bookmarks::Model>, AppError> {
    let book_id = u64::try_from(book_id)
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| sync_error("Bookmark book ID is invalid"))?;
    let format = format_name(format)?;
    if locator_key.is_empty() {
        return Err(sync_error("Bookmark locator key is empty"));
    }
    let identity = ensure_replica_identity(db, library_uuid).await?;
    let replica_id =
        Uuid::parse_str(&identity.replica_id).map_err(|_| sync_error("Invalid replica ID"))?;
    let txn = db
        .begin()
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;
    let current = SqliteBookmarkRepository::find_state(
        &txn,
        i64::try_from(book_id).expect("validated book ID"),
        &format,
        locator_key,
    )
    .await?;
    let current_is_present = current.as_ref().is_some_and(|row| row.deleted_at.is_none());
    if (present && current_is_present) || (!present && !current_is_present) {
        txn.commit()
            .await
            .map_err(|error| AppError::Database(error.to_string()))?;
        return Ok(if present { current } else { None });
    }

    let (physical_ms, counter) = read_hlc_state(&txn).await?.unwrap_or((0, 0));
    let next = Hlc::next_local(physical_ms, counter, now_ms, replica_id)
        .map_err(|error| sync_error(error.to_string()))?;
    let clock = next
        .encode()
        .map_err(|error| sync_error(error.to_string()))?;
    let locator = if let Some(locator) = locator {
        locator
    } else {
        serde_json::from_str(
            &current
                .as_ref()
                .expect("active bookmark exists for removal")
                .locator_json,
        )
        .map_err(|error| AppError::Serialize(error.to_string()))?
    };
    let state = BookmarkState {
        book_id,
        format: format.clone(),
        locator_key: locator_key.to_owned(),
        register: Lww {
            clock: clock.clone(),
            value: BookmarkValue {
                present,
                id: current.as_ref().map_or_else(
                    || Uuid::new_v4().as_simple().to_string(),
                    |row| row.id.clone(),
                ),
                locator,
                created_at_ms: current.as_ref().map_or(now_ms, |row| row.created_at as u64),
                deleted_at_ms: (!present).then_some(now_ms),
            },
        },
    };
    let model = project_bookmark(&txn, &state).await?;
    write_hlc_state(&txn, next.physical_ms, next.counter).await?;
    enqueue_change(
        &txn,
        &Change {
            change_id: Uuid::new_v4().as_simple().to_string(),
            clock: clock.clone(),
            state: DomainState::Bookmark(state),
        },
    )
    .await?;
    txn.commit()
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;
    info!(
        target: "myreader_sync",
        event = "bookmark.local_write",
        library_uuid,
        replica_id = %identity.replica_id,
        book_id,
        format,
        locator_key,
        present,
        clock,
        "Committed local bookmark state"
    );
    Ok(Some(model))
}

pub async fn add_local_bookmark(
    db: &DatabaseConnection,
    library_uuid: &str,
    book_id: i64,
    format: &str,
    locator_key: &str,
    locator: ReaderLocator,
    now_ms: u64,
) -> Result<bookmarks::Model, AppError> {
    write_local_bookmark(
        db,
        library_uuid,
        book_id,
        format,
        locator_key,
        Some(locator),
        true,
        now_ms,
    )
    .await?
    .ok_or_else(|| AppError::Database("Bookmark add returned no row".into()))
}

pub async fn remove_local_bookmark(
    db: &DatabaseConnection,
    library_uuid: &str,
    book_id: i64,
    format: &str,
    locator_key: &str,
    now_ms: u64,
) -> Result<bool, AppError> {
    Ok(write_local_bookmark(
        db,
        library_uuid,
        book_id,
        format,
        locator_key,
        None,
        false,
        now_ms,
    )
    .await?
    .is_some())
}

pub(super) async fn apply_bookmark_change(
    txn: &DatabaseTransaction,
    segment: &Segment,
    change: &Change,
    incoming: &BookmarkState,
) -> Result<(), AppError> {
    let book_id =
        i64::try_from(incoming.book_id).map_err(|_| sync_error("Bookmark book ID is invalid"))?;
    let current =
        SqliteBookmarkRepository::find_state(txn, book_id, &incoming.format, &incoming.locator_key)
            .await?;
    let current_clock = current
        .as_ref()
        .and_then(|row| row.sync_clock.as_deref())
        .map(str::to_owned);
    let merged = if let Some(current) = current.as_ref().filter(|row| row.sync_clock.is_some()) {
        let locator = serde_json::from_str(&current.locator_json)
            .map_err(|error| AppError::Serialize(error.to_string()))?;
        let current_state = DomainState::Bookmark(BookmarkState {
            book_id: incoming.book_id,
            format: current.format.clone(),
            locator_key: current.locator_key.clone(),
            register: Lww {
                clock: current.sync_clock.clone().expect("filtered sync clock"),
                value: BookmarkValue {
                    present: current.deleted_at.is_none(),
                    id: current.id.clone(),
                    locator,
                    created_at_ms: current.created_at as u64,
                    deleted_at_ms: current.deleted_at.map(|value| value as u64),
                },
            },
        });
        match current_state
            .merge(&DomainState::Bookmark(incoming.clone()))
            .map_err(|error| sync_error(error.to_string()))?
        {
            DomainState::Bookmark(state) => state,
            _ => unreachable!("bookmark merge returns a bookmark"),
        }
    } else {
        incoming.clone()
    };
    project_bookmark(txn, &merged).await?;
    info!(
        target: "myreader_sync",
        event = "bookmark.merge",
        source_replica_id = %segment.replica_id,
        sequence = %segment.sequence,
        change_id = %change.change_id,
        book_id = incoming.book_id,
        format = %incoming.format,
        locator_key = %incoming.locator_key,
        current_clock = ?current_clock,
        incoming_clock = %incoming.register.clock,
        selected_clock = %merged.register.clock,
        selected_source = if merged.register.clock == incoming.register.clock {
            "remote"
        } else {
            "local"
        },
        present = merged.register.value.present,
        "Merged remote bookmark state"
    );
    Ok(())
}
