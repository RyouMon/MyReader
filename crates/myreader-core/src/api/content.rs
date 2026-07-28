use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use crate::models::{
    BookCoverThumbnailCache, BookCoverThumbnailCachePatch, DownloadTask, DownloadTaskRequest,
    DownloadedFile, EnqueuedDownloadTask, FileState, FileStateUpdate,
};
use crate::{services, CoreError};

#[derive(Clone)]
pub struct DownloadCancellation {
    inner: Arc<AtomicBool>,
}

impl DownloadCancellation {
    pub fn is_cancelled(&self) -> bool {
        self.inner.load(Ordering::Acquire)
    }
}

pub struct DownloadCoordinator {
    inner: services::download::DownloadCoordinator,
}

impl DownloadCoordinator {
    pub fn new(max_concurrent: usize) -> Result<Self, CoreError> {
        Ok(Self {
            inner: services::download::DownloadCoordinator::new(max_concurrent)?,
        })
    }

    pub fn enqueue(&self, request: DownloadTaskRequest) -> Result<EnqueuedDownloadTask, CoreError> {
        self.inner.enqueue(request)
    }

    pub fn claim_ready(&self) -> Vec<DownloadTask> {
        self.inner.claim_ready()
    }

    pub fn claim(&self, task_id: &str) -> Option<DownloadTask> {
        self.inner.claim(task_id)
    }

    pub fn mark_started(&self, task_id: &str) -> Option<DownloadTask> {
        self.inner.mark_started(task_id)
    }

    pub fn report_progress(
        &self,
        task_id: &str,
        received: u64,
        total: u64,
    ) -> Option<DownloadTask> {
        self.inner.report_progress(task_id, received, total)
    }

    pub fn complete(&self, task_id: &str) -> Option<DownloadTask> {
        self.inner.complete(task_id)
    }

    pub fn fail(&self, task_id: &str, error: String) -> Option<DownloadTask> {
        self.inner.fail(task_id, error)
    }

    pub fn cancel(&self, task_id: &str) -> bool {
        self.inner.cancel(task_id)
    }

    pub fn cancel_by_key(&self, library_id: &str, relative_path: &str) -> bool {
        self.inner.cancel_by_key(library_id, relative_path)
    }

    pub fn is_cancelled(&self, task_id: &str) -> bool {
        self.inner.is_cancelled(task_id)
    }

    pub fn cancellation_token(&self, task_id: &str) -> Option<DownloadCancellation> {
        self.inner
            .cancellation_token(task_id)
            .map(|inner| DownloadCancellation { inner })
    }

    pub fn is_active(&self, library_id: &str, relative_path: &str) -> bool {
        self.inner.is_active(library_id, relative_path)
    }

    pub fn find_active(&self, library_id: &str, relative_path: &str) -> Option<DownloadTask> {
        self.inner.find_active(library_id, relative_path)
    }

    pub fn tasks(&self) -> Vec<DownloadTask> {
        self.inner.tasks()
    }

    pub fn release(&self, task_id: &str) -> bool {
        self.inner.release(task_id)
    }

    pub fn clear_finished(&self) {
        self.inner.clear_finished();
    }
}

pub async fn list_reading_formats(
    sidecar_root: &Path,
    library_root: &Path,
) -> Result<BTreeMap<String, String>, CoreError> {
    services::content::list_reading_formats(sidecar_root, library_root).await
}

pub async fn set_reading_format(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: Option<&str>,
) -> Result<(), CoreError> {
    services::content::set_reading_format(sidecar_root, library_root, book_id, format).await
}

pub async fn get_file_state(
    sidecar_root: &Path,
    path: &str,
) -> Result<Option<FileState>, CoreError> {
    services::content::get_file_state(sidecar_root, path).await
}

pub async fn get_file_states(
    sidecar_root: &Path,
    paths: &[String],
) -> Result<HashMap<String, FileState>, CoreError> {
    Ok(services::content::get_file_states(sidecar_root, paths)
        .await?
        .into_iter()
        .collect())
}

pub async fn list_file_states(sidecar_root: &Path) -> Result<Vec<FileState>, CoreError> {
    services::content::list_file_states(sidecar_root).await
}

pub async fn upsert_file_state(
    sidecar_root: &Path,
    path: &str,
    update: FileStateUpdate,
) -> Result<(), CoreError> {
    services::content::upsert_file_state(sidecar_root, path, update).await
}

pub async fn delete_file_state(sidecar_root: &Path, path: &str) -> Result<(), CoreError> {
    services::content::delete_file_state(sidecar_root, path).await
}

pub async fn finalize_downloaded_file(
    sidecar_root: &Path,
    relative_path: &str,
    local_path: &Path,
) -> Result<DownloadedFile, CoreError> {
    services::content::finalize_downloaded_file(sidecar_root, relative_path, local_path).await
}

pub async fn mark_file_remote_only(
    sidecar_root: &Path,
    relative_path: &str,
) -> Result<(), CoreError> {
    services::content::mark_file_remote_only(sidecar_root, relative_path).await
}

pub fn resolve_remote_file_path(
    source_path: Option<&str>,
    relative_path: &str,
) -> Result<String, CoreError> {
    services::content::resolve_remote_file_path(source_path, relative_path)
}

pub async fn list_cover_thumbnail_cache(
    sidecar_root: &Path,
    thumbnail_version: &str,
    width_px: i64,
    height_px: i64,
) -> Result<Vec<BookCoverThumbnailCache>, CoreError> {
    services::content::list_cover_thumbnail_cache(
        sidecar_root,
        thumbnail_version,
        width_px,
        height_px,
    )
    .await
}

pub async fn upsert_cover_thumbnail_cache(
    sidecar_root: &Path,
    patch: BookCoverThumbnailCachePatch,
) -> Result<(), CoreError> {
    services::content::upsert_cover_thumbnail_cache(sidecar_root, patch).await
}

pub async fn delete_cover_thumbnail_cache(
    sidecar_root: &Path,
    book_id: i64,
    thumbnail_version: &str,
    width_px: i64,
    height_px: i64,
) -> Result<(), CoreError> {
    services::content::delete_cover_thumbnail_cache(
        sidecar_root,
        book_id,
        thumbnail_version,
        width_px,
        height_px,
    )
    .await
}

pub async fn clear_cover_thumbnail_cache(sidecar_root: &Path) -> Result<(), CoreError> {
    services::content::clear_cover_thumbnail_cache(sidecar_root).await
}
