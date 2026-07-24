use sea_orm::{sea_query::OnConflict, ConnectionTrait, EntityTrait, Set};

use crate::entities::app::{reading_completions, reading_sessions};
use crate::error::AppError;

pub struct SqliteReadingStatisticsRepository;

impl SqliteReadingStatisticsRepository {
    #[allow(clippy::too_many_arguments)]
    pub async fn write_session_projection<C>(
        db: &C,
        id: &str,
        book_id: i64,
        format: &str,
        local_day: &str,
        started_at: f64,
        duration_seconds: i64,
        updated_at: f64,
    ) -> Result<(), AppError>
    where
        C: ConnectionTrait,
    {
        reading_sessions::Entity::insert(reading_sessions::ActiveModel {
            id: Set(id.to_owned()),
            book_id: Set(book_id),
            format: Set(format.to_owned()),
            local_day: Set(local_day.to_owned()),
            started_at: Set(started_at),
            duration_seconds: Set(duration_seconds),
            updated_at: Set(updated_at),
        })
        .on_conflict(
            OnConflict::column(reading_sessions::Column::Id)
                .update_columns([
                    reading_sessions::Column::BookId,
                    reading_sessions::Column::Format,
                    reading_sessions::Column::LocalDay,
                    reading_sessions::Column::StartedAt,
                    reading_sessions::Column::DurationSeconds,
                    reading_sessions::Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec_without_returning(db)
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn write_completion_projection<C>(
        db: &C,
        id: &str,
        book_id: i64,
        format: &str,
        local_day: &str,
        completed_at: f64,
        updated_at: f64,
    ) -> Result<(), AppError>
    where
        C: ConnectionTrait,
    {
        reading_completions::Entity::insert(reading_completions::ActiveModel {
            id: Set(id.to_owned()),
            book_id: Set(book_id),
            format: Set(format.to_owned()),
            local_day: Set(local_day.to_owned()),
            completed_at: Set(completed_at),
            updated_at: Set(updated_at),
        })
        .on_conflict(
            OnConflict::column(reading_completions::Column::BookId)
                .update_columns([
                    reading_completions::Column::Id,
                    reading_completions::Column::Format,
                    reading_completions::Column::LocalDay,
                    reading_completions::Column::CompletedAt,
                    reading_completions::Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec_without_returning(db)
        .await
        .map_err(|error| AppError::Database(error.to_string()))?;
        Ok(())
    }
}
