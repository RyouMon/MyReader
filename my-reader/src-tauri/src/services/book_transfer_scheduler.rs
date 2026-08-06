use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use my_reader_core::api::content::{BookUploadObserver, BookUploadProgress};
use tauri::{AppHandle, Emitter, Manager};
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

const BOOK_UPLOAD_PROGRESS_EVENT: &str = "book_upload_progress";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BookUploadProgressPayload {
    library_id: String,
    book_uuid: Option<String>,
    status: String,
    completed: u64,
    total: u64,
    error: Option<String>,
}

struct BookUploadEventObserver {
    app: AppHandle,
    library_id: String,
    current_book_uuid: Mutex<Option<String>>,
}

impl BookUploadEventObserver {
    fn new(app: AppHandle, library_id: &str) -> Self {
        Self {
            app,
            library_id: library_id.to_owned(),
            current_book_uuid: Mutex::new(None),
        }
    }

    fn emit(&self, payload: BookUploadProgressPayload) {
        if let Err(error) = self.app.emit(BOOK_UPLOAD_PROGRESS_EVENT, payload) {
            error!(
                target: "myreader_book_transfer",
                library_id = self.library_id,
                error = %error,
                "Failed to emit book upload progress"
            );
        }
    }

    fn emit_error(&self, error: &str) {
        let book_uuid = self
            .current_book_uuid
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone();
        self.emit(BookUploadProgressPayload {
            library_id: self.library_id.clone(),
            book_uuid,
            status: "error".into(),
            completed: 0,
            total: 0,
            error: Some(error.to_owned()),
        });
    }
}

impl BookUploadObserver for BookUploadEventObserver {
    fn on_progress(&self, progress: BookUploadProgress) {
        let completed = progress.total > 0 && progress.completed >= progress.total;
        *self
            .current_book_uuid
            .lock()
            .unwrap_or_else(|error| error.into_inner()) =
            (!completed).then(|| progress.book_uuid.clone());
        self.emit(BookUploadProgressPayload {
            library_id: self.library_id.clone(),
            book_uuid: Some(progress.book_uuid),
            status: if completed { "done" } else { "uploading" }.into(),
            completed: progress.completed,
            total: progress.total,
            error: None,
        });
    }
}

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

    pub fn request_book(&self, library_id: impl Into<String>, book_uuid: impl Into<String>) {
        let library_id = library_id.into();
        BookUploadEventObserver::new(self.app.clone(), &library_id).emit(
            BookUploadProgressPayload {
                library_id: library_id.clone(),
                book_uuid: Some(book_uuid.into()),
                status: "uploading".into(),
                completed: 0,
                total: 0,
                error: None,
            },
        );
        self.request(library_id);
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
        let observer = BookUploadEventObserver::new(self.app.clone(), library_id);
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
            let report =
                my_reader_core::api::content::BookTransferService::upload_pending_books_observed(
                    &sidecar_root,
                    &library_root_path(&library, &self.app_data_dir),
                    &storage,
                    &observer,
                )
                .await?;
            Ok::<_, crate::error::AppError>(Some(report))
        }
        .await;

        match result {
            Ok(Some(report)) => {
                if report.completed_book_uuids.is_empty()
                    && report.unavailable_book_uuids.is_empty()
                {
                    observer.emit(BookUploadProgressPayload {
                        library_id: library_id.to_owned(),
                        book_uuid: None,
                        status: "done".into(),
                        completed: 0,
                        total: 0,
                        error: None,
                    });
                }
                for book_uuid in &report.unavailable_book_uuids {
                    observer.emit(BookUploadProgressPayload {
                        library_id: library_id.to_owned(),
                        book_uuid: Some(book_uuid.clone()),
                        status: "error".into(),
                        completed: 0,
                        total: 0,
                        error: Some("PENDING_BOOK_FILE_UNAVAILABLE".into()),
                    });
                }
                if report.completed_book_uuids.is_empty() {
                    return;
                }
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
            Ok(None) => observer.emit(BookUploadProgressPayload {
                library_id: library_id.to_owned(),
                book_uuid: None,
                status: "done".into(),
                completed: 0,
                total: 0,
                error: None,
            }),
            Err(error) => {
                observer.emit_error(&error.to_string());
                error!(
                    target: "myreader_book_transfer",
                    library_id,
                    error = %error,
                    "Background book upload failed"
                );
            }
        }
    }
}
