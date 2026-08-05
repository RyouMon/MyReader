use my_reader_core::api::sync::{SyncObserver, SyncProgress, SyncReport};
use tauri::{AppHandle, Emitter, Manager, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::services::book_transfer_scheduler::BookTransferScheduler;
use crate::services::sidecar_sync_scheduler::SidecarSyncScheduler;
use crate::services::sync_service::{DbSyncReport, SidecarSyncCompletedPayload, SyncService};

struct CommandSyncObserver<R: tauri::Runtime> {
    app: AppHandle<R>,
    library_id: String,
}

impl<R: tauri::Runtime> SyncObserver for CommandSyncObserver<R> {
    fn is_cancelled(&self) -> bool {
        false
    }

    fn on_progress(&self, _progress: SyncProgress) {}

    fn on_sidecar_complete(&self, report: &SyncReport) {
        if let Err(error) = self.app.emit(
            "sidecar_sync_completed",
            SidecarSyncCompletedPayload {
                library_id: self.library_id.clone(),
                mode: "full",
                pushed: report.pushed,
                pulled: report.pulled,
            },
        ) {
            error!(
                target: "myreader_sync",
                event = "sync.sidecar_event_failed",
                library_id = self.library_id,
                error = %error,
                "Failed to emit sidecar completion"
            );
        }
    }
}

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
    let config = common::config_snapshot(&state);
    if let Some(scheduler) = app.try_state::<BookTransferScheduler>() {
        scheduler.request(library_id.clone());
    }
    let observer = CommandSyncObserver {
        app: app.clone(),
        library_id: library_id.clone(),
    };

    let report = match SyncService::sync_db_for_library_observed(
        &app_data_dir,
        &config,
        &library_id,
        &observer,
    )
    .await
    {
        Ok(report) => report,
        Err(err) => {
            error!(
                target: "myreader_sync",
                event = "sync.command_failed",
                library_id,
                stage = "sync_library",
                error = %err,
                "Failed to sync library"
            );
            return Err(err);
        }
    };

    let refreshed_config = crate::config::load_config(&crate::config::config_path(&app_data_dir))?;
    common::with_config_mut(&state, |config| *config = refreshed_config);
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
    book_transfers: State<'_, BookTransferScheduler>,
) -> Result<(), AppError> {
    scheduler.network_reconnected();
    book_transfers.request_all();
    Ok(())
}
