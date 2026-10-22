use tauri::{AppHandle, State};

use crate::{
    commands::common::unix_epoch_millis,
    error::AppError,
    services::app_update_service::{AppUpdateSnapshot, DesktopAppUpdater},
};

#[tauri::command]
#[specta::specta]
pub async fn get_app_update<R: tauri::Runtime>(
    app: AppHandle<R>,
    updater: State<'_, DesktopAppUpdater>,
) -> Result<AppUpdateSnapshot, AppError> {
    Ok(updater.get(&app).await?.snapshot().into())
}

#[tauri::command]
#[specta::specta]
pub async fn check_app_update<R: tauri::Runtime>(
    app: AppHandle<R>,
    updater: State<'_, DesktopAppUpdater>,
    manual: bool,
) -> Result<AppUpdateSnapshot, AppError> {
    Ok(updater
        .get(&app)
        .await?
        .check(manual, unix_epoch_millis())
        .await?
        .into())
}

#[tauri::command]
#[specta::specta]
pub async fn download_app_update<R: tauri::Runtime>(
    app: AppHandle<R>,
    updater: State<'_, DesktopAppUpdater>,
) -> Result<AppUpdateSnapshot, AppError> {
    Ok(updater.get(&app).await?.download().await?.into())
}

#[tauri::command]
#[specta::specta]
pub async fn set_app_update_preferences<R: tauri::Runtime>(
    app: AppHandle<R>,
    updater: State<'_, DesktopAppUpdater>,
    auto_check: bool,
    auto_download: bool,
) -> Result<AppUpdateSnapshot, AppError> {
    Ok(updater
        .get(&app)
        .await?
        .set_preferences(auto_check, auto_download)
        .await?
        .into())
}

#[tauri::command]
#[specta::specta]
pub async fn open_app_update_installer<R: tauri::Runtime>(
    app: AppHandle<R>,
    updater: State<'_, DesktopAppUpdater>,
) -> Result<(), AppError> {
    updater.open_installer(&app).await
}
