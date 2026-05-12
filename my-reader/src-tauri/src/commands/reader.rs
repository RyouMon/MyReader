use log::{error, info};
use tauri::{AppHandle, Manager, State};

use crate::commands::{AppState, PreparedBookSource};
use crate::error::AppError;
use crate::models::JsonAny;
use crate::reader_ui_prefs::ReaderUiPreferences;
use crate::repositories::cache_repo;
use crate::repositories::config_repo;
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
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<PreparedBookSource, AppError> {
    info!(
        "Start to prepare book source. library id: {:?}, book id: {}, format: \"{}\"",
        library_id, book_id, format
    );

    let (lib_id, lib_path) = {
        let config = state.lock().unwrap();
        let (id, path) = LibraryService::resolve_library_path(library_id.as_deref(), &config)?;
        drop(config);
        (id, path)
    };

    let lib_id_clone = lib_id.clone();
    let format_clone = format.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        ReaderService::prepare_book_source(&lib_id_clone, &lib_path, book_id, &format_clone
        )
    })
    .await
    .map_err(|e| AppError::Task(e.to_string()))?;

    match &result {
        Ok(source) => info!(
            "Success to prepare book source. format: \"{}\", has extracted dir: {}, entries: {}",
            source.format,
            source.extracted_dir_path.is_some(),
            source.extracted_entries.len()
        ),
        Err(err) => error!(
            "Failed to prepare book source. library id: {:?}, book id: {}, format: \"{}\", error: {err}",
            library_id, book_id, format
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
        cache_repo::sanitize_key_part(&library_id),
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
    let result = (|| {
        let config = state.lock().unwrap();
        Ok(ReaderService::get_reader_ui_preferences(&config))
    })();
    match &result {
        Ok(prefs) => info!(
            "Success to get reader UI preferences. version: {}",
            prefs.version
        ),
        Err(err) => error!("Failed to get reader UI preferences. error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn set_reader_ui_preferences(
    app: AppHandle,
    state: State<'_, AppState>,
    prefs: ReaderUiPreferences,
) -> Result<(), AppError> {
    info!(
        "Start to set reader UI preferences. version: {}, theme: \"{}\", font size: {}, fixed layout mode: \"{}\"",
        prefs.version,
        prefs.reflowable.settings.theme,
        prefs.reflowable.settings.font_size,
        prefs.fixed_layout.display_mode
    );
    let result = (|| {
        let mut config = state.lock().unwrap();
        ReaderService::set_reader_ui_preferences(&mut config, prefs);

        let config_path = app.path().app_data_dir()?.join("config.json");
        config_repo::save_config(&config_path, &config)?;
        Ok(())
    })();

    match &result {
        Ok(()) => info!("Success to set reader UI preferences."),
        Err(err) => error!("Failed to set reader UI preferences. error: {err}"),
    }

    result
}
