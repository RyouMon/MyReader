use tracing::{error, info};
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::error::AppError;
use crate::models::JsonAny;
use crate::reader_ui_prefs::ReaderUiPreferences;
use crate::cache;
use crate::config;
use crate::services::library_service::LibraryService;
use crate::services::reader_service::ReaderService;
use crate::streamer::StreamerState;

#[tauri::command]
#[specta::specta]
pub fn write_epub_readium_manifest(
    dir_path: String,
    manifest: JsonAny,
) -> Result<(), AppError> {
    ReaderService::write_epub_readium_manifest(&dir_path, &manifest.0)
}

#[tauri::command]
#[specta::specta]
pub async fn prepare_book_source(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<crate::commands::PreparedBookSource, AppError> {
    info!(
        "Start to prepare book source. library id: {library_id:?}, book id: {book_id}, format: \"{format}\""
    );
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Config(format!("APP_DATA_DIR_ERROR: {e}")))?;
    let (lib_id, lib_path) = {
        let config = state.lock().unwrap_or_else(|e| e.into_inner());
        let (id, path) = LibraryService::resolve_library_path(library_id.as_deref(), &app_data_dir, &config)?;
        drop(config);
        (id, path)
    };

    let result = ReaderService::prepare_book_source(&lib_id, &lib_path, book_id, &format).await;

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
    let session_key = format!(
        "{}-{}",
        cache::sanitize_key_part(&library_id),
        book_id
    );
    let mut streamers = streamer_state.write().await;
    if let Some(mut streamer) = streamers.remove(&session_key) {
        streamer.shutdown();
        info!("Closed EPUB streamer for library: {}, book: {}", library_id, book_id);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_reader_ui_preferences(
    state: State<'_, AppState>,
) -> Result<ReaderUiPreferences, AppError> {
    info!("Start to get reader UI preferences.");
    let config = state.lock().unwrap_or_else(|e| e.into_inner());
    let prefs = ReaderService::get_reader_ui_preferences(&config);
    info!("Success to get reader UI preferences.");
    Ok(prefs)
}

#[tauri::command]
#[specta::specta]
pub fn set_reader_ui_preferences(
    app: AppHandle,
    state: State<'_, AppState>,
    preferences: ReaderUiPreferences,
) -> Result<(), AppError> {
    info!("Start to set reader UI preferences.");
    let mut config = state.lock().unwrap_or_else(|e| e.into_inner());
    ReaderService::set_reader_ui_preferences(&mut config, preferences);
    let config_path = app.path().app_data_dir()?.join("config.json");
    config::save_config(&config_path, &config)?;
    info!("Success to set reader UI preferences.");
    Ok(())
}