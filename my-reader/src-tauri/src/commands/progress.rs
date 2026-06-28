use tauri::{AppHandle, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{JsonAny, ReadingProgressDto};
use crate::services::progress_service::ProgressService;

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

    let result = ProgressService::set_reading_progress_for_library(
        &app_data_dir,
        &config,
        library_id.as_deref(),
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

    result
}
