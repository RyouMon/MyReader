use std::path::Path;

use crate::error::AppError;
use crate::models::{AppConfig, ReadingProgressDto};
use crate::repositories::{
    calibre_repo::CalibreBookRepository, progress_repo::SqliteProgressRepository,
};
use crate::services::library_service::LibraryService;
use crate::sync::{
    contract::ReaderLocator, kernel::read_replica_identity, reading_position::write_local_position,
};
use crate::utils::paths::{library_root_path, library_sidecar_path};

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

    async fn set_reading_progress_in_db(
        db: &sea_orm::DatabaseConnection,
        library_uuid: &str,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        display_progression: Option<f64>,
    ) -> Result<(), AppError> {
        let locator: ReaderLocator = serde_json::from_value(locator.clone())
            .map_err(|error| AppError::Serialize(error.to_string()))?;
        write_local_position(
            db,
            library_uuid,
            book_id,
            format,
            locator,
            display_progression,
            unix_epoch_millis() as u64,
        )
        .await
    }

    pub async fn set_reading_progress(
        sidecar_root: &str,
        library_uuid: &str,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        display_progression: Option<f64>,
    ) -> Result<(), AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        Self::set_reading_progress_in_db(
            &db,
            library_uuid,
            book_id,
            format,
            locator,
            display_progression,
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
        let db = SqliteProgressRepository::open(&sidecar_root).await?;
        let library_uuid = match read_replica_identity(&db).await? {
            Some(identity) => identity.library_uuid,
            None => {
                let library_root = library_root_path(&lib, app_data_dir)
                    .to_string_lossy()
                    .to_string();
                CalibreBookRepository::open(&library_root)
                    .await?
                    .get_library_uuid()
                    .await?
            }
        };
        Self::set_reading_progress_in_db(
            &db,
            &library_uuid,
            book_id,
            format,
            locator,
            display_progression,
        )
        .await
    }
}
