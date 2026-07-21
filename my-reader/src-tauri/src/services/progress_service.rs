use std::path::Path;

use crate::error::AppError;
use crate::models::{AppConfig, ReadingProgressDto};
use crate::repositories::progress_repo::SqliteProgressRepository;
use crate::services::library_service::LibraryService;
use crate::utils::paths::library_sidecar_path;

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
        display_progression: Option<f64>,
    ) -> Result<(), AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        let json =
            serde_json::to_string(locator).map_err(|e| AppError::Serialize(e.to_string()))?;
        let now = unix_epoch_millis();
        SqliteProgressRepository::set_progress(
            &db,
            book_id,
            format,
            &json,
            display_progression,
            now,
        )
        .await
    }

    pub async fn list_reading_progress(
        sidecar_root: &str,
        lib_id: &str,
    ) -> Result<Vec<ReadingProgressDto>, AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        SqliteProgressRepository::list_all_progress(&db, lib_id).await
    }

    pub async fn get_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        let lib_id = lib.id.clone();
        Self::get_reading_progress(&sidecar_root, &lib_id, book_id, format).await
    }

    pub async fn list_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
    ) -> Result<Vec<ReadingProgressDto>, AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        let lib_id = lib.id.clone();
        Self::list_reading_progress(&sidecar_root, &lib_id).await
    }

    pub async fn set_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        display_progression: Option<f64>,
    ) -> Result<(), AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::set_reading_progress(&sidecar_root, book_id, format, locator, display_progression)
            .await
    }
}
