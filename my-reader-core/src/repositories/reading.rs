use std::collections::BTreeMap;

use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, DbBackend, EntityTrait, QueryFilter,
    QueryOrder, Statement,
};

use crate::entities::app::{
    annotations, bookmarks, favorite_books, reading_completions, reading_progress, reading_sessions,
};
use crate::models::{LegacyFinishedReading, ReaderAnnotation, ReaderBookmark, ReadingPosition};
use crate::CoreError;

pub(crate) struct ReadingRepository<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> ReadingRepository<'a> {
    pub(crate) async fn list_position_candidates(
        &self,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<crate::models::ReadingPositionCandidate>, CoreError> {
        self.db.query_all_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT operation_id, locator_json, display_progression, recorded_at, replica_id FROM reading_position_candidates WHERE book_id = ? AND format = ? ORDER BY operation_id",
            [book_id.into(), format.into()],
        )).await?.into_iter().map(|row| Ok(crate::models::ReadingPositionCandidate {
            operation_id: row.try_get("", "operation_id")?,
            locator: serde_json::from_str(&row.try_get::<String>("", "locator_json")?)?,
            display_progression: row.try_get("", "display_progression")?,
            recorded_at: row.try_get("", "recorded_at")?,
            replica_id: row.try_get("", "replica_id")?,
            is_local: false,
        })).collect()
    }
    pub(crate) fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub(crate) async fn list_favorite_book_ids(&self) -> Result<Vec<i64>, CoreError> {
        Ok(favorite_books::Entity::find()
            .filter(favorite_books::Column::IsFavorite.eq(1))
            .order_by_asc(favorite_books::Column::AddedAt)
            .all(self.db)
            .await?
            .into_iter()
            .map(|row| row.book_id)
            .collect())
    }

    pub(crate) async fn get_reading_position(
        &self,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingPosition>, CoreError> {
        reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(book_id))
            .filter(reading_progress::Column::Format.eq(format))
            .one(self.db)
            .await?
            .map(TryInto::try_into)
            .transpose()
    }

    pub(crate) async fn list_reading_positions(&self) -> Result<Vec<ReadingPosition>, CoreError> {
        reading_progress::Entity::find()
            .all(self.db)
            .await?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    pub(crate) async fn latest_read_at_by_book(&self) -> Result<BTreeMap<i64, f64>, CoreError> {
        self.db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT book_id, CAST(MAX(updated_at) AS REAL) AS latest_read_at
             FROM reading_progress GROUP BY book_id",
            ))
            .await?
            .into_iter()
            .map(|row| {
                Ok((
                    row.try_get("", "book_id")?,
                    row.try_get("", "latest_read_at")?,
                ))
            })
            .collect()
    }

    pub(crate) async fn list_bookmarks(
        &self,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReaderBookmark>, CoreError> {
        bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(book_id))
            .filter(bookmarks::Column::Format.eq(format))
            .filter(bookmarks::Column::DeletedAt.is_null())
            .order_by_asc(bookmarks::Column::CreatedAt)
            .all(self.db)
            .await?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    pub(crate) async fn find_bookmark(
        &self,
        book_id: i64,
        format: &str,
        locator_key: &str,
    ) -> Result<Option<ReaderBookmark>, CoreError> {
        bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(book_id))
            .filter(bookmarks::Column::Format.eq(format))
            .filter(bookmarks::Column::LocatorKey.eq(locator_key))
            .filter(bookmarks::Column::DeletedAt.is_null())
            .one(self.db)
            .await?
            .map(TryInto::try_into)
            .transpose()
    }

    pub(crate) async fn list_annotations(
        &self,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReaderAnnotation>, CoreError> {
        annotations::Entity::find()
            .filter(annotations::Column::BookId.eq(book_id))
            .filter(annotations::Column::Format.eq(format))
            .filter(annotations::Column::DeletedAt.is_null())
            .order_by_asc(annotations::Column::CreatedAt)
            .all(self.db)
            .await?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    pub(crate) async fn find_annotation(
        &self,
        id: &str,
    ) -> Result<Option<ReaderAnnotation>, CoreError> {
        annotations::Entity::find_by_id(id)
            .filter(annotations::Column::DeletedAt.is_null())
            .one(self.db)
            .await?
            .map(TryInto::try_into)
            .transpose()
    }

    pub(crate) async fn list_reading_sessions_by_day_range(
        &self,
        start_day: &str,
        end_day: &str,
    ) -> Result<Vec<reading_sessions::Model>, CoreError> {
        Ok(reading_sessions::Entity::find()
            .filter(reading_sessions::Column::LocalDay.gte(start_day))
            .filter(reading_sessions::Column::LocalDay.lte(end_day))
            .all(self.db)
            .await?)
    }

    pub(crate) async fn list_reading_completions_by_day_range(
        &self,
        start_day: &str,
        end_day: &str,
    ) -> Result<Vec<reading_completions::Model>, CoreError> {
        Ok(reading_completions::Entity::find()
            .filter(reading_completions::Column::LocalDay.gte(start_day))
            .filter(reading_completions::Column::LocalDay.lte(end_day))
            .all(self.db)
            .await?)
    }

    pub(crate) async fn list_legacy_finished_readings(
        &self,
    ) -> Result<Vec<LegacyFinishedReading>, CoreError> {
        let completed_book_ids = reading_completions::Entity::find()
            .all(self.db)
            .await?
            .into_iter()
            .map(|row| row.book_id)
            .collect::<std::collections::BTreeSet<_>>();
        Ok(reading_progress::Entity::find()
            .filter(reading_progress::Column::DisplayProgression.eq(1.0))
            .order_by_asc(reading_progress::Column::UpdatedAt)
            .all(self.db)
            .await?
            .into_iter()
            .filter(|row| !completed_book_ids.contains(&row.book_id))
            .map(|row| LegacyFinishedReading {
                book_id: row.book_id,
                format: row.format,
                updated_at: row.updated_at,
            })
            .collect())
    }
}

impl TryFrom<reading_progress::Model> for ReadingPosition {
    type Error = CoreError;

    fn try_from(value: reading_progress::Model) -> Result<Self, Self::Error> {
        Ok(Self {
            book_id: value.book_id,
            format: value.format,
            locator: serde_json::from_str(&value.locator_json)?,
            display_progression: value.display_progression,
            updated_at: value.updated_at,
            conflict_count: value.sync_conflict_count,
        })
    }
}

impl TryFrom<bookmarks::Model> for ReaderBookmark {
    type Error = CoreError;

    fn try_from(value: bookmarks::Model) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            book_id: value.book_id,
            format: value.format,
            locator_key: value.locator_key,
            locator: serde_json::from_str(&value.locator_json)?,
            created_at: value.created_at,
            updated_at: value.updated_at,
        })
    }
}

impl TryFrom<annotations::Model> for ReaderAnnotation {
    type Error = CoreError;

    fn try_from(value: annotations::Model) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            book_id: value.book_id,
            format: value.format,
            kind: value.kind,
            locator: serde_json::from_str(&value.locator_json)?,
            color: value.color,
            note: value.note,
            created_at: value.created_at,
            updated_at: value.updated_at,
        })
    }
}
