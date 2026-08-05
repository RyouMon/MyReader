use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, LazyLock, Mutex},
};

use my_reader_core::api::content::{BookTransferService, BookUploadObserver, BookUploadProgress};

use crate::{types::BookUploadTaskProgress, types::LibraryStorageConfig, CoreFfiError};

struct BookUploadTaskState {
    progress: Mutex<Option<BookUploadTaskProgress>>,
}

static BOOK_UPLOAD_TASKS: LazyLock<Mutex<HashMap<String, Arc<BookUploadTaskState>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

struct FfiBookUploadObserver {
    task_id: String,
    task: Arc<BookUploadTaskState>,
}

impl BookUploadObserver for FfiBookUploadObserver {
    fn on_progress(&self, progress: BookUploadProgress) {
        *self
            .task
            .progress
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(BookUploadTaskProgress {
            task_id: self.task_id.clone(),
            book_uuid: progress.book_uuid,
            completed: progress.completed as f64,
            total: progress.total as f64,
        });
    }
}

#[uniffi::export]
pub fn book_transfer_read_task_progress(task_id: String) -> Option<BookUploadTaskProgress> {
    BOOK_UPLOAD_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(&task_id)
        .and_then(|task| {
            task.progress
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .clone()
        })
}

#[uniffi::export]
pub fn book_transfer_release_task(task_id: String) -> bool {
    BOOK_UPLOAD_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .remove(&task_id)
        .is_some()
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn book_transfer_run_pending_uploads(
    task_id: String,
    sidecar_root_path: String,
    library_root_path: String,
    storage: LibraryStorageConfig,
) -> Result<Vec<String>, CoreFfiError> {
    let task = create_book_upload_task(&task_id)?;
    BookTransferService::upload_pending_books_observed(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &storage.try_into()?,
        &FfiBookUploadObserver {
            task_id,
            task: task.clone(),
        },
    )
    .await
    .map(|report| report.completed_book_uuids)
    .map_err(CoreFfiError::from_core)
}

fn create_book_upload_task(task_id: &str) -> Result<Arc<BookUploadTaskState>, CoreFfiError> {
    let task = Arc::new(BookUploadTaskState {
        progress: Mutex::new(None),
    });
    let mut tasks = BOOK_UPLOAD_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if tasks.contains_key(task_id) {
        return Err(CoreFfiError::core(format!(
            "Book upload task already exists: {task_id}"
        )));
    }
    tasks.insert(task_id.to_owned(), task.clone());
    Ok(task)
}
