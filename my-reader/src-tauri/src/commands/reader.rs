use tauri::{AppHandle, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::JsonAny;
use crate::reader_ui_prefs::ReaderUiPreferences;
use crate::services::library_service::LibraryService;
use crate::services::reader_service::ReaderService;
use crate::streamer::StreamerState;

#[tauri::command]
#[specta::specta]
pub fn write_epub_readium_manifest(dir_path: String, manifest: JsonAny) -> Result<(), AppError> {
    ReaderService::write_epub_readium_manifest(&dir_path, &manifest.0)
}

#[tauri::command]
#[specta::specta]
pub async fn prepare_book_source<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<crate::commands::PreparedBookSource, AppError> {
    info!(
        "Start to prepare book source. library id: {library_id:?}, book id: {book_id}, format: \"{format}\""
    );
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let lib = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let lib_id = lib.id.clone();
    let lib_path = crate::utils::paths::library_root_path(&lib, &app_data_dir)
        .to_string_lossy()
        .to_string();
    let is_remote = lib.is_remote();

    let result =
        ReaderService::prepare_book_source(&lib_id, &lib_path, is_remote, book_id, &format).await;

    match &result {
        Ok(src) => info!(
            "Success to prepare book source. format: \"{}\", has extracted dir: {}, entries: {}",
            src.format,
            src.extracted_dir_path.is_some(),
            src.extracted_entries.len()
        ),
        Err(err) => error!(
            "Failed to prepare book source. library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub async fn close_book_streamer(
    streamer_state: State<'_, StreamerState>,
    library_id: String,
    book_id: i64,
) -> Result<(), AppError> {
    ReaderService::close_streamer(&streamer_state, &library_id, book_id).await;
    info!(
        "Closed EPUB streamer for library: {}, book: {}",
        library_id, book_id
    );
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_reader_ui_preferences(
    state: State<'_, AppState>,
) -> Result<ReaderUiPreferences, AppError> {
    info!("Start to get reader UI preferences.");
    let config = common::config_snapshot(&state);
    let prefs = ReaderService::get_reader_ui_preferences(&config);
    info!("Success to get reader UI preferences.");
    Ok(prefs)
}

#[tauri::command]
#[specta::specta]
pub fn set_reader_ui_preferences<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    preferences: ReaderUiPreferences,
) -> Result<(), AppError> {
    info!("Start to set reader UI preferences.");
    common::with_config_mut(&state, |config| {
        ReaderService::set_reader_ui_preferences(config, preferences);
    });
    let snapshot = common::config_snapshot(&state);
    common::persist_config(&app, &snapshot)?;
    info!("Success to set reader UI preferences.");
    Ok(())
}
