use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use sea_orm::{
    sea_query::OnConflict, ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait,
    QueryFilter, QueryOrder, Set,
};

use crate::entities::app::{book_cover_thumbnail_cache, book_reading_format, file_state};
use crate::models::{
    BookCoverThumbnailCache, BookCoverThumbnailCachePatch, FileState, FileStateUpdate,
};
use crate::CoreError;

pub(crate) struct ContentRepository<'a> {
    db: &'a DatabaseConnection,
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
            active.local_blake3 = Set(update.local_blake3);
            active.local_size = Set(update.local_size);
            active.local_mtime = Set(update.local_mtime);
            active.updated_at = Set(updated_at);
            active.update(self.db).await?;
        } else {
            file_state::ActiveModel {
                id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
                path: Set(path.to_owned()),
                local_state: Set(update.local_state),
                local_blake3: Set(update.local_blake3),
                local_size: Set(update.local_size),
                local_mtime: Set(update.local_mtime),
                updated_at: Set(updated_at),
            }
            .insert(self.db)
            .await?;
        }
        Ok(())
    }

    pub(crate) async fn delete_file_state(&self, path: &str) -> Result<(), CoreError> {
        file_state::Entity::delete_many()
            .filter(file_state::Column::Path.eq(path))
            .exec(self.db)
            .await?;
        Ok(())
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

impl From<file_state::Model> for FileState {
    fn from(value: file_state::Model) -> Self {
        Self {
            id: value.id,
            path: value.path,
            local_state: value.local_state,
            local_blake3: value.local_blake3,
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
