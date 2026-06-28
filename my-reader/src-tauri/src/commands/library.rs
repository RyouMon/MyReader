use tauri::{AppHandle, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::LibraryInfo;
use crate::services::library_service::LibraryService;

#[tauri::command]
#[specta::specta]
pub async fn list_libraries(state: State<'_, AppState>) -> Result<Vec<LibraryInfo>, AppError> {
    info!("Start to list libraries.");
    let config = common::config_snapshot(&state);
    let result = LibraryService::list_libraries(&config).await;
    match &result {
        Ok(infos) => info!("Success to list libraries. count: {}", infos.len()),
        Err(err) => error!("Failed to list libraries. error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub async fn add_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<LibraryInfo, AppError> {
    info!("Start to add library. path: \"{path}\", requested name: {name:?}");
    let app_data_dir = common::app_data_dir(&app)?;

    let mut config = common::config_snapshot(&state);

    let info = LibraryService::add_library_with_scope_sync(
        &app,
        &app_data_dir,
        &path,
        name.as_deref(),
        &mut config,
    )
    .await?;

    common::with_config_mut(&state, |cfg| *cfg = config.clone());
    common::persist_config(&app, &config)?;

    info!(
        "Success to add library. id: \"{}\", name: \"{}\", book count: {}",
        info.id, info.name, info.book_count
    );
    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub async fn add_webdav_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    data_source_id: String,
    remote_path: String,
    name: Option<String>,
) -> Result<LibraryInfo, AppError> {
    info!(
        "Start to add WebDAV library. data_source_id: \"{data_source_id}\", remote_path: \"{remote_path}\", name: {name:?}"
    );
    let app_data_dir = common::app_data_dir(&app)?;

    let mut config = common::config_snapshot(&state);

    let info = LibraryService::add_webdav_library_with_scope_sync(
        &app,
        &app_data_dir,
        &data_source_id,
        &remote_path,
        name.as_deref(),
        &mut config,
    )
    .await?;

    common::with_config_mut(&state, |cfg| *cfg = config.clone());
    common::persist_config(&app, &config)?;

    info!(
        "Success to add WebDAV library. id: \"{}\", name: \"{}\", book count: {}",
        info.id, info.name, info.book_count
    );

    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub async fn add_onedrive_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    data_source_id: String,
    remote_path: String,
    name: Option<String>,
) -> Result<LibraryInfo, AppError> {
    info!(
        "Start to add OneDrive library. data_source_id: \"{data_source_id}\", remote_path: \"{remote_path}\", name: {name:?}"
    );
    let app_data_dir = common::app_data_dir(&app)?;

    let mut config = common::config_snapshot(&state);

    let info = LibraryService::add_onedrive_library_with_scope_sync(
        &app,
        &app_data_dir,
        &data_source_id,
        &remote_path,
        name.as_deref(),
        &mut config,
    )
    .await?;

    common::with_config_mut(&state, |cfg| *cfg = config.clone());
    common::persist_config(&app, &config)?;

    info!(
        "Success to add OneDrive library. id: \"{}\", name: \"{}\", book count: {}",
        info.id, info.name, info.book_count
    );

    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_webdav_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
) -> Result<LibraryInfo, AppError> {
    info!("Start to refresh WebDAV library. id: \"{id}\"");
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);

    let info = LibraryService::refresh_webdav_library(&app_data_dir, &id, &config).await?;

    info!(
        "Success to refresh WebDAV library. id: \"{}\", name: \"{}\", book count: {}",
        info.id, info.name, info.book_count
    );

    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_onedrive_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
) -> Result<LibraryInfo, AppError> {
    info!("Start to refresh OneDrive library. id: \"{id}\"");
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);

    let info = LibraryService::refresh_onedrive_library(&app_data_dir, &id, &config).await?;

    info!(
        "Success to refresh OneDrive library. id: \"{}\", name: \"{}\", book count: {}",
        info.id, info.name, info.book_count
    );

    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub async fn refresh_library(
    state: State<'_, AppState>,
    id: String,
) -> Result<LibraryInfo, AppError> {
    info!("Start to refresh library. id: \"{id}\"");
    let config = common::config_snapshot(&state);

    let info = LibraryService::refresh_library(&id, &config).await?;

    info!(
        "Success to refresh library. id: \"{}\", name: \"{}\", book count: {}",
        info.id, info.name, info.book_count
    );
    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub fn remove_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to remove library. id: \"{id}\"");
    let result = (|| {
        let app_data_dir = common::app_data_dir(&app)?;
        common::with_config_mut(&state, |config| {
            LibraryService::remove_library(&app_data_dir, &id, config)
        })?;
        // Re-acquire the lock for save_config to keep the persisted view strictly in
        // sync with the just-mutated in-memory state.
        let snapshot = common::config_snapshot(&state);
        common::persist_config(&app, &snapshot)
    })();
    match &result {
        Ok(()) => info!("Success to remove library. id: \"{id}\""),
        Err(err) => error!("Failed to remove library. id: \"{id}\", error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn switch_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to switch active library. id: \"{id}\"");
    let result = (|| {
        common::with_config_mut(&state, |config| LibraryService::switch_library(&id, config))?;
        let snapshot = common::config_snapshot(&state);
        common::persist_config(&app, &snapshot)
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
    let result = common::config_snapshot(&state).active_library_id;
    info!("Success to get active library id. active library id: {result:?}");
    Ok(result)
}
