use tauri::{AppHandle, State};

use crate::commands::{common, AppState};
use crate::error::AppError;
use crate::models::{JsonAny, ReaderAnnotationDto};
use crate::services::annotation_service::AnnotationService;
use crate::services::library_service::LibraryService;

#[tauri::command]
#[specta::specta]
pub async fn list_reader_annotations<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<Vec<ReaderAnnotationDto>, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    AnnotationService::list_for_library(
        &app_data_dir,
        &config,
        library_id.as_deref(),
        book_id,
        &format,
    )
    .await
}

#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn add_reader_annotation<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
    locator: JsonAny,
    color: String,
    note: Option<String>,
) -> Result<ReaderAnnotationDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let library = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let annotation = AnnotationService::add_for_library(
        &app_data_dir,
        &config,
        Some(&library.id),
        book_id,
        &format,
        &locator.0,
        &color,
        note.as_deref(),
    )
    .await?;
    common::schedule_sidecar_push(&app, &library.id);
    Ok(annotation)
}

#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn update_reader_annotation<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
    id: String,
    color: String,
    note: Option<String>,
) -> Result<ReaderAnnotationDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let library = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let annotation = AnnotationService::update_for_library(
        &app_data_dir,
        &config,
        Some(&library.id),
        book_id,
        &format,
        &id,
        &color,
        note.as_deref(),
    )
    .await?;
    common::schedule_sidecar_push(&app, &library.id);
    Ok(annotation)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_reader_annotation<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
    id: String,
) -> Result<(), AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let library = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    AnnotationService::delete_for_library(
        &app_data_dir,
        &config,
        Some(&library.id),
        book_id,
        &format,
        &id,
    )
    .await?;
    common::schedule_sidecar_push(&app, &library.id);
    Ok(())
}
