use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use sea_orm::{
    sea_query::OnConflict, ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait,
    QueryFilter, QueryOrder, Set, TransactionTrait,
};

use crate::entities::app::{
    book_cover_thumbnail_cache, book_reading_format, file_state, pending_book_imports,
};
use crate::models::{
    BookCoverThumbnailCache, BookCoverThumbnailCachePatch, FileState, FileStateUpdate,
};
use crate::CoreError;

pub(crate) struct ContentRepository<'a> {
    db: &'a DatabaseConnection,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PendingBookImport {
    pub book_uuid: String,
    pub book_id: i64,
    pub title: String,
    pub authors: Vec<String>,
    pub format: String,
    pub size: i64,
    pub sha256: String,
    pub relative_path: String,
    pub recorded_at_ms: i64,
}

impl<'a> ContentRepository<'a> {
    pub(crate) fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub(crate) async fn list_reading_formats(
        &self,
    ) -> Result<Vec<book_reading_format::Model>, CoreError> {
        Ok(book_reading_format::Entity::find()
            .order_by_asc(book_reading_format::Column::BookId)
            .all(self.db)
            .await?)
    }

    pub(crate) async fn set_reading_format(
        &self,
        book_id: i64,
        format: &str,
    ) -> Result<(), CoreError> {
        let existing = book_reading_format::Entity::find()
            .filter(book_reading_format::Column::BookId.eq(book_id))
            .one(self.db)
            .await?;
        let updated_at = now_seconds();

        if let Some(model) = existing {
            let mut active: book_reading_format::ActiveModel = model.into();
            active.reading_format = Set(format.to_owned());
            active.updated_at = Set(updated_at);
            active.update(self.db).await?;
        } else {
            book_reading_format::ActiveModel {
                id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
                book_id: Set(book_id),
                reading_format: Set(format.to_owned()),
                updated_at: Set(updated_at),
            }
            .insert(self.db)
            .await?;
        }
        Ok(())
    }

    pub(crate) async fn clear_reading_format(&self, book_id: i64) -> Result<(), CoreError> {
        book_reading_format::Entity::delete_many()
            .filter(book_reading_format::Column::BookId.eq(book_id))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub(crate) async fn get_file_state(&self, path: &str) -> Result<Option<FileState>, CoreError> {
        Ok(file_state::Entity::find()
            .filter(file_state::Column::Path.eq(path))
            .one(self.db)
            .await?
            .map(Into::into))
    }

    pub(crate) async fn get_file_states(
        &self,
        paths: &[String],
    ) -> Result<HashMap<String, FileState>, CoreError> {
        if paths.is_empty() {
            return Ok(HashMap::new());
        }
        Ok(file_state::Entity::find()
            .filter(file_state::Column::Path.is_in(paths.iter().cloned()))
            .all(self.db)
            .await?
            .into_iter()
            .map(|row| (row.path.clone(), row.into()))
            .collect())
    }

    pub(crate) async fn list_file_states(&self) -> Result<Vec<FileState>, CoreError> {
        Ok(file_state::Entity::find()
            .order_by_asc(file_state::Column::Path)
            .all(self.db)
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    pub(crate) async fn upsert_file_state(
        &self,
        path: &str,
        update: FileStateUpdate,
    ) -> Result<(), CoreError> {
        let existing = file_state::Entity::find()
            .filter(file_state::Column::Path.eq(path))
            .one(self.db)
            .await?;
        let updated_at = now_seconds();

        if let Some(model) = existing {
            let mut active: file_state::ActiveModel = model.into();
            active.local_state = Set(update.local_state);
            active.local_sha256 = Set(update.local_sha256);
            active.local_size = Set(update.local_size);
            active.local_mtime = Set(update.local_mtime);
            active.updated_at = Set(updated_at);
            active.update(self.db).await?;
        } else {
            file_state::ActiveModel {
                id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
                path: Set(path.to_owned()),
                local_state: Set(update.local_state),
                local_sha256: Set(update.local_sha256),
                local_size: Set(update.local_size),
                local_mtime: Set(update.local_mtime),
                updated_at: Set(updated_at),
            }
            .insert(self.db)
            .await?;
        }
        Ok(())
    }

    pub(crate) async fn upsert_reconciled_file_state(
        &self,
        path: &str,
        update: FileStateUpdate,
    ) -> Result<(), CoreError> {
        let updated_at = now_seconds();
        let updated = file_state::Entity::update_many()
            .set(file_state::ActiveModel {
                local_state: Set(update.local_state.clone()),
                local_sha256: Set(update.local_sha256.clone()),
                local_size: Set(update.local_size),
                local_mtime: Set(update.local_mtime),
                updated_at: Set(updated_at),
                ..Default::default()
            })
            .filter(file_state::Column::Path.eq(path))
            .filter(
                file_state::Column::LocalState.is_not_in(["dirty_push", "remote_delete_pending"]),
            )
            .exec(self.db)
            .await?;
        if updated.rows_affected > 0 {
            return Ok(());
        }

        file_state::Entity::insert(file_state::ActiveModel {
            id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
            path: Set(path.to_owned()),
            local_state: Set(update.local_state),
            local_sha256: Set(update.local_sha256),
            local_size: Set(update.local_size),
            local_mtime: Set(update.local_mtime),
            updated_at: Set(updated_at),
        })
        .on_conflict(
            OnConflict::column(file_state::Column::Path)
                .do_nothing()
                .to_owned(),
        )
        .exec_without_returning(self.db)
        .await?;
        Ok(())
    }

    pub(crate) async fn delete_file_state(&self, path: &str) -> Result<(), CoreError> {
        file_state::Entity::delete_many()
            .filter(file_state::Column::Path.eq(path))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub(crate) async fn list_pending_book_imports(
        &self,
    ) -> Result<Vec<PendingBookImport>, CoreError> {
        pending_book_imports::Entity::find()
            .order_by_asc(pending_book_imports::Column::CreatedAt)
            .all(self.db)
            .await?
            .into_iter()
            .map(PendingBookImport::try_from)
            .collect()
    }

    #[cfg(test)]
    pub(crate) async fn has_pending_book_imports(&self) -> Result<bool, CoreError> {
        Ok(pending_book_imports::Entity::find()
            .one(self.db)
            .await?
            .is_some())
    }

    pub(crate) async fn stage_pending_book_import(
        &self,
        pending: &PendingBookImport,
        local_mtime: i64,
    ) -> Result<(), CoreError> {
        let transaction = self.db.begin().await?;
        let now = now_milliseconds();
        pending_book_imports::ActiveModel {
            book_uuid: Set(pending.book_uuid.clone()),
            book_id: Set(pending.book_id),
            title: Set(pending.title.clone()),
            authors_json: Set(serde_json::to_string(&pending.authors)?),
            format: Set(pending.format.clone()),
            size: Set(pending.size),
            sha256: Set(pending.sha256.clone()),
            relative_path: Set(pending.relative_path.clone()),
            recorded_at_ms: Set(pending.recorded_at_ms),
            created_at: Set(now),
            attempt_count: Set(0),
            last_error: Set(None),
        }
        .insert(&transaction)
        .await?;
        file_state::Entity::insert(file_state::ActiveModel {
            id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
            path: Set(pending.relative_path.clone()),
            local_state: Set("dirty_push".into()),
            local_sha256: Set(Some(pending.sha256.clone())),
            local_size: Set(Some(pending.size)),
            local_mtime: Set(Some(local_mtime)),
            updated_at: Set(now_seconds()),
        })
        .on_conflict(
            OnConflict::column(file_state::Column::Path)
                .update_columns([
                    file_state::Column::LocalState,
                    file_state::Column::LocalSha256,
                    file_state::Column::LocalSize,
                    file_state::Column::LocalMtime,
                    file_state::Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec(&transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    pub(crate) async fn discard_pending_book_import(
        &self,
        book_uuid: &str,
        relative_path: &str,
    ) -> Result<(), CoreError> {
        let transaction = self.db.begin().await?;
        pending_book_imports::Entity::delete_by_id(book_uuid)
            .exec(&transaction)
            .await?;
        file_state::Entity::delete_many()
            .filter(file_state::Column::Path.eq(relative_path))
            .exec(&transaction)
            .await?;
        transaction.commit().await?;
        Ok(())
    }

    pub(crate) async fn record_pending_book_import_failure(
        &self,
        book_uuid: &str,
        error: &str,
    ) -> Result<(), CoreError> {
        let Some(model) = pending_book_imports::Entity::find_by_id(book_uuid)
            .one(self.db)
            .await?
        else {
            return Ok(());
        };
        let attempt_count = model.attempt_count.saturating_add(1);
        let mut active: pending_book_imports::ActiveModel = model.into();
        active.attempt_count = Set(attempt_count);
        active.last_error = Set(Some(error.to_owned()));
        active.update(self.db).await?;
        Ok(())
    }

    pub(crate) async fn delete_pending_book_import(
        &self,
        book_uuid: &str,
    ) -> Result<(), CoreError> {
        pending_book_imports::Entity::delete_by_id(book_uuid)
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub(crate) async fn pending_book_import_exists(
        &self,
        book_uuid: &str,
    ) -> Result<bool, CoreError> {
        Ok(pending_book_imports::Entity::find_by_id(book_uuid)
            .one(self.db)
            .await?
            .is_some())
    }

    pub(crate) async fn list_cover_thumbnail_cache(
        &self,
        thumbnail_version: &str,
        width_px: i64,
        height_px: i64,
    ) -> Result<Vec<BookCoverThumbnailCache>, CoreError> {
        Ok(book_cover_thumbnail_cache::Entity::find()
            .filter(book_cover_thumbnail_cache::Column::ThumbnailVersion.eq(thumbnail_version))
            .filter(book_cover_thumbnail_cache::Column::WidthPx.eq(width_px))
            .filter(book_cover_thumbnail_cache::Column::HeightPx.eq(height_px))
            .order_by_asc(book_cover_thumbnail_cache::Column::BookId)
            .all(self.db)
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    pub(crate) async fn upsert_cover_thumbnail_cache(
        &self,
        patch: BookCoverThumbnailCachePatch,
    ) -> Result<(), CoreError> {
        let now = now_milliseconds();
        book_cover_thumbnail_cache::Entity::insert(book_cover_thumbnail_cache::ActiveModel {
            id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
            book_id: Set(patch.book_id),
            cover_identity: Set(patch.cover_identity),
            thumbnail_version: Set(patch.thumbnail_version),
            width_px: Set(patch.width_px),
            height_px: Set(patch.height_px),
            file_name: Set(patch.file_name),
            file_size_bytes: Set(patch.file_size_bytes),
            created_at: Set(now),
            updated_at: Set(now),
        })
        .on_conflict(
            OnConflict::columns([
                book_cover_thumbnail_cache::Column::BookId,
                book_cover_thumbnail_cache::Column::WidthPx,
                book_cover_thumbnail_cache::Column::HeightPx,
                book_cover_thumbnail_cache::Column::ThumbnailVersion,
            ])
            .update_columns([
                book_cover_thumbnail_cache::Column::CoverIdentity,
                book_cover_thumbnail_cache::Column::FileName,
                book_cover_thumbnail_cache::Column::FileSizeBytes,
                book_cover_thumbnail_cache::Column::UpdatedAt,
            ])
            .to_owned(),
        )
        .exec(self.db)
        .await?;
        Ok(())
    }

    pub(crate) async fn delete_cover_thumbnail_cache(
        &self,
        book_id: i64,
        thumbnail_version: &str,
        width_px: i64,
        height_px: i64,
    ) -> Result<(), CoreError> {
        book_cover_thumbnail_cache::Entity::delete_many()
            .filter(book_cover_thumbnail_cache::Column::BookId.eq(book_id))
            .filter(book_cover_thumbnail_cache::Column::ThumbnailVersion.eq(thumbnail_version))
            .filter(book_cover_thumbnail_cache::Column::WidthPx.eq(width_px))
            .filter(book_cover_thumbnail_cache::Column::HeightPx.eq(height_px))
            .exec(self.db)
            .await?;
        Ok(())
    }

    pub(crate) async fn clear_cover_thumbnail_cache(&self) -> Result<(), CoreError> {
        book_cover_thumbnail_cache::Entity::delete_many()
            .exec(self.db)
            .await?;
        Ok(())
    }
}

impl TryFrom<pending_book_imports::Model> for PendingBookImport {
    type Error = CoreError;

    fn try_from(value: pending_book_imports::Model) -> Result<Self, Self::Error> {
        Ok(Self {
            book_uuid: value.book_uuid,
            book_id: value.book_id,
            title: value.title,
            authors: serde_json::from_str(&value.authors_json)?,
            format: value.format,
            size: value.size,
            sha256: value.sha256,
            relative_path: value.relative_path,
            recorded_at_ms: value.recorded_at_ms,
        })
    }
}

impl From<file_state::Model> for FileState {
    fn from(value: file_state::Model) -> Self {
        Self {
            id: value.id,
            path: value.path,
            local_state: value.local_state,
            local_sha256: value.local_sha256,
            local_size: value.local_size,
            local_mtime: value.local_mtime,
            updated_at: value.updated_at,
        }
    }
}

impl From<book_cover_thumbnail_cache::Model> for BookCoverThumbnailCache {
    fn from(value: book_cover_thumbnail_cache::Model) -> Self {
        Self {
            id: value.id,
            book_id: value.book_id,
            cover_identity: value.cover_identity,
            thumbnail_version: value.thumbnail_version,
            width_px: value.width_px,
            height_px: value.height_px,
            file_name: value.file_name,
            file_size_bytes: value.file_size_bytes,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

fn now_seconds() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |duration| duration.as_secs_f64())
}

fn now_milliseconds() -> f64 {
    now_seconds() * 1000.0
}
