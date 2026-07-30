use std::sync::LazyLock;

use crate::{
    types::{DownloadTask, EnqueuedDownloadTask},
    CoreFfiError,
};

static DOWNLOAD_COORDINATOR: LazyLock<my_reader_core::api::content::DownloadCoordinator> =
    LazyLock::new(|| {
        my_reader_core::api::content::DownloadCoordinator::new(2)
            .expect("mobile download concurrency must be positive")
    });

#[uniffi::export]
pub fn download_find_active(library_id: String, relative_path: String) -> Option<DownloadTask> {
    DOWNLOAD_COORDINATOR
        .find_active(&library_id, &relative_path)
        .map(Into::into)
}

#[uniffi::export]
pub fn download_enqueue(
    id: String,
    library_id: String,
    book_id: Option<String>,
    format: Option<String>,
    relative_path: String,
    label: String,
) -> Result<EnqueuedDownloadTask, CoreFfiError> {
    Ok(DOWNLOAD_COORDINATOR
        .enqueue(my_reader_core::models::DownloadTaskRequest {
            id,
            library_id,
            book_id,
            format,
            relative_path,
            dedupe_key: None,
            label,
        })
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export]
pub fn download_claim_ready() -> Vec<DownloadTask> {
    DOWNLOAD_COORDINATOR
        .claim_ready()
        .into_iter()
        .map(Into::into)
        .collect()
}

#[uniffi::export]
pub fn download_claim(task_id: String) -> Option<DownloadTask> {
    DOWNLOAD_COORDINATOR.claim(&task_id).map(Into::into)
}

#[uniffi::export]
pub fn download_mark_started(task_id: String) -> Option<DownloadTask> {
    DOWNLOAD_COORDINATOR.mark_started(&task_id).map(Into::into)
}

#[uniffi::export]
pub fn download_report_progress(
    task_id: String,
    received: f64,
    total: f64,
) -> Result<Option<DownloadTask>, CoreFfiError> {
    Ok(DOWNLOAD_COORDINATOR
        .report_progress(
            &task_id,
            crate::types::required_u64(received, "received")?,
            crate::types::required_u64(total, "total")?,
        )
        .map(Into::into))
}

#[uniffi::export]
pub fn download_complete(task_id: String) -> Option<DownloadTask> {
    DOWNLOAD_COORDINATOR.complete(&task_id).map(Into::into)
}

#[uniffi::export]
pub fn download_fail(task_id: String, error: String) -> Option<DownloadTask> {
    DOWNLOAD_COORDINATOR.fail(&task_id, error).map(Into::into)
}

#[uniffi::export]
pub fn download_cancel(task_id: String) -> bool {
    DOWNLOAD_COORDINATOR.cancel(&task_id)
}

#[uniffi::export]
pub fn download_list() -> Vec<DownloadTask> {
    DOWNLOAD_COORDINATOR
        .tasks()
        .into_iter()
        .map(Into::into)
        .collect()
}

#[uniffi::export]
pub fn download_release(task_id: String) -> bool {
    DOWNLOAD_COORDINATOR.release(&task_id)
}

#[uniffi::export]
pub fn download_clear_finished() {
    DOWNLOAD_COORDINATOR.clear_finished();
}
