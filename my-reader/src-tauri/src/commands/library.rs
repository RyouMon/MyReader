use tracing::{error, info};
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::error::AppError;
use crate::models::LibraryInfo;
use crate::config;
use crate::services::library_service::LibraryService;

#[tauri::command]
#[specta::specta]
pub fn list_libraries(state: State<'_, AppState>) -> Result<Vec<LibraryInfo>, AppError> {
    info!("Start to list libraries.");
    let result = {
        let config = state.blocking_lock();
        LibraryService::list_libraries(&config)
    };
    match &result {
        Ok(infos) => info!("Success to list libraries. count: {}", infos.len()),
        Err(err) => error!("Failed to list libraries. error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn add_library(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<LibraryInfo, AppError> {
    info!("Start to add library. path: \"{path}\", requested name: {name:?}");
    let result = (|| {
        let mut config = state.blocking_lock();
        let info = LibraryService::add_library(&path, name.as_deref(), &mut config)?;

        let config_path = app.path().app_data_dir()?.join("config.json");
        config::save_config(&config_path, &config)?;
        drop(config);

        if let Err(e) = crate::asset_scope::sync_for_reader_libraries(&app) {
            error!(
                "Failed to extend asset protocol scope after adding library. error: {e}"
            );
        }
        Ok(info)
    })();
    match &result {
        Ok(info_item) => info!(
            "Success to add library. id: \"{}\", name: \"{}\", book count: {}",
            info_item.id, info_item.name, info_item.book_count
        ),
        Err(err) => error!("Failed to add library. path: \"{path}\", error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn refresh_library(
    state: State<'_, AppState>,
    id: String,
) -> Result<LibraryInfo, AppError> {
    info!("Start to refresh library. id: \"{id}\"");
    let result = (|| {
        let config = state.blocking_lock();
        let info = LibraryService::refresh_library(&id, &config)?;
        drop(config);
        Ok(info)
    })();
    match &result {
        Ok(info_item) => info!(
            "Success to refresh library. id: \"{}\", name: \"{}\", book count: {}",
            info_item.id, info_item.name, info_item.book_count
        ),
        Err(err) => error!("Failed to refresh library. id: \"{id}\", error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn remove_library(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to remove library. id: \"{id}\"");
    let result = (|| {
        let mut config = state.blocking_lock();
        LibraryService::remove_library(&id, &mut config)?;

        let config_path = app.path().app_data_dir()?.join("config.json");
        config::save_config(&config_path, &config)?;
        Ok(())
    })();
    match &result {
        Ok(()) => info!("Success to remove library. id: \"{id}\""),
        Err(err) => error!("Failed to remove library. id: \"{id}\", error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn switch_library(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to switch active library. id: \"{id}\"");
    let result = (|| {
        let mut config = state.blocking_lock();
        LibraryService::switch_library(&id, &mut config)?;

        let config_path = app.path().app_data_dir()?.join("config.json");
        config::save_config(&config_path, &config)?;
        Ok(())
    })();
    match &result {
        Ok(()) => info!("Success to switch active library. id: \"{id}\""),
        Err(err) => error!("Failed to switch active library. id: \"{id}\", error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn get_active_library_id(state: State<'_, AppState>) -> Result<Option<String>, AppError> {
    info!("Start to get active library id.");
    let result = state.blocking_lock().active_library_id.clone();
    info!("Success to get active library id. active library id: {result:?}");
    Ok(result)
}
