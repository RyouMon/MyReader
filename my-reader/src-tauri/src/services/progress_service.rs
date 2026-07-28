use std::path::Path;

use crate::error::AppError;
use crate::models::{AppConfig, ReadingProgressDto};
use crate::services::library_service::LibraryService;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct ProgressService;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPositionCandidateDto {
    pub operation_id: String,
    #[specta(type = specta_typescript::Any)]
    pub locator: serde_json::Value,
    pub display_progression: Option<f64>,
    pub recorded_at: i64,
    pub replica_id: String,
}

fn unix_epoch_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}

fn progress_dto(
    library_id: &str,
    value: my_reader_core::models::ReadingPosition,
) -> ReadingProgressDto {
    ReadingProgressDto {
        library_id: library_id.to_owned(),
        book_id: value.book_id,
        format: value.format,
        locator: value.locator,
        display_progression: value.display_progression,
        updated_at: value.updated_at,
    }
}

impl ProgressService {
    pub async fn get_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        Ok(
            my_reader_core::api::reading::get_reading_position(&sidecar_root, book_id, format)
                .await?
                .map(|value| progress_dto(&library.id, value)),
        )
    }

    pub async fn list_reading_progress_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
    ) -> Result<Vec<ReadingProgressDto>, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        Ok(
            my_reader_core::api::reading::list_reading_positions(&sidecar_root)
                .await?
                .into_iter()
                .map(|value| progress_dto(&library.id, value))
                .collect(),
        )
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
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        my_reader_core::api::reading::set_reading_position(
            &sidecar_root,
            &library_root,
            book_id,
            format,
            &serde_json::to_string(locator)?,
            display_progression,
            unix_epoch_millis(),
        )
        .await?;
        Ok(())
    }

    pub async fn list_reading_position_candidates_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReadingPositionCandidateDto>, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        Ok(
            my_reader_core::api::reading::list_reading_position_candidates(
                &sidecar_root,
                &library_root,
                book_id,
                format,
                unix_epoch_millis(),
            )
            .await?
            .into_iter()
            .map(|candidate| ReadingPositionCandidateDto {
                operation_id: candidate.operation_id,
                locator: candidate.locator,
                display_progression: candidate.display_progression,
                recorded_at: candidate.recorded_at,
                replica_id: candidate.replica_id,
            })
            .collect(),
        )
    }

    pub async fn select_reading_position_candidate_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        operation_id: &str,
    ) -> Result<(), AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        my_reader_core::api::reading::select_reading_position_candidate(
            &sidecar_root,
            &library_root,
            book_id,
            format,
            operation_id,
            unix_epoch_millis(),
        )
        .await?;
        Ok(())
    }
}
