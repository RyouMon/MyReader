use std::path::Path;

use crate::entities::app::annotations;
use crate::error::AppError;
use crate::models::{is_valid_reader_locator, AppConfig, ReaderAnnotationDto};
use crate::repositories::annotation_repo::SqliteAnnotationRepository;
use crate::services::library_service::LibraryService;
use crate::utils::paths::library_sidecar_path;

const HIGHLIGHT_KIND: &str = "highlight";
const ANNOTATION_COLORS: [&str; 4] = ["yellow", "orange", "green", "blue"];
const MAX_NOTE_CHARACTERS: usize = 4_000;

pub struct AnnotationService;

fn unix_epoch_millis() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as f64)
        .unwrap_or(0.0)
}

fn normalize_format(format: &str) -> Result<String, AppError> {
    let normalized = format.trim().to_ascii_uppercase();
    if normalized.is_empty() {
        return Err(AppError::Config("INVALID_ANNOTATION_FORMAT".into()));
    }
    Ok(normalized)
}

fn validate_locator(locator: &serde_json::Value) -> Result<(), AppError> {
    let highlight = locator
        .get("text")
        .and_then(|text| text.get("highlight"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if !is_valid_reader_locator(locator) || highlight.is_empty() {
        return Err(AppError::Config("INVALID_ANNOTATION_LOCATOR".into()));
    }
    Ok(())
}

fn validate_color(color: &str) -> Result<&str, AppError> {
    if ANNOTATION_COLORS.contains(&color) {
        Ok(color)
    } else {
        Err(AppError::Config("INVALID_ANNOTATION_COLOR".into()))
    }
}

fn normalize_note(note: Option<&str>) -> Result<Option<String>, AppError> {
    let note = note.map(str::trim).filter(|note| !note.is_empty());
    if note.is_some_and(|note| note.chars().count() > MAX_NOTE_CHARACTERS) {
        return Err(AppError::Config("ANNOTATION_NOTE_TOO_LONG".into()));
    }
    Ok(note.map(ToString::to_string))
}

fn annotation_dto(
    library_id: &str,
    model: annotations::Model,
) -> Result<ReaderAnnotationDto, AppError> {
    let locator = serde_json::from_str(&model.locator_json)
        .map_err(|error| AppError::Serialize(error.to_string()))?;
    Ok(ReaderAnnotationDto {
        id: model.id,
        library_id: library_id.to_string(),
        book_id: model.book_id,
        format: model.format,
        kind: model.kind,
        locator,
        color: model.color,
        note: model.note,
        created_at: model.created_at,
        updated_at: model.updated_at,
    })
}

impl AnnotationService {
    pub async fn list(
        sidecar_root: &str,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReaderAnnotationDto>, AppError> {
        let format = normalize_format(format)?;
        let db = SqliteAnnotationRepository::open(sidecar_root).await?;
        SqliteAnnotationRepository::list(&db, book_id, &format)
            .await?
            .into_iter()
            .map(|model| annotation_dto(library_id, model))
            .collect()
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn add(
        sidecar_root: &str,
        library_id: &str,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        color: &str,
        note: Option<&str>,
    ) -> Result<ReaderAnnotationDto, AppError> {
        let format = normalize_format(format)?;
        validate_locator(locator)?;
        let color = validate_color(color)?;
        let note = normalize_note(note)?;
        let locator_json = serde_json::to_string(locator)
            .map_err(|error| AppError::Serialize(error.to_string()))?;
        let db = SqliteAnnotationRepository::open(sidecar_root).await?;
        let model = SqliteAnnotationRepository::insert(
            &db,
            &uuid::Uuid::new_v4().as_simple().to_string(),
            book_id,
            &format,
            HIGHLIGHT_KIND,
            &locator_json,
            color,
            note.as_deref(),
            unix_epoch_millis(),
        )
        .await?;
        annotation_dto(library_id, model)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update(
        sidecar_root: &str,
        library_id: &str,
        book_id: i64,
        format: &str,
        id: &str,
        color: &str,
        note: Option<&str>,
    ) -> Result<ReaderAnnotationDto, AppError> {
        let format = normalize_format(format)?;
        let color = validate_color(color)?;
        let note = normalize_note(note)?;
        let db = SqliteAnnotationRepository::open(sidecar_root).await?;
        let model = SqliteAnnotationRepository::update(
            &db,
            id,
            book_id,
            &format,
            color,
            note.as_deref(),
            unix_epoch_millis(),
        )
        .await?
        .ok_or_else(|| AppError::NotFound("ANNOTATION_NOT_FOUND".into()))?;
        annotation_dto(library_id, model)
    }

    pub async fn delete(
        sidecar_root: &str,
        book_id: i64,
        format: &str,
        id: &str,
    ) -> Result<(), AppError> {
        let format = normalize_format(format)?;
        let db = SqliteAnnotationRepository::open(sidecar_root).await?;
        if SqliteAnnotationRepository::tombstone(&db, id, book_id, &format, unix_epoch_millis())
            .await?
        {
            Ok(())
        } else {
            Err(AppError::NotFound("ANNOTATION_NOT_FOUND".into()))
        }
    }

    pub async fn list_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReaderAnnotationDto>, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::list(&sidecar_root, &library.id, book_id, format).await
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
        let sidecar_root = library_sidecar_path(&library, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::add(
            &sidecar_root,
            &library.id,
            book_id,
            format,
            locator,
            color,
            note,
        )
        .await
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
        let sidecar_root = library_sidecar_path(&library, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::update(&sidecar_root, &library.id, book_id, format, id, color, note).await
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
        let sidecar_root = library_sidecar_path(&library, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::delete(&sidecar_root, book_id, format, id).await
    }
}
