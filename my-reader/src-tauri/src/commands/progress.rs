use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tracing::{debug, error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{JsonAny, ReadingProgressDto};
use crate::services::library_service::LibraryService;
use crate::services::progress_service::ProgressService;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadingProgressChangedPayload {
    library_id: String,
    book_id: i64,
    format: String,
    locator: serde_json::Value,
}

fn emit_reading_progress_changed<R: tauri::Runtime>(
    app: &AppHandle<R>,
    library_id: &str,
    book_id: i64,
    format: &str,
    locator: &serde_json::Value,
) {
    let payload = ReadingProgressChangedPayload {
        library_id: library_id.to_string(),
        book_id,
        format: format.to_string(),
        locator: locator.clone(),
    };
    if let Err(e) = app.emit("reading_progress", payload) {
        debug!("Failed to emit reading progress event. error: {e}");
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_reading_progress<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<Option<ReadingProgressDto>, AppError> {
    info!("Start to get reading progress. library id: {library_id:?}, book id: {book_id}, format: \"{format}\"");
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);

    let result = ProgressService::get_reading_progress_for_library(
        &app_data_dir,
        &config,
        library_id.as_deref(),
        book_id,
        &format,
    )
    .await;

    match &result {
        Ok(progress) => info!(
            "Success to get reading progress. found: {}, book id: {}, format: \"{}\"",
            progress.is_some(),
            book_id,
            format
        ),
        Err(err) => error!(
            "Failed to get reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn list_reading_progress<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
) -> Result<Vec<ReadingProgressDto>, AppError> {
    info!("Start to list reading progress. library id: {library_id:?}");
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);

    let result = ProgressService::list_reading_progress_for_library(
        &app_data_dir,
        &config,
        library_id.as_deref(),
    )
    .await;

    match &result {
        Ok(rows) => info!("Success to list reading progress. count: {}", rows.len()),
        Err(err) => error!(
            "Failed to list reading progress. requested library id: {library_id:?}, error: {err}"
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn set_reading_progress<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
    locator: JsonAny,
) -> Result<(), AppError> {
    info!(
        "Start to set reading progress. library id: {library_id:?}, book id: {book_id}, format: \"{}\"",
        format
    );
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let resolved_library = LibraryService::resolve_library(library_id.as_deref(), &config)?;

    let result = ProgressService::set_reading_progress_for_library(
        &app_data_dir,
        &config,
        Some(&resolved_library.id),
        book_id,
        &format,
        &locator.0,
    )
    .await;

    match &result {
        Ok(()) => info!("Success to set reading progress. book id: {book_id}, format: \"{format}\""),
        Err(err) => error!(
            "Failed to set reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    if result.is_ok() {
        emit_reading_progress_changed(&app, &resolved_library.id, book_id, &format, &locator.0);
    }

    result
}
