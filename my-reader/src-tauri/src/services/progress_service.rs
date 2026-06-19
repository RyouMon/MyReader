use crate::error::AppError;
use crate::models::ReadingProgressDto;
use crate::repositories::progress_repo::SqliteProgressRepository;

pub struct ProgressService;

fn unix_epoch_millis() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

impl ProgressService {
    pub async fn get_reading_progress(
        sidecar_root: &str,
        lib_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        SqliteProgressRepository::get_progress(&db, lib_id, book_id, format).await
    }

    pub async fn set_reading_progress(
        sidecar_root: &str,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
    ) -> Result<(), AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        let json = serde_json::to_string(locator)
            .map_err(|e| AppError::Serialize(e.to_string()))?;
        let now = unix_epoch_millis();
        SqliteProgressRepository::set_progress(&db, book_id, format, &json, now).await
    }
}