use std::path::Path;

use crate::error::AppError;
use crate::models::AppConfig;
use crate::services::library_service::LibraryService;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct ReadingStatisticsService;

fn timestamp(value: f64, name: &str) -> Result<i64, AppError> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > i64::MAX as f64 {
        return Err(AppError::Config(format!("INVALID_{name}")));
    }
    Ok(value as i64)
}

impl ReadingStatisticsService {
    #[allow(clippy::too_many_arguments)]
    pub async fn add_session_interval_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        id: &str,
        book_id: i64,
        format: &str,
        local_day: &str,
        started_at: f64,
        duration_seconds: i64,
        updated_at: f64,
    ) -> Result<(), AppError> {
        let started_at = timestamp(started_at, "READING_SESSION_STARTED_AT")?;
        let updated_at = timestamp(updated_at, "READING_SESSION_UPDATED_AT")?;
        let library = LibraryService::resolve_library(library_id, config)?;
        myreader_core::api::reading::add_reading_session_interval(
            &library_sidecar_path(&library, app_data_dir),
            &library_root_path(&library, app_data_dir),
            id,
            book_id,
            format,
            local_day,
            started_at,
            duration_seconds,
            updated_at,
        )
        .await?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn add_completion_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        id: &str,
        book_id: i64,
        format: &str,
        local_day: &str,
        completed_at: f64,
        updated_at: f64,
    ) -> Result<bool, AppError> {
        let completed_at = timestamp(completed_at, "READING_COMPLETION_AT")?;
        let updated_at = timestamp(updated_at, "READING_COMPLETION_UPDATED_AT")?;
        let library = LibraryService::resolve_library(library_id, config)?;
        Ok(myreader_core::api::reading::add_reading_completion(
            &library_sidecar_path(&library, app_data_dir),
            &library_root_path(&library, app_data_dir),
            id,
            book_id,
            format,
            local_day,
            completed_at,
            updated_at,
        )
        .await?)
    }
}
