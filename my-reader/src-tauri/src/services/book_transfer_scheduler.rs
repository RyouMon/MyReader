use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use tauri::{AppHandle, Manager};
use tracing::{error, info};

use crate::{
    commands::AppState,
    services::{
        library_service::LibraryService,
        sidecar_sync_scheduler::{SidecarSyncReason, SidecarSyncScheduler, SidecarSyncTiming},
        sync_service::SidecarSyncMode,
    },
    storage,
    utils::paths::{library_root_path, library_sidecar_path},
};

#[derive(Clone)]
pub struct BookTransferScheduler {
    app: AppHandle,
    app_data_dir: PathBuf,
    running: Arc<Mutex<HashMap<String, bool>>>,
}

impl BookTransferScheduler {
    pub fn start(app: AppHandle, app_data_dir: PathBuf) -> Self {
        Self {
            app,
            app_data_dir,
            running: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn request(&self, library_id: impl Into<String>) {
        let library_id = library_id.into();
        {
            let mut running = self
                .running
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if let Some(rerun) = running.get_mut(&library_id) {
                *rerun = true;
                return;
            }
            running.insert(library_id.clone(), false);
        }

        let scheduler = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                scheduler.upload_pending(&library_id).await;
                let should_rerun = {
                    let mut running = scheduler
                        .running
                        .lock()
                        .unwrap_or_else(|error| error.into_inner());
                    if running.get(&library_id).copied().unwrap_or(false) {
                        running.insert(library_id.clone(), false);
                        true
                    } else {
                        running.remove(&library_id);
                        false
                    }
                };
                if !should_rerun {
                    break;
                }
            }
        });
    }

    pub fn request_all(&self) {
        let library_ids = self
            .app
            .state::<AppState>()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .libraries
            .iter()
            .filter(|library| library.is_remote() && library.is_myreader())
            .map(|library| library.id.clone())
            .collect::<Vec<_>>();
        for library_id in library_ids {
            self.request(library_id);
        }
    }

    async fn upload_pending(&self, library_id: &str) {
        let config = self
            .app
            .state::<AppState>()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        let result = async {
            let library = LibraryService::resolve_library(Some(library_id), &config)?;
            if !library.is_remote() || !library.is_myreader() {
                return Ok(None);
            }
            let sidecar_root = library_sidecar_path(&library, &self.app_data_dir);
            if !my_reader_core::api::content::BookTransferService::has_pending_books(&sidecar_root)
                .await?
            {
                return Ok(None);
            }
            let storage = storage::core_library_storage(&config, &library).await?;
            let report = my_reader_core::api::content::BookTransferService::upload_pending_books(
                &sidecar_root,
                &library_root_path(&library, &self.app_data_dir),
                &storage,
            )
            .await?;
            Ok::<_, crate::error::AppError>(Some(report))
        }
        .await;

        match result {
            Ok(Some(report)) if !report.completed_book_uuids.is_empty() => {
                info!(
                    target: "myreader_book_transfer",
                    library_id,
                    completed = report.completed_book_uuids.len(),
                    unavailable = report.unavailable_book_uuids.len(),
                    "Completed background book uploads"
                );
                if let Some(sidecar) = self.app.try_state::<SidecarSyncScheduler>() {
                    sidecar.request(
                        library_id,
                        SidecarSyncMode::PushOnly,
                        SidecarSyncReason::LocalChange,
                        SidecarSyncTiming::Debounced,
                    );
                }
            }
            Ok(_) => {}
            Err(error) => error!(
                target: "myreader_book_transfer",
                library_id,
                error = %error,
                "Background book upload failed"
            ),
        }
    }
}
