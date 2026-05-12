use crate::error::AppError;
use crate::models::ReadingProgressDto;
use crate::repositories::progress_repo::{ReadingProgressRepository, SqliteProgressRepository};

pub struct ProgressService;

fn unix_epoch_millis() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

impl ProgressService {
    pub fn get_reading_progress(
        lib_path: &str,
        lib_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let repo = SqliteProgressRepository::open(lib_path)?;
        repo.get_progress(lib_id, book_id, format)
    }

    pub fn set_reading_progress(
        lib_path: &str,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
    ) -> Result<(), AppError> {
        let repo = SqliteProgressRepository::open(lib_path)?;
        let now = unix_epoch_millis();
        repo.set_progress(book_id, format, locator, now)
    }
}
