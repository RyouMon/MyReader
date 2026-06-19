use tracing::{error, info};
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::error::AppError;
use crate::utils::paths::library_sidecar_path;
use crate::models::{JsonAny, ReadingProgressDto};
use crate::services::library_service::LibraryService;
use crate::services::progress_service::ProgressService;

#[tauri::command]
#[specta::specta]
pub async fn get_reading_progress(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<Option<ReadingProgressDto>, AppError> {
    info!("Start to get reading progress. library id: {library_id:?}, book id: {book_id}, format: \"{format}\"");
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Config(format!("APP_DATA_DIR_ERROR: {e}")))?;
    let (lib_id, sidecar_root) = {
        let config = state.lock().unwrap_or_else(|e| e.into_inner());
        let lib = LibraryService::resolve_library(library_id.as_deref(), &config)?;
        let sidecar = library_sidecar_path(&lib, &app_data_dir);
        (lib.id.clone(), sidecar.to_string_lossy().to_string())
    };
    let result = ProgressService::get_reading_progress(&sidecar_root, &lib_id, book_id, &format).await;

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
pub async fn set_reading_progress(
    app: AppHandle,
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
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Config(format!("APP_DATA_DIR_ERROR: {e}")))?;
    let sidecar_root = {
        let config = state.lock().unwrap_or_else(|e| e.into_inner());
        let lib = LibraryService::resolve_library(library_id.as_deref(), &config)?;
        library_sidecar_path(&lib, &app_data_dir).to_string_lossy().to_string()
    };
    let result = ProgressService::set_reading_progress(&sidecar_root, book_id, &format, &locator.0).await;

    match &result {
        Ok(()) => info!("Success to set reading progress. book id: {book_id}, format: \"{format}\""),
        Err(err) => error!(
            "Failed to set reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    result
}
