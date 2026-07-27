use std::collections::BTreeMap;

use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder};

use crate::entities::app::{favorite_books, reading_progress};
use crate::models::ReadingPosition;
use crate::CoreError;

pub(crate) struct ReadingRepository<'a> {
    db: &'a DatabaseConnection,
}

impl<'a> ReadingRepository<'a> {
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
            .order_by_asc(reading_progress::Column::UpdatedAt)
            .all(self.db)
            .await?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
    }

    pub(crate) async fn latest_read_at_by_book(&self) -> Result<BTreeMap<i64, f64>, CoreError> {
        let mut latest = BTreeMap::new();
        for row in reading_progress::Entity::find().all(self.db).await? {
            latest
                .entry(row.book_id)
                .and_modify(|updated_at: &mut f64| {
                    *updated_at = updated_at.max(row.updated_at);
                })
                .or_insert(row.updated_at);
        }
        Ok(latest)
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
