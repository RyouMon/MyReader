use std::sync::LazyLock;

use crate::RustComponentsError;

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeDownloadTask {
    pub id: String,
    pub library_id: String,
    pub book_id: Option<String>,
    pub format: Option<String>,
    pub relative_path: String,
    pub label: String,
    pub status: String,
    pub progress: f64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeEnqueuedDownloadTask {
    pub task: NativeDownloadTask,
    pub inserted: bool,
}

static DOWNLOAD_COORDINATOR: LazyLock<myreader_core::api::content::DownloadCoordinator> =
    LazyLock::new(|| {
        myreader_core::api::content::DownloadCoordinator::new(2)
            .expect("mobile download concurrency must be positive")
    });

fn native_download_task(task: myreader_core::models::DownloadTask) -> NativeDownloadTask {
    NativeDownloadTask {
        id: task.id,
        library_id: task.library_id,
        book_id: task.book_id,
        format: task.format,
        relative_path: task.relative_path,
        label: task.label,
        status: task.status.as_str().to_owned(),
        progress: task.progress,
        error: task.error,
    }
}

#[uniffi::export]
pub fn find_active_download_task(
    library_id: String,
    relative_path: String,
) -> Option<NativeDownloadTask> {
    DOWNLOAD_COORDINATOR
        .find_active(&library_id, &relative_path)
        .map(native_download_task)
}

#[uniffi::export]
pub fn enqueue_download_task(
    id: String,
    library_id: String,
    book_id: Option<String>,
    format: Option<String>,
    relative_path: String,
    label: String,
) -> Result<NativeEnqueuedDownloadTask, RustComponentsError> {
    let enqueued = DOWNLOAD_COORDINATOR
        .enqueue(myreader_core::models::DownloadTaskRequest {
            id,
            library_id,
            book_id,
            format,
            relative_path,
            dedupe_key: None,
            label,
        })
        .map_err(|error| RustComponentsError::Core(error.to_string()))?;
    Ok(NativeEnqueuedDownloadTask {
        task: native_download_task(enqueued.task),
        inserted: enqueued.inserted,
    })
}

#[uniffi::export]
pub fn claim_download_tasks() -> Vec<NativeDownloadTask> {
    DOWNLOAD_COORDINATOR
        .claim_ready()
        .into_iter()
        .map(native_download_task)
        .collect()
}

#[uniffi::export]
pub fn claim_download_task(task_id: String) -> Option<NativeDownloadTask> {
    DOWNLOAD_COORDINATOR
        .claim(&task_id)
        .map(native_download_task)
}

#[uniffi::export]
pub fn mark_download_task_started(task_id: String) -> Option<NativeDownloadTask> {
    DOWNLOAD_COORDINATOR
        .mark_started(&task_id)
        .map(native_download_task)
}

#[uniffi::export]
pub fn report_download_task_progress(
    task_id: String,
    received: u64,
    total: u64,
) -> Option<NativeDownloadTask> {
    DOWNLOAD_COORDINATOR
        .report_progress(&task_id, received, total)
        .map(native_download_task)
}

#[uniffi::export]
pub fn complete_download_task(task_id: String) -> Option<NativeDownloadTask> {
    DOWNLOAD_COORDINATOR
        .complete(&task_id)
        .map(native_download_task)
}

#[uniffi::export]
pub fn fail_download_task(task_id: String, error: String) -> Option<NativeDownloadTask> {
    DOWNLOAD_COORDINATOR
        .fail(&task_id, error)
        .map(native_download_task)
}

#[uniffi::export]
pub fn cancel_download_task(task_id: String) -> bool {
    DOWNLOAD_COORDINATOR.cancel(&task_id)
}

#[uniffi::export]
pub fn list_download_tasks() -> Vec<NativeDownloadTask> {
    DOWNLOAD_COORDINATOR
        .tasks()
        .into_iter()
        .map(native_download_task)
        .collect()
}

#[uniffi::export]
pub fn release_download_task(task_id: String) -> bool {
    DOWNLOAD_COORDINATOR.release(&task_id)
}

#[uniffi::export]
pub fn clear_finished_download_tasks() {
    DOWNLOAD_COORDINATOR.clear_finished();
}
