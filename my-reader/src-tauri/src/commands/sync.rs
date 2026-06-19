use tracing::{error, info};
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::config;
use crate::error::AppError;
use crate::services::sync_service::{DbSyncReport, SyncService};

#[tauri::command]
#[specta::specta]
pub async fn sync_db_for_library(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
) -> Result<DbSyncReport, AppError> {
    info!("Start to sync db for library. id: \"{}\"", library_id);

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Config(format!("APP_DATA_DIR_ERROR: {e}")))?;

    let mut config = {
        let guard = state.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    let report =
        SyncService::sync_db_for_library(&app_data_dir, &mut config, &library_id).await?;

    {
        let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
        *guard = config;
        let config_path = config::config_path(&app_data_dir);
        if let Err(e) = config::save_config(&config_path, &guard) {
            error!("Failed to save config after db sync. error: {e}");
        }
    }

    info!(
        "Success to sync db for library. id: \"{}\", pushed={}, pulled={}",
        library_id, report.pushed, report.pulled
    );

    Ok(report)
}
