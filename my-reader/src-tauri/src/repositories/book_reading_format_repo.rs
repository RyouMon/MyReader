use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};

use crate::entities::app::book_reading_format;
use crate::error::AppError;

pub struct SqliteBookReadingFormatRepository;

impl SqliteBookReadingFormatRepository {
    pub async fn open(sidecar_root: &str) -> Result<DatabaseConnection, AppError> {
        crate::db::open_db(sidecar_root).await
    }

    pub async fn list(
        db: &DatabaseConnection,
    ) -> Result<Vec<book_reading_format::Model>, AppError> {
        book_reading_format::Entity::find()
            .order_by_asc(book_reading_format::Column::BookId)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub async fn set(db: &DatabaseConnection, book_id: i64, format: &str) -> Result<(), AppError> {
        let existing = book_reading_format::Entity::find()
            .filter(book_reading_format::Column::BookId.eq(book_id))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        let updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0.0, |d| d.as_secs_f64());

        if let Some(model) = existing {
            let mut active: book_reading_format::ActiveModel = model.into();
            active.reading_format = Set(format.to_uppercase());
            active.updated_at = Set(updated_at);
            active
                .update(db)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        } else {
            let id = uuid::Uuid::new_v4().as_simple().to_string();
            book_reading_format::ActiveModel {
                id: Set(id),
                book_id: Set(book_id),
                reading_format: Set(format.to_uppercase()),
                updated_at: Set(updated_at),
            }
            .insert(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }
        Ok(())
    }

    pub async fn clear(db: &DatabaseConnection, book_id: i64) -> Result<(), AppError> {
        book_reading_format::Entity::delete_many()
            .filter(book_reading_format::Column::BookId.eq(book_id))
            .exec(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }
}
