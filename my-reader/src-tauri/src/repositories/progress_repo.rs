use std::collections::HashMap;

use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};

use crate::entities::app::reading_progress;
use crate::error::AppError;
use crate::models::ReadingProgressDto;

pub struct SqliteProgressRepository;

impl SqliteProgressRepository {
    pub async fn open(library_path: &str) -> Result<DatabaseConnection, AppError> {
        crate::db::open_db(library_path).await
    }

    pub async fn get_progress(
        db: &DatabaseConnection,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let model = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(book_id))
            .filter(reading_progress::Column::Format.eq(format))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        match model {
            Some(m) => {
                let locator: serde_json::Value = serde_json::from_str(&m.locator_json)
                    .map_err(|e| AppError::Serialize(e.to_string()))?;
                Ok(Some(ReadingProgressDto {
                    library_id: library_id.to_string(),
                    book_id: m.book_id,
                    format: m.format,
                    locator,
                    updated_at: m.updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn set_progress(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_json: &str,
        updated_at: f64,
    ) -> Result<(), AppError> {
        let existing = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(book_id))
            .filter(reading_progress::Column::Format.eq(format))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        if let Some(model) = existing {
            let mut active: reading_progress::ActiveModel = model.into();
            active.locator_json = Set(locator_json.to_string());
            active.updated_at = Set(updated_at);
            active
                .update(db)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        } else {
            let id = uuid::Uuid::new_v4().as_simple().to_string();
            let active = reading_progress::ActiveModel {
                id: Set(id),
                book_id: Set(book_id),
                format: Set(format.to_string()),
                locator_json: Set(locator_json.to_string()),
                updated_at: Set(updated_at),
            };
            active
                .insert(db)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        }
        Ok(())
    }

    pub async fn list_latest_book_updates(
        db: &DatabaseConnection,
    ) -> Result<HashMap<i64, f64>, AppError> {
        let rows = reading_progress::Entity::find()
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut latest = HashMap::new();
        for row in rows {
            latest
                .entry(row.book_id)
                .and_modify(|updated_at: &mut f64| {
                    if row.updated_at > *updated_at {
                        *updated_at = row.updated_at;
                    }
                })
                .or_insert(row.updated_at);
        }
        Ok(latest)
    }
}
