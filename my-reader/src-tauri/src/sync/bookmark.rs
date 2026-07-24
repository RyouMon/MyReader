use sea_orm::DatabaseConnection;
use tracing::info;
use uuid::Uuid;

use crate::entities::app::bookmarks;
use crate::error::AppError;
use crate::repositories::bookmark_repo::SqliteBookmarkRepository;

use super::automerge_document::{bookmark_projections, set_bookmark, BookmarkValue};
use super::automerge_projection::LibrarySidecarAutomergeProjection;
use super::automerge_store::commit_library_sidecar_automerge_mutation;
use super::reader_locator::ReaderLocator;
use super::replica_identity::ensure_replica_identity;

fn format_name(format: &str) -> Result<String, AppError> {
    let value = format.trim().to_uppercase();
    if !matches!(value.as_str(), "EPUB" | "PDF" | "CBZ") {
        return Err(AppError::Sync("Bookmark format is unsupported".into()));
    }
    Ok(value)
}

#[allow(clippy::too_many_arguments)]
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
    if book_id < 1 || locator_key.is_empty() {
        return Err(AppError::Sync("Bookmark identity is invalid".into()));
    }
    let format = format_name(format)?;
    let identity = ensure_replica_identity(db, library_uuid).await?;
    let projection = LibrarySidecarAutomergeProjection;
    let mut existed = false;
    commit_library_sidecar_automerge_mutation(
        db,
        &identity,
        now_ms,
        |document| {
            let current = bookmark_projections(document)?.into_iter().find(|item| {
                item.book_id == book_id && item.format == format && item.locator_key == locator_key
            });
            let current_is_present = current
                .as_ref()
                .is_some_and(|item| item.deleted_at.is_none());
            if (present && current_is_present) || (!present && !current_is_present) {
                existed = current_is_present;
                return Ok(());
            }
            existed = current.is_some();
            let locator_json = match locator.as_ref() {
                Some(locator) => serde_json::to_string(locator)
                    .map_err(|error| AppError::Serialize(error.to_string()))?,
                None => current
                    .as_ref()
                    .map(|value| value.locator_json.clone())
                    .ok_or_else(|| AppError::NotFound("BOOKMARK_NOT_FOUND".into()))?,
            };
            set_bookmark(
                document,
                &BookmarkValue {
                    id: current.as_ref().map_or_else(
                        || Uuid::new_v4().as_simple().to_string(),
                        |value| value.id.clone(),
                    ),
                    book_id,
                    format: format.clone(),
                    locator_key: locator_key.to_owned(),
                    locator_json,
                    created_at: current
                        .as_ref()
                        .map_or(now_ms as i64, |value| value.created_at),
                    deleted_at: (!present).then_some(now_ms as i64),
                    recorded_at: now_ms as i64,
                    replica_id: identity.replica_id.clone(),
                },
            )?;
            Ok(())
        },
        Some(&projection),
    )
    .await?;
    info!(
        target: "myreader_sync",
        event = "bookmark.local_write",
        library_uuid,
        replica_id = %identity.replica_id,
        book_id,
        format,
        locator_key,
        present,
        "Committed local bookmark state"
    );
    if present {
        SqliteBookmarkRepository::find_state(db, book_id, &format, locator_key).await
    } else if existed {
        Ok(SqliteBookmarkRepository::find_state(db, book_id, &format, locator_key).await?)
    } else {
        Ok(None)
    }
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

#[cfg(test)]
mod tests {
    use sea_orm::{Database, EntityTrait};
    use sea_orm_migration::MigratorTrait;

    use crate::entities::app::{bookmarks, sync_automerge_outbox};
    use crate::migration::LibraryMigrator;

    use super::*;

    #[tokio::test]
    async fn should_persist_projection_and_outbox_when_bookmark_is_added() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        LibraryMigrator::up(&db, None).await.unwrap();
        let locator: ReaderLocator =
            serde_json::from_str(r#"{"href":"chapter.xhtml","type":"application/xhtml+xml"}"#)
                .unwrap();

        add_local_bookmark(
            &db,
            "018f2f8d-980b-40ef-b72e-c6e86cb7cc28",
            42,
            "EPUB",
            "chapter.xhtml",
            locator,
            900,
        )
        .await
        .unwrap();

        let row = bookmarks::Entity::find().one(&db).await.unwrap().unwrap();
        assert_eq!(row.book_id, 42);
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
