use std::{path::Path, sync::LazyLock};

use crate::{run_core_async, RustComponentsError};

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeFileState {
    pub id: String,
    pub path: String,
    pub local_state: String,
    pub local_blake3: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
    pub updated_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeFileStateUpdate {
    pub local_state: String,
    pub local_blake3: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeDownloadedFile {
    pub size: i64,
    pub mtime_ms: i64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeBookCoverThumbnailCache {
    pub id: String,
    pub book_id: i64,
    pub cover_identity: String,
    pub thumbnail_version: String,
    pub width_px: i64,
    pub height_px: i64,
    pub file_name: String,
    pub file_size_bytes: i64,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeBookCoverThumbnailCachePatch {
    pub book_id: i64,
    pub cover_identity: String,
    pub thumbnail_version: String,
    pub width_px: i64,
    pub height_px: i64,
    pub file_name: String,
    pub file_size_bytes: i64,
}

impl From<myreader_core::models::FileState> for NativeFileState {
    fn from(state: myreader_core::models::FileState) -> Self {
        Self {
            id: state.id,
            path: state.path,
            local_state: state.local_state,
            local_blake3: state.local_blake3,
            local_size: state.local_size,
            local_mtime: state.local_mtime,
            updated_at: state.updated_at,
        }
    }
}

impl From<NativeFileStateUpdate> for myreader_core::models::FileStateUpdate {
    fn from(update: NativeFileStateUpdate) -> Self {
        Self {
            local_state: update.local_state,
            local_blake3: update.local_blake3,
            local_size: update.local_size,
            local_mtime: update.local_mtime,
        }
    }
}

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
pub fn get_library_file_state(
    sidecar_root_path: String,
    path: String,
) -> Result<Option<NativeFileState>, RustComponentsError> {
    let state = run_core_async(myreader_core::api::content::get_file_state(
        Path::new(&sidecar_root_path),
        &path,
    ))?;
    Ok(state.map(Into::into))
}

#[uniffi::export]
pub fn list_library_file_states(
    sidecar_root_path: String,
) -> Result<Vec<NativeFileState>, RustComponentsError> {
    let states = run_core_async(myreader_core::api::content::list_file_states(Path::new(
        &sidecar_root_path,
    )))?;
    Ok(states.into_iter().map(Into::into).collect())
}

#[uniffi::export]
pub fn upsert_library_file_state(
    sidecar_root_path: String,
    path: String,
    update: NativeFileStateUpdate,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::upsert_file_state(
        Path::new(&sidecar_root_path),
        &path,
        update.into(),
    ))
}

#[uniffi::export]
pub fn delete_library_file_state(
    sidecar_root_path: String,
    path: String,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::delete_file_state(
        Path::new(&sidecar_root_path),
        &path,
    ))
}

#[uniffi::export]
pub fn finalize_downloaded_file(
    sidecar_root_path: String,
    relative_path: String,
    local_path: String,
) -> Result<NativeDownloadedFile, RustComponentsError> {
    let downloaded = run_core_async(myreader_core::api::content::finalize_downloaded_file(
        Path::new(&sidecar_root_path),
        &relative_path,
        Path::new(&local_path),
    ))?;
    Ok(NativeDownloadedFile {
        size: downloaded.size,
        mtime_ms: downloaded.mtime_ms,
    })
}

#[uniffi::export]
pub fn mark_library_file_remote_only(
    sidecar_root_path: String,
    relative_path: String,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::mark_file_remote_only(
        Path::new(&sidecar_root_path),
        &relative_path,
    ))
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

#[uniffi::export]
pub fn list_book_cover_thumbnail_cache(
    sidecar_root_path: String,
    thumbnail_version: String,
    width_px: i64,
    height_px: i64,
) -> Result<Vec<NativeBookCoverThumbnailCache>, RustComponentsError> {
    let rows = run_core_async(myreader_core::api::content::list_cover_thumbnail_cache(
        Path::new(&sidecar_root_path),
        &thumbnail_version,
        width_px,
        height_px,
    ))?;
    Ok(rows
        .into_iter()
        .map(|row| NativeBookCoverThumbnailCache {
            id: row.id,
            book_id: row.book_id,
            cover_identity: row.cover_identity,
            thumbnail_version: row.thumbnail_version,
            width_px: row.width_px,
            height_px: row.height_px,
            file_name: row.file_name,
            file_size_bytes: row.file_size_bytes,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect())
}

#[uniffi::export]
pub fn upsert_book_cover_thumbnail_cache(
    sidecar_root_path: String,
    patch: NativeBookCoverThumbnailCachePatch,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::upsert_cover_thumbnail_cache(
        Path::new(&sidecar_root_path),
        myreader_core::models::BookCoverThumbnailCachePatch {
            book_id: patch.book_id,
            cover_identity: patch.cover_identity,
            thumbnail_version: patch.thumbnail_version,
            width_px: patch.width_px,
            height_px: patch.height_px,
            file_name: patch.file_name,
            file_size_bytes: patch.file_size_bytes,
        },
    ))
}

#[uniffi::export]
pub fn delete_book_cover_thumbnail_cache(
    sidecar_root_path: String,
    book_id: i64,
    thumbnail_version: String,
    width_px: i64,
    height_px: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::delete_cover_thumbnail_cache(
        Path::new(&sidecar_root_path),
        book_id,
        &thumbnail_version,
        width_px,
        height_px,
    ))
}

#[uniffi::export]
pub fn clear_book_cover_thumbnail_cache(
    sidecar_root_path: String,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::clear_cover_thumbnail_cache(
        Path::new(&sidecar_root_path),
    ))
}
