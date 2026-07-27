use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder};

use crate::entities::app::favorite_books;
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
}
