use std::sync::LazyLock;

use serde::{Deserialize, Serialize};

use crate::CoreFfiError;

static DOWNLOAD_COORDINATOR: LazyLock<my_reader_core::api::content::DownloadCoordinator> =
    LazyLock::new(|| {
        my_reader_core::api::content::DownloadCoordinator::new(2)
            .expect("mobile download concurrency must be positive")
    });

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(
    tag = "operation",
    content = "input",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum DownloadRequest {
    FindActive {
        library_id: String,
        relative_path: String,
    },
    Enqueue {
        id: String,
        library_id: String,
        book_id: Option<String>,
        format: Option<String>,
        relative_path: String,
        label: String,
    },
    ClaimReady {},
    Claim {
        task_id: String,
    },
    MarkStarted {
        task_id: String,
    },
    ReportProgress {
        task_id: String,
        received: u64,
        total: u64,
    },
    Complete {
        task_id: String,
    },
    Fail {
        task_id: String,
        error: String,
    },
    Cancel {
        task_id: String,
    },
    List {},
    Release {
        task_id: String,
    },
    ClearFinished {},
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum DownloadResponse {
    FindActive(Option<my_reader_core::models::DownloadTask>),
    Enqueue(my_reader_core::models::EnqueuedDownloadTask),
    ClaimReady(Vec<my_reader_core::models::DownloadTask>),
    Claim(Option<my_reader_core::models::DownloadTask>),
    MarkStarted(Option<my_reader_core::models::DownloadTask>),
    ReportProgress(Option<my_reader_core::models::DownloadTask>),
    Complete(Option<my_reader_core::models::DownloadTask>),
    Fail(Option<my_reader_core::models::DownloadTask>),
    Cancel(bool),
    List(Vec<my_reader_core::models::DownloadTask>),
    Release(bool),
    ClearFinished(()),
}

pub(super) fn handle(request: DownloadRequest) -> Result<DownloadResponse, CoreFfiError> {
    Ok(match request {
        DownloadRequest::FindActive {
            library_id,
            relative_path,
        } => DownloadResponse::FindActive(
            DOWNLOAD_COORDINATOR.find_active(&library_id, &relative_path),
        ),
        DownloadRequest::Enqueue {
            id,
            library_id,
            book_id,
            format,
            relative_path,
            label,
        } => DownloadResponse::Enqueue(
            DOWNLOAD_COORDINATOR
                .enqueue(my_reader_core::models::DownloadTaskRequest {
                    id,
                    library_id,
                    book_id,
                    format,
                    relative_path,
                    dedupe_key: None,
                    label,
                })
                .map_err(|error| CoreFfiError::Core(error.to_string()))?,
        ),
        DownloadRequest::ClaimReady {} => {
            DownloadResponse::ClaimReady(DOWNLOAD_COORDINATOR.claim_ready())
        }
        DownloadRequest::Claim { task_id } => {
            DownloadResponse::Claim(DOWNLOAD_COORDINATOR.claim(&task_id))
        }
        DownloadRequest::MarkStarted { task_id } => {
            DownloadResponse::MarkStarted(DOWNLOAD_COORDINATOR.mark_started(&task_id))
        }
        DownloadRequest::ReportProgress {
            task_id,
            received,
            total,
        } => DownloadResponse::ReportProgress(
            DOWNLOAD_COORDINATOR.report_progress(&task_id, received, total),
        ),
        DownloadRequest::Complete { task_id } => {
            DownloadResponse::Complete(DOWNLOAD_COORDINATOR.complete(&task_id))
        }
        DownloadRequest::Fail { task_id, error } => {
            DownloadResponse::Fail(DOWNLOAD_COORDINATOR.fail(&task_id, error))
        }
        DownloadRequest::Cancel { task_id } => {
            DownloadResponse::Cancel(DOWNLOAD_COORDINATOR.cancel(&task_id))
        }
        DownloadRequest::List {} => DownloadResponse::List(DOWNLOAD_COORDINATOR.tasks()),
        DownloadRequest::Release { task_id } => {
            DownloadResponse::Release(DOWNLOAD_COORDINATOR.release(&task_id))
        }
        DownloadRequest::ClearFinished {} => {
            DOWNLOAD_COORDINATOR.clear_finished();
            DownloadResponse::ClearFinished(())
        }
    })
}
