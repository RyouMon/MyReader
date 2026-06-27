use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};

use crate::entities::app::favorite_books;
use crate::error::AppError;

pub struct SqliteFavoriteBookRepository;

impl SqliteFavoriteBookRepository {
    pub async fn open(sidecar_root: &str) -> Result<DatabaseConnection, AppError> {
        crate::db::open_db(sidecar_root).await
    }

    pub async fn list_book_ids(db: &DatabaseConnection) -> Result<Vec<i64>, AppError> {
        let rows = favorite_books::Entity::find()
            .order_by_asc(favorite_books::Column::AddedAt)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(rows.into_iter().map(|row| row.book_id).collect())
    }

    pub async fn add(db: &DatabaseConnection, book_id: i64) -> Result<(), AppError> {
        let existing = favorite_books::Entity::find()
            .filter(favorite_books::Column::BookId.eq(book_id))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        if existing.is_some() {
            return Ok(());
        }

        let added_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0.0, |d| d.as_millis() as f64);
        let active = favorite_books::ActiveModel {
            id: Set(uuid::Uuid::new_v4().as_simple().to_string()),
            book_id: Set(book_id),
            added_at: Set(added_at),
        };
        active
            .insert(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    pub async fn remove(db: &DatabaseConnection, book_id: i64) -> Result<(), AppError> {
        favorite_books::Entity::delete_many()
            .filter(favorite_books::Column::BookId.eq(book_id))
            .exec(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }
}
