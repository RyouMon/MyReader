use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::error::AppError;
use crate::services::book_transfer_scheduler::BookTransferScheduler;
use crate::services::sidecar_sync_scheduler::SidecarSyncScheduler;
use crate::services::sync_orchestration_service::SyncOrchestrationService;
use crate::services::sync_service::DbSyncReport;

#[tauri::command]
#[specta::specta]
pub async fn sync_db_for_library<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
) -> Result<DbSyncReport, AppError> {
    let book_transfers = app.try_state::<BookTransferScheduler>();
    let sidecar_scheduler = app.try_state::<SidecarSyncScheduler>();
    SyncOrchestrationService::manually_sync_library(
        &app,
        state.inner(),
        book_transfers.as_deref(),
        sidecar_scheduler.as_deref(),
        &library_id,
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub fn notify_sidecar_network_reconnected(
    scheduler: State<'_, SidecarSyncScheduler>,
    book_transfers: State<'_, BookTransferScheduler>,
) -> Result<(), AppError> {
    SyncOrchestrationService::network_reconnected(&scheduler, &book_transfers)
}
