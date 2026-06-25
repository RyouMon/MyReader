use tracing::{error, info};
use tauri::{AppHandle, State};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{JsonAny, ReadingProgressDto};
use crate::services::library_service::LibraryService;
use crate::services::progress_service::ProgressService;
use crate::utils::paths::library_sidecar_path;

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
    let lib = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let sidecar_root = library_sidecar_path(&lib, &app_data_dir)
        .to_string_lossy()
        .to_string();
    let lib_id = lib.id.clone();

    let result =
        ProgressService::get_reading_progress(&sidecar_root, &lib_id, book_id, &format).await;

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
    let lib = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let sidecar_root = library_sidecar_path(&lib, &app_data_dir)
        .to_string_lossy()
        .to_string();

    let result =
        ProgressService::set_reading_progress(&sidecar_root, book_id, &format, &locator.0).await;

    match &result {
        Ok(()) => info!("Success to set reading progress. book id: {book_id}, format: \"{format}\""),
        Err(err) => error!(
            "Failed to set reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    result
}
