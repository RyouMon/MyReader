use tauri::{AppHandle, Manager, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::services::sidecar_sync_scheduler::SidecarSyncScheduler;
use crate::services::sync_service::{DbSyncReport, SyncService};

#[tauri::command]
#[specta::specta]
pub async fn sync_db_for_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
) -> Result<DbSyncReport, AppError> {
    info!("Start to sync db for library. id: \"{}\"", library_id);

    let app_data_dir = common::app_data_dir(&app).map_err(|err| {
        error!(
            target: "myreader_sync",
            event = "sync.command_failed",
            library_id,
            stage = "resolve_app_data_dir",
            error = %err,
            "Failed to sync library sidecar"
        );
        err
    })?;
    let mut config = common::config_snapshot(&state);

    let report =
        match SyncService::sync_db_for_library(&app_data_dir, &mut config, &library_id).await {
            Ok(report) => report,
            Err(err) => {
                error!(
                    target: "myreader_sync",
                    event = "sync.command_failed",
                    library_id,
                    stage = "sync_library",
                    error = %err,
                    "Failed to sync library sidecar"
                );
                return Err(err);
            }
        };

    common::with_config_mut(&state, |cfg| *cfg = config.clone());
    if let Err(e) = common::persist_config(&app, &config) {
        error!("Failed to save config after db sync. error: {e}");
    }
    if let Some(scheduler) = app.try_state::<SidecarSyncScheduler>() {
        scheduler.resume_library(&library_id);
    }

    info!(
        "Success to sync db for library. id: \"{}\", pushed={}, pulled={}",
        library_id, report.pushed, report.pulled
    );

    Ok(report)
}

#[tauri::command]
#[specta::specta]
pub fn notify_sidecar_network_reconnected(
    scheduler: State<'_, SidecarSyncScheduler>,
) -> Result<(), AppError> {
    scheduler.network_reconnected();
    Ok(())
}
