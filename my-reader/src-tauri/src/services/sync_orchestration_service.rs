use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};
use tracing::{error, info};

use crate::error::AppError;
use crate::events::sync_status::{SyncStatusEmitter, SyncStatusReason};
use crate::models::AppConfig;
use crate::services::book_transfer_scheduler::BookTransferScheduler;
use crate::services::sidecar_sync_scheduler::SidecarSyncScheduler;
use crate::services::sync_service::{DbSyncReport, SyncService};

pub struct SyncOrchestrationService;

impl SyncOrchestrationService {
    pub async fn manually_sync_library<R: Runtime>(
        app: &AppHandle<R>,
        config_state: &Mutex<AppConfig>,
        book_transfers: Option<&BookTransferScheduler>,
        sidecar_scheduler: Option<&SidecarSyncScheduler>,
        library_id: &str,
    ) -> Result<DbSyncReport, AppError> {
        info!(
            target: "myreader_sync",
            event = "sync.manual_start",
            library_id,
            "Starting manual library sync"
        );

        let status = SyncStatusEmitter::new(
            app.clone(),
            library_id.to_owned(),
            SyncStatusReason::Manual,
            true,
        );
        status.started();

        let result = Self::run_manual_sync(
            app,
            config_state,
            book_transfers,
            sidecar_scheduler,
            library_id,
            &status,
        )
        .await;

        match &result {
            Ok(report) => {
                status.finished(report.changed);
                info!(
                    target: "myreader_sync",
                    event = "sync.manual_complete",
                    library_id,
                    pushed = report.pushed,
                    pulled = report.pulled,
                    changed = report.changed,
                    "Completed manual library sync"
                );
            }
            Err(failure) => {
                status.failed(SyncService::failure_kind(failure), failure);
                error!(
                    target: "myreader_sync",
                    event = "sync.manual_failed",
                    library_id,
                    error = %failure,
                    "Failed manual library sync"
                );
            }
        }

        result
    }

    pub fn network_reconnected(
        sidecar_scheduler: &SidecarSyncScheduler,
        book_transfers: &BookTransferScheduler,
    ) -> Result<(), AppError> {
        sidecar_scheduler.network_reconnected();
        book_transfers.request_all();
        Ok(())
    }

    async fn run_manual_sync<R: Runtime>(
        app: &AppHandle<R>,
        config_state: &Mutex<AppConfig>,
        book_transfers: Option<&BookTransferScheduler>,
        sidecar_scheduler: Option<&SidecarSyncScheduler>,
        library_id: &str,
        observer: &SyncStatusEmitter<R>,
    ) -> Result<DbSyncReport, AppError> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Config(format!("APP_DATA_DIR_ERROR: {error}")))?;
        let config = config_state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();

        if let Some(scheduler) = book_transfers {
            scheduler.request(library_id.to_owned());
        }

        let report =
            SyncService::sync_db_for_library_observed(&app_data_dir, &config, library_id, observer)
                .await?;
        let refreshed_config =
            crate::config::load_config(&crate::config::config_path(&app_data_dir))?;
        *config_state
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = refreshed_config;

        if let Some(scheduler) = sidecar_scheduler {
            scheduler.resume_library(library_id);
        }

        Ok(report)
    }
}
