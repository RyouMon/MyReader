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
    ) -> Result<(), AppError> {
        let db = SqliteProgressRepository::open(sidecar_root).await?;
        let json =
            serde_json::to_string(locator).map_err(|e| AppError::Serialize(e.to_string()))?;
        let now = unix_epoch_millis();
        SqliteProgressRepository::set_progress(&db, book_id, format, &json, now).await
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

    pub async fn set_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
    ) -> Result<(), AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::set_reading_progress(&sidecar_root, book_id, format, locator).await
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::models::{AppConfig, LibraryConfig};

    use super::ProgressService;

    fn library_config(id: &str) -> LibraryConfig {
        LibraryConfig {
            id: id.into(),
            name: id.into(),
            path: "/unused".into(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }
    }

    #[tokio::test]
    async fn get_reading_progress_for_library_should_return_saved_progress() {
        let temp_dir = tempfile::tempdir().unwrap();
        let app_data_dir = temp_dir.path();
        let lib = library_config("lib-progress-1");
        let config = AppConfig {
            libraries: vec![lib.clone()],
            active_library_id: Some(lib.id.clone()),
            ..Default::default()
        };
        let locator = json!({"href": "OEBPS/chapter1.xhtml", "locations": {"progression": 0.5}});

        ProgressService::set_reading_progress_for_library(
            app_data_dir,
            &config,
            Some(&lib.id),
            7,
            "EPUB",
            &locator,
        )
        .await
        .expect("set should succeed");

        let dto = ProgressService::get_reading_progress_for_library(
            app_data_dir,
            &config,
            Some(&lib.id),
            7,
            "EPUB",
        )
        .await
        .expect("get should succeed")
        .expect("progress should exist");

        assert_eq!(dto.library_id, lib.id);
        assert_eq!(dto.book_id, 7);
        assert_eq!(dto.format, "EPUB");
        assert_eq!(dto.locator, locator);
    }
}
