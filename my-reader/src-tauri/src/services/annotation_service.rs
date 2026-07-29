use std::path::Path;

use my_reader_core::models::ReaderAnnotation;

use crate::error::AppError;
use crate::models::{AppConfig, ReaderAnnotationDto};
use crate::services::library_service::LibraryService;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct AnnotationService;

fn annotation_dto(library_id: &str, annotation: ReaderAnnotation) -> ReaderAnnotationDto {
    ReaderAnnotationDto {
        id: annotation.id,
        library_id: library_id.to_owned(),
        book_id: annotation.book_id,
        format: annotation.format,
        kind: annotation.kind,
        locator: annotation.locator,
        color: annotation.color,
        note: annotation.note,
        created_at: annotation.created_at,
        updated_at: annotation.updated_at,
    }
}

impl AnnotationService {
    pub async fn list_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReaderAnnotationDto>, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        Ok(
            my_reader_core::api::reading::ReadingService::list_reader_annotations(
                &sidecar_root,
                book_id,
                format,
            )
            .await?
            .into_iter()
            .map(|annotation| annotation_dto(&library.id, annotation))
            .collect(),
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn add_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        color: &str,
        note: Option<&str>,
    ) -> Result<ReaderAnnotationDto, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        let locator_json = serde_json::to_string(locator)?;
        let annotation = my_reader_core::api::reading::ReadingService::add_reader_annotation(
            &sidecar_root,
            &library_root,
            book_id,
            format,
            &locator_json,
            color,
            note,
            unix_epoch_millis(),
        )
        .await?;
        Ok(annotation_dto(&library.id, annotation))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        id: &str,
        color: &str,
        note: Option<&str>,
    ) -> Result<ReaderAnnotationDto, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        let annotation = my_reader_core::api::reading::ReadingService::update_reader_annotation(
            &sidecar_root,
            &library_root,
            book_id,
            format,
            id,
            color,
            note,
            unix_epoch_millis(),
        )
        .await?;
        Ok(annotation_dto(&library.id, annotation))
    }

    pub async fn delete_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        id: &str,
    ) -> Result<(), AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        my_reader_core::api::reading::ReadingService::remove_reader_annotation(
            &sidecar_root,
            &library_root,
            book_id,
            format,
            id,
            unix_epoch_millis(),
        )
        .await?;
        Ok(())
    }
}

fn unix_epoch_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}
