use log::{error, info};
use tauri::State;

use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{JsonAny, ReadingProgressDto};
use crate::services::library_service::LibraryService;
use crate::services::progress_service::ProgressService;

#[tauri::command]
#[specta::specta]
pub fn get_reading_progress(
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<Option<ReadingProgressDto>, AppError> {
    info!("Start to get reading progress. library id: {library_id:?}, book id: {book_id}, format: \"{format}\"");
    let result = (|| {
        let config = state.lock().unwrap_or_else(|e| e.into_inner());
        let (lib_id, lib_path) = LibraryService::resolve_library_path(library_id.as_deref(), &config)?;
        drop(config);
        ProgressService::get_reading_progress(&lib_path, &lib_id, book_id, &format)
    })();

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
pub fn set_reading_progress(
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
    let result = (|| {
        let config = state.lock().unwrap_or_else(|e| e.into_inner());
        let (_, lib_path) = LibraryService::resolve_library_path(library_id.as_deref(), &config)?;
        drop(config);
        ProgressService::set_reading_progress(&lib_path, book_id, &format, &locator.0)
    })();

    match &result {
        Ok(()) => info!("Success to set reading progress. book id: {book_id}, format: \"{format}\""),
        Err(err) => error!(
            "Failed to set reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    result
}
