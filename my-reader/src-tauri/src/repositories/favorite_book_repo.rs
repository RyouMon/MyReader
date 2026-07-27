use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder,
};

use crate::error::AppError;
use myreader_core::entities::app::favorite_books;

pub struct SqliteFavoriteBookRepository;

impl SqliteFavoriteBookRepository {
    pub async fn open(sidecar_root: &str) -> Result<DatabaseConnection, AppError> {
        myreader_core::database::open_db(sidecar_root)
            .await
            .map_err(Into::into)
    }

    pub async fn list_book_ids(db: &DatabaseConnection) -> Result<Vec<i64>, AppError> {
        let rows = favorite_books::Entity::find()
            .filter(favorite_books::Column::IsFavorite.eq(1))
            .order_by_asc(favorite_books::Column::AddedAt)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(rows.into_iter().map(|row| row.book_id).collect())
    }

    pub async fn find_by_book_id<C>(
        db: &C,
        book_id: i64,
    ) -> Result<Option<favorite_books::Model>, AppError>
    where
        C: ConnectionTrait,
    {
        favorite_books::Entity::find()
            .filter(favorite_books::Column::BookId.eq(book_id))
            .one(db)
            .await
            .map_err(|error| AppError::Database(error.to_string()))
    }
}
