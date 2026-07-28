//! Aggregation root for MyReader Rust components.

use std::{
    collections::HashMap,
    future::Future,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex, OnceLock,
    },
};

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum RustComponentsError {
    #[error("CORE_ERROR: {0}")]
    Core(String),

    #[error("SYNC_ERROR: {0}")]
    Sync(String),
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncLibrarySidecarReport {
    pub pushed: u32,
    pub pulled: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncTaskProgress {
    pub task_id: String,
    pub stage: String,
    pub completed: u32,
    pub total: u32,
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

struct SyncTaskState {
    cancelled: AtomicBool,
    progress: Mutex<SyncTaskProgress>,
}

static SYNC_TASKS: LazyLock<Mutex<HashMap<String, Arc<SyncTaskState>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static SYNC_COORDINATORS: LazyLock<
    Mutex<HashMap<String, Arc<myreader_core::api::sync::SyncCoordinator>>>,
> = LazyLock::new(|| Mutex::new(HashMap::new()));
static DOWNLOAD_COORDINATOR: LazyLock<myreader_core::api::content::DownloadCoordinator> =
    LazyLock::new(|| {
        myreader_core::api::content::DownloadCoordinator::new(2)
            .expect("mobile download concurrency must be positive")
    });
static CORE_RUNTIME: OnceLock<Result<tokio::runtime::Runtime, String>> = OnceLock::new();

struct NativeSyncObserver {
    task: Arc<SyncTaskState>,
}

impl myreader_core::api::sync::SyncObserver for NativeSyncObserver {
    fn is_cancelled(&self) -> bool {
        self.task.cancelled.load(Ordering::Relaxed)
    }

    fn on_progress(&self, progress: myreader_core::api::sync::SyncProgress) {
        let stage = match progress.stage {
            myreader_core::api::sync::SyncStage::Preparing => "preparing",
            myreader_core::api::sync::SyncStage::Pushing => "pushing",
            myreader_core::api::sync::SyncStage::Pulling => "pulling",
            myreader_core::api::sync::SyncStage::Applying => "applying",
            myreader_core::api::sync::SyncStage::Complete => "complete",
        };
        let mut current = self
            .task
            .progress
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        current.stage = stage.to_owned();
        current.completed = u32::try_from(progress.completed).unwrap_or(u32::MAX);
        current.total = u32::try_from(progress.total).unwrap_or(u32::MAX);
    }
}

#[uniffi::export]
pub fn sync_contract_version() -> u32 {
    11
}

#[uniffi::export]
pub fn migrate_library_database(database_path: String) -> Result<(), RustComponentsError> {
    core_runtime()?
        .block_on(myreader_core::api::migrate_library_database(Path::new(
            &database_path,
        )))
        .map_err(|error| RustComponentsError::Core(error.to_string()))
}

fn parse_core_json<T: serde::de::DeserializeOwned>(value: &str) -> Result<T, RustComponentsError> {
    serde_json::from_str(value)
        .map_err(|error| RustComponentsError::Core(format!("Invalid core input: {error}")))
}

fn serialize_core_json<T: serde::Serialize>(value: &T) -> Result<String, RustComponentsError> {
    serde_json::to_string(value)
        .map_err(|error| RustComponentsError::Core(format!("Invalid core output: {error}")))
}

fn map_core_result(
    result: Result<myreader_core::models::DeviceRegistry, myreader_core::CoreError>,
) -> Result<String, RustComponentsError> {
    serialize_core_json(&result.map_err(|error| RustComponentsError::Core(error.to_string()))?)
}

fn run_core_async<T>(
    future: impl Future<Output = Result<T, myreader_core::CoreError>>,
) -> Result<T, RustComponentsError> {
    core_runtime()?
        .block_on(future)
        .map_err(|error| RustComponentsError::Core(error.to_string()))
}

fn core_runtime() -> Result<&'static tokio::runtime::Runtime, RustComponentsError> {
    CORE_RUNTIME
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .map_err(|error| format!("Failed to start core runtime: {error}"))
        })
        .as_ref()
        .map_err(|error| RustComponentsError::Core(error.clone()))
}

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

fn sync_coordinator(
    coordinator_id: &str,
) -> Result<Arc<myreader_core::api::sync::SyncCoordinator>, RustComponentsError> {
    SYNC_COORDINATORS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(coordinator_id)
        .cloned()
        .ok_or_else(|| {
            RustComponentsError::Sync(format!(
                "Sync coordinator is not registered: {coordinator_id}"
            ))
        })
}

fn parse_sidecar_sync_mode(
    value: &str,
) -> Result<myreader_core::models::SidecarSyncMode, RustComponentsError> {
    match value {
        "push_only" => Ok(myreader_core::models::SidecarSyncMode::PushOnly),
        "full" => Ok(myreader_core::models::SidecarSyncMode::Full),
        _ => Err(RustComponentsError::Sync(format!(
            "Unsupported sidecar sync mode: {value}"
        ))),
    }
}

fn parse_sync_timing(
    value: &str,
) -> Result<myreader_core::api::sync::SyncTiming, RustComponentsError> {
    match value {
        "debounced" => Ok(myreader_core::api::sync::SyncTiming::Debounced),
        "immediate" => Ok(myreader_core::api::sync::SyncTiming::Immediate),
        _ => Err(RustComponentsError::Sync(format!(
            "Unsupported sidecar sync timing: {value}"
        ))),
    }
}

fn parse_sync_failure_kind(
    value: &str,
) -> Result<myreader_core::models::SyncFailureKind, RustComponentsError> {
    match value {
        "connectivity" => Ok(myreader_core::models::SyncFailureKind::Connectivity),
        "configuration" => Ok(myreader_core::models::SyncFailureKind::Configuration),
        "credential" => Ok(myreader_core::models::SyncFailureKind::Credential),
        "data_integrity" => Ok(myreader_core::models::SyncFailureKind::DataIntegrity),
        "unexpected" => Ok(myreader_core::models::SyncFailureKind::Unexpected),
        _ => Err(RustComponentsError::Sync(format!(
            "Unsupported sidecar sync failure kind: {value}"
        ))),
    }
}

#[uniffi::export]
pub fn initialize_device_registry(
    registry_path: String,
    legacy_registry_json: Option<String>,
) -> Result<String, RustComponentsError> {
    let legacy = legacy_registry_json
        .as_deref()
        .map(parse_core_json)
        .transpose()?;
    map_core_result(myreader_core::api::registry::load_or_initialize(
        Path::new(&registry_path),
        legacy,
    ))
}

#[uniffi::export]
pub fn upsert_device_data_source(
    registry_path: String,
    source_json: String,
) -> Result<String, RustComponentsError> {
    map_core_result(myreader_core::api::registry::upsert_data_source(
        Path::new(&registry_path),
        parse_core_json(&source_json)?,
    ))
}

#[uniffi::export]
pub fn prepare_device_data_source(source_json: String) -> Result<String, RustComponentsError> {
    let source = myreader_core::api::registry::prepare_data_source(parse_core_json(&source_json)?)
        .map_err(|error| RustComponentsError::Core(error.to_string()))?;
    serialize_core_json(&source)
}

#[uniffi::export]
pub fn validate_device_data_source(
    registry_path: String,
    source_json: String,
) -> Result<(), RustComponentsError> {
    myreader_core::api::registry::ensure_data_source_can_upsert(
        Path::new(&registry_path),
        &parse_core_json(&source_json)?,
    )
    .map_err(|error| RustComponentsError::Core(error.to_string()))
}

#[uniffi::export]
pub fn remove_device_data_source(
    registry_path: String,
    data_source_id: String,
) -> Result<String, RustComponentsError> {
    map_core_result(myreader_core::api::registry::remove_data_source(
        Path::new(&registry_path),
        &data_source_id,
    ))
}

#[uniffi::export]
pub fn register_device_library(
    registry_path: String,
    library_json: String,
) -> Result<String, RustComponentsError> {
    map_core_result(myreader_core::api::registry::register_library(
        Path::new(&registry_path),
        parse_core_json(&library_json)?,
    ))
}

#[uniffi::export]
pub fn replace_device_library(
    registry_path: String,
    library_json: String,
) -> Result<String, RustComponentsError> {
    map_core_result(myreader_core::api::registry::replace_library(
        Path::new(&registry_path),
        parse_core_json(&library_json)?,
    ))
}

#[uniffi::export]
pub fn remove_device_library(
    registry_path: String,
    library_id: String,
) -> Result<String, RustComponentsError> {
    map_core_result(myreader_core::api::registry::remove_library(
        Path::new(&registry_path),
        &library_id,
    ))
}

#[uniffi::export]
pub fn switch_device_library(
    registry_path: String,
    library_id: String,
) -> Result<String, RustComponentsError> {
    map_core_result(myreader_core::api::registry::switch_library(
        Path::new(&registry_path),
        &library_id,
    ))
}

#[uniffi::export]
pub fn add_local_library(
    registry_path: String,
    request_json: String,
) -> Result<String, RustComponentsError> {
    let request = parse_core_json(&request_json)?;
    let (registry, library) = run_core_async(myreader_core::api::library::add_local(
        Path::new(&registry_path),
        request,
    ))?;
    serialize_core_json(&serde_json::json!({
        "registry": registry,
        "library": library,
    }))
}

#[uniffi::export]
pub fn test_remote_data_source(
    source_json: String,
    credential_json: String,
) -> Result<(), RustComponentsError> {
    let source = parse_core_json(&source_json)?;
    let credential = parse_core_json(&credential_json)?;
    run_core_async(myreader_core::api::datasource::test_connection(
        &source,
        &credential,
    ))
}

#[uniffi::export]
pub fn list_remote_directories(
    registry_path: String,
    data_source_id: String,
    path: String,
    credential_json: String,
) -> Result<String, RustComponentsError> {
    let credential = parse_core_json(&credential_json)?;
    let entries = run_core_async(myreader_core::api::datasource::list_directories(
        Path::new(&registry_path),
        &data_source_id,
        &path,
        &credential,
    ))?;
    serialize_core_json(&entries)
}

#[uniffi::export]
pub fn add_remote_library(
    registry_path: String,
    request_json: String,
    credential_json: String,
) -> Result<String, RustComponentsError> {
    let request = parse_core_json(&request_json)?;
    let credential = parse_core_json(&credential_json)?;
    let (registry, library) = run_core_async(myreader_core::api::library::add_remote(
        Path::new(&registry_path),
        request,
        &credential,
    ))?;
    serialize_core_json(&serde_json::json!({
        "registry": registry,
        "library": library,
    }))
}

#[uniffi::export]
pub fn refresh_remote_library(
    registry_path: String,
    library_id: String,
    local_root_path: String,
    credential_json: String,
) -> Result<String, RustComponentsError> {
    let credential = parse_core_json(&credential_json)?;
    let (registry, library) = run_core_async(myreader_core::api::library::refresh_remote(
        Path::new(&registry_path),
        &library_id,
        Path::new(&local_root_path),
        &credential,
    ))?;
    serialize_core_json(&serde_json::json!({
        "registry": registry,
        "library": library,
    }))
}

#[uniffi::export]
pub fn validate_calibre_library(library_root_path: String) -> bool {
    myreader_core::api::catalog::validate_library(Path::new(&library_root_path))
}

#[uniffi::export]
pub fn count_calibre_books(library_root_path: String) -> Result<u64, RustComponentsError> {
    let count = run_core_async(myreader_core::api::catalog::count_books(Path::new(
        &library_root_path,
    )))?;
    u64::try_from(count)
        .map_err(|error| RustComponentsError::Core(format!("Invalid Calibre book count: {error}")))
}

#[uniffi::export]
pub fn list_calibre_books(library_root_path: String) -> Result<String, RustComponentsError> {
    let books = run_core_async(myreader_core::api::catalog::list_books(Path::new(
        &library_root_path,
    )))?;
    serialize_core_json(&books)
}

#[uniffi::export]
pub fn list_calibre_books_page(
    library_root_path: String,
    offset: u64,
    limit: u64,
    sort_by: Option<String>,
    search: Option<String>,
) -> Result<String, RustComponentsError> {
    let offset = usize::try_from(offset)
        .map_err(|error| RustComponentsError::Core(format!("Invalid page offset: {error}")))?;
    let limit = usize::try_from(limit)
        .map_err(|error| RustComponentsError::Core(format!("Invalid page limit: {error}")))?;
    let page = run_core_async(myreader_core::api::catalog::list_books_page(
        Path::new(&library_root_path),
        offset,
        limit,
        sort_by.as_deref(),
        search.as_deref(),
    ))?;
    serialize_core_json(&page)
}

#[uniffi::export]
pub fn list_calibre_books_page_by_last_read(
    library_root_path: String,
    sidecar_root_path: String,
    offset: u64,
    limit: u64,
    search: Option<String>,
) -> Result<String, RustComponentsError> {
    let offset = usize::try_from(offset)
        .map_err(|error| RustComponentsError::Core(format!("Invalid page offset: {error}")))?;
    let limit = usize::try_from(limit)
        .map_err(|error| RustComponentsError::Core(format!("Invalid page limit: {error}")))?;
    let page = run_core_async(myreader_core::api::catalog::list_books_page_by_last_read(
        Path::new(&library_root_path),
        Path::new(&sidecar_root_path),
        offset,
        limit,
        search.as_deref(),
    ))?;
    serialize_core_json(&page)
}

#[uniffi::export]
pub fn get_calibre_book_detail(
    library_root_path: String,
    book_id: i64,
) -> Result<String, RustComponentsError> {
    let detail = run_core_async(myreader_core::api::catalog::get_book_detail(
        Path::new(&library_root_path),
        book_id,
    ))?;
    serialize_core_json(&detail)
}

#[uniffi::export]
pub fn list_calibre_series_books(
    library_root_path: String,
    series_name: String,
    exclude_book_id: Option<i64>,
) -> Result<String, RustComponentsError> {
    let books = run_core_async(myreader_core::api::catalog::list_series_books(
        Path::new(&library_root_path),
        &series_name,
        exclude_book_id,
    ))?;
    serialize_core_json(&books)
}

#[uniffi::export]
pub fn get_calibre_library_uuid(library_root_path: String) -> Result<String, RustComponentsError> {
    run_core_async(myreader_core::api::catalog::get_library_uuid(Path::new(
        &library_root_path,
    )))
}

#[uniffi::export]
pub fn list_calibre_book_summaries(
    library_root_path: String,
) -> Result<String, RustComponentsError> {
    let books = run_core_async(myreader_core::api::catalog::list_book_summaries(Path::new(
        &library_root_path,
    )))?;
    serialize_core_json(&books)
}

#[uniffi::export]
pub fn list_calibre_book_formats(
    library_root_path: String,
    book_id: i64,
) -> Result<String, RustComponentsError> {
    let formats = run_core_async(myreader_core::api::catalog::list_book_formats(
        Path::new(&library_root_path),
        book_id,
    ))?;
    serialize_core_json(&formats)
}

#[uniffi::export]
pub fn list_book_reading_formats(
    sidecar_root_path: String,
    library_root_path: String,
) -> Result<String, RustComponentsError> {
    let formats = run_core_async(myreader_core::api::content::list_reading_formats(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
    ))?;
    serialize_core_json(&formats)
}

#[uniffi::export]
pub fn set_book_reading_format(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: Option<String>,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::set_reading_format(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        format.as_deref(),
    ))
}

#[uniffi::export]
pub fn get_library_file_state(
    sidecar_root_path: String,
    path: String,
) -> Result<String, RustComponentsError> {
    let state = run_core_async(myreader_core::api::content::get_file_state(
        Path::new(&sidecar_root_path),
        &path,
    ))?;
    serialize_core_json(&state)
}

#[uniffi::export]
pub fn list_library_file_states(sidecar_root_path: String) -> Result<String, RustComponentsError> {
    let states = run_core_async(myreader_core::api::content::list_file_states(Path::new(
        &sidecar_root_path,
    )))?;
    serialize_core_json(&states)
}

#[uniffi::export]
pub fn upsert_library_file_state(
    sidecar_root_path: String,
    path: String,
    update_json: String,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::upsert_file_state(
        Path::new(&sidecar_root_path),
        &path,
        parse_core_json(&update_json)?,
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
) -> Result<String, RustComponentsError> {
    let downloaded = run_core_async(myreader_core::api::content::finalize_downloaded_file(
        Path::new(&sidecar_root_path),
        &relative_path,
        Path::new(&local_path),
    ))?;
    serialize_core_json(&downloaded)
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
) -> Result<String, RustComponentsError> {
    let rows = run_core_async(myreader_core::api::content::list_cover_thumbnail_cache(
        Path::new(&sidecar_root_path),
        &thumbnail_version,
        width_px,
        height_px,
    ))?;
    serialize_core_json(&rows)
}

#[uniffi::export]
pub fn upsert_book_cover_thumbnail_cache(
    sidecar_root_path: String,
    patch_json: String,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::upsert_cover_thumbnail_cache(
        Path::new(&sidecar_root_path),
        parse_core_json(&patch_json)?,
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

#[uniffi::export]
pub fn list_favorite_book_ids(sidecar_root_path: String) -> Result<String, RustComponentsError> {
    let ids = run_core_async(myreader_core::api::reading::list_favorite_book_ids(
        Path::new(&sidecar_root_path),
    ))?;
    serialize_core_json(&ids)
}

#[uniffi::export]
pub fn set_favorite_book(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    is_favorite: bool,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::set_favorite_book(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        is_favorite,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn get_reading_position(
    sidecar_root_path: String,
    book_id: i64,
    format: String,
) -> Result<String, RustComponentsError> {
    let position = run_core_async(myreader_core::api::reading::get_reading_position(
        Path::new(&sidecar_root_path),
        book_id,
        &format,
    ))?;
    serialize_core_json(&position)
}

#[uniffi::export]
pub fn list_reading_positions(sidecar_root_path: String) -> Result<String, RustComponentsError> {
    let positions = run_core_async(myreader_core::api::reading::list_reading_positions(
        Path::new(&sidecar_root_path),
    ))?;
    serialize_core_json(&positions)
}

#[uniffi::export]
pub fn set_reading_position(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    locator_json: String,
    display_progression: Option<f64>,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::set_reading_position(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &locator_json,
        display_progression,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn list_reading_position_candidates(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    now_ms: i64,
) -> Result<String, RustComponentsError> {
    let candidates = run_core_async(
        myreader_core::api::reading::list_reading_position_candidates(
            Path::new(&sidecar_root_path),
            Path::new(&library_root_path),
            book_id,
            &format,
            now_ms,
        ),
    )?;
    serialize_core_json(&candidates)
}

#[uniffi::export]
pub fn select_reading_position_candidate(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    operation_id: String,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(
        myreader_core::api::reading::select_reading_position_candidate(
            Path::new(&sidecar_root_path),
            Path::new(&library_root_path),
            book_id,
            &format,
            &operation_id,
            recorded_at_ms,
        ),
    )
}

#[uniffi::export]
pub fn list_reader_bookmarks(
    sidecar_root_path: String,
    book_id: i64,
    format: String,
) -> Result<String, RustComponentsError> {
    let bookmarks = run_core_async(myreader_core::api::reading::list_reader_bookmarks(
        Path::new(&sidecar_root_path),
        book_id,
        &format,
    ))?;
    serialize_core_json(&bookmarks)
}

#[uniffi::export]
pub fn add_reader_bookmark(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    locator_key: String,
    locator_json: String,
    recorded_at_ms: i64,
) -> Result<String, RustComponentsError> {
    let bookmark = run_core_async(myreader_core::api::reading::add_reader_bookmark(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &locator_key,
        &locator_json,
        recorded_at_ms,
    ))?;
    serialize_core_json(&bookmark)
}

#[uniffi::export]
pub fn remove_reader_bookmark(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    locator_key: String,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::remove_reader_bookmark(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &locator_key,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn list_reader_annotations(
    sidecar_root_path: String,
    book_id: i64,
    format: String,
) -> Result<String, RustComponentsError> {
    let annotations = run_core_async(myreader_core::api::reading::list_reader_annotations(
        Path::new(&sidecar_root_path),
        book_id,
        &format,
    ))?;
    serialize_core_json(&annotations)
}

#[uniffi::export]
pub fn add_reader_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    locator_json: String,
    color: String,
    note: Option<String>,
    recorded_at_ms: i64,
) -> Result<String, RustComponentsError> {
    let annotation = run_core_async(myreader_core::api::reading::add_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &locator_json,
        &color,
        note.as_deref(),
        recorded_at_ms,
    ))?;
    serialize_core_json(&annotation)
}

#[uniffi::export]
pub fn update_reader_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    id: String,
    color: String,
    note: Option<String>,
    recorded_at_ms: i64,
) -> Result<String, RustComponentsError> {
    let annotation = run_core_async(myreader_core::api::reading::update_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &id,
        &color,
        note.as_deref(),
        recorded_at_ms,
    ))?;
    serialize_core_json(&annotation)
}

#[uniffi::export]
pub fn remove_reader_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    id: String,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::remove_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &id,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn add_reading_session_interval(
    sidecar_root_path: String,
    library_root_path: String,
    id: String,
    book_id: i64,
    format: String,
    local_day: String,
    started_at_ms: i64,
    duration_seconds: i64,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::add_reading_session_interval(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &id,
        book_id,
        &format,
        &local_day,
        started_at_ms,
        duration_seconds,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn add_reading_completion(
    sidecar_root_path: String,
    library_root_path: String,
    id: String,
    book_id: i64,
    format: String,
    local_day: String,
    completed_at_ms: i64,
    recorded_at_ms: i64,
) -> Result<bool, RustComponentsError> {
    run_core_async(myreader_core::api::reading::add_reading_completion(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &id,
        book_id,
        &format,
        &local_day,
        completed_at_ms,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn get_reading_statistics(
    sidecar_root_path: String,
    library_root_path: String,
    start_day: String,
    end_day: String,
) -> Result<String, RustComponentsError> {
    let statistics = run_core_async(myreader_core::api::reading::get_reading_statistics(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &start_day,
        &end_day,
    ))?;
    serialize_core_json(&statistics)
}

#[uniffi::export]
pub fn read_sync_task_progress(task_id: String) -> Option<SyncTaskProgress> {
    SYNC_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(&task_id)
        .map(|task| {
            task.progress
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .clone()
        })
}

#[uniffi::export]
pub fn cancel_sync_task(task_id: String) -> bool {
    let task = SYNC_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(&task_id)
        .cloned();
    let Some(task) = task else {
        return false;
    };
    task.cancelled.store(true, Ordering::Relaxed);
    task.progress
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .stage = "cancelling".to_owned();
    true
}

#[uniffi::export]
pub fn release_sync_task(task_id: String) -> bool {
    SYNC_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .remove(&task_id)
        .is_some()
}

fn parse_now_ms(value: &str) -> Result<i64, RustComponentsError> {
    value
        .parse()
        .map_err(|_| RustComponentsError::Sync("Sync timestamp is invalid".to_owned()))
}

fn parse_scheduler_timestamp(value: &str) -> Result<u64, RustComponentsError> {
    value
        .parse()
        .map_err(|_| RustComponentsError::Sync("Sync timestamp is invalid".to_owned()))
}

#[uniffi::export]
pub fn create_sync_coordinator(coordinator_id: String) -> bool {
    SYNC_COORDINATORS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .insert(
            coordinator_id,
            Arc::new(myreader_core::api::sync::SyncCoordinator::default()),
        )
        .is_none()
}

#[uniffi::export]
pub fn request_coordinated_sync(
    coordinator_id: String,
    library_id: String,
    mode: String,
    reason: String,
    timing: String,
    now_ms: String,
) -> Result<String, RustComponentsError> {
    serialize_core_json(&sync_coordinator(&coordinator_id)?.request(
        &library_id,
        parse_sidecar_sync_mode(&mode)?,
        &reason,
        parse_sync_timing(&timing)?,
        parse_scheduler_timestamp(&now_ms)?,
    ))
}

#[uniffi::export]
pub fn flush_coordinated_sync(
    coordinator_id: String,
    library_id: String,
    reason: String,
    now_ms: String,
) -> Result<String, RustComponentsError> {
    serialize_core_json(&sync_coordinator(&coordinator_id)?.flush(
        &library_id,
        &reason,
        parse_scheduler_timestamp(&now_ms)?,
    ))
}

#[uniffi::export]
pub fn recover_coordinated_sync(
    coordinator_id: String,
    sidecar_root_path: String,
    library_id: String,
    now_ms: String,
) -> Result<String, RustComponentsError> {
    let coordinator = sync_coordinator(&coordinator_id)?;
    let transition = run_core_async(coordinator.recover_library(
        Path::new(&sidecar_root_path),
        &library_id,
        parse_scheduler_timestamp(&now_ms)?,
    ))?;
    serialize_core_json(&transition)
}

#[uniffi::export]
pub fn request_coordinated_pull(
    coordinator_id: String,
    sidecar_root_path: String,
    library_id: String,
    reason: String,
    now_ms: String,
    freshness_ms: String,
) -> Result<String, RustComponentsError> {
    let coordinator = sync_coordinator(&coordinator_id)?;
    let transition = run_core_async(coordinator.request_contextual_pull(
        Path::new(&sidecar_root_path),
        &library_id,
        &reason,
        parse_scheduler_timestamp(&now_ms)?,
        parse_scheduler_timestamp(&freshness_ms)?,
    ))?;
    serialize_core_json(&transition)
}

#[uniffi::export]
pub fn begin_coordinated_sync(
    coordinator_id: String,
    library_id: String,
    generation: u64,
) -> Result<String, RustComponentsError> {
    serialize_core_json(&sync_coordinator(&coordinator_id)?.begin(&library_id, generation))
}

#[uniffi::export]
pub fn effective_coordinated_sync_execution(
    coordinator_id: String,
    sidecar_root_path: String,
    execution_json: String,
    now_ms: String,
    freshness_ms: String,
) -> Result<Option<String>, RustComponentsError> {
    let coordinator = sync_coordinator(&coordinator_id)?;
    let execution = run_core_async(coordinator.effective_execution(
        Path::new(&sidecar_root_path),
        parse_core_json(&execution_json)?,
        parse_scheduler_timestamp(&now_ms)?,
        parse_scheduler_timestamp(&freshness_ms)?,
    ))?;
    execution.as_ref().map(serialize_core_json).transpose()
}

#[uniffi::export]
pub fn complete_coordinated_sync(
    coordinator_id: String,
    library_id: String,
    now_ms: String,
) -> Result<String, RustComponentsError> {
    serialize_core_json(
        &sync_coordinator(&coordinator_id)?
            .complete(&library_id, parse_scheduler_timestamp(&now_ms)?),
    )
}

#[uniffi::export]
pub fn fail_coordinated_sync(
    coordinator_id: String,
    sidecar_root_path: String,
    execution_json: String,
    failure_kind: String,
    reason: String,
    now_ms: String,
    random_fraction: f64,
) -> Result<String, RustComponentsError> {
    let coordinator = sync_coordinator(&coordinator_id)?;
    let transition = run_core_async(coordinator.fail(
        Path::new(&sidecar_root_path),
        parse_core_json(&execution_json)?,
        parse_sync_failure_kind(&failure_kind)?,
        &reason,
        parse_scheduler_timestamp(&now_ms)?,
        random_fraction,
    ))?;
    serialize_core_json(&transition)
}

#[uniffi::export]
pub fn set_coordinated_sync_library_online(
    coordinator_id: String,
    library_id: String,
    online: bool,
    now_ms: String,
) -> Result<String, RustComponentsError> {
    serialize_core_json(&sync_coordinator(&coordinator_id)?.set_library_online(
        &library_id,
        online,
        parse_scheduler_timestamp(&now_ms)?,
    ))
}

#[uniffi::export]
pub fn dispose_sync_coordinator(coordinator_id: String) -> Result<String, RustComponentsError> {
    let coordinator = SYNC_COORDINATORS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .remove(&coordinator_id)
        .ok_or_else(|| {
            RustComponentsError::Sync(format!(
                "Sync coordinator is not registered: {coordinator_id}"
            ))
        })?;
    serialize_core_json(&coordinator.dispose())
}

#[uniffi::export]
pub fn sync_library_sidecar(
    task_id: String,
    sidecar_root_path: String,
    library_root_path: String,
    now_ms: String,
    mode: String,
    storage_json: String,
) -> Result<SyncLibrarySidecarReport, RustComponentsError> {
    let mode = parse_sidecar_sync_mode(&mode)?;
    let storage = serde_json::from_str(&storage_json)
        .map_err(|error| RustComponentsError::Sync(format!("Invalid storage config: {error}")))?;
    let now_ms = parse_now_ms(&now_ms)?;
    let task = Arc::new(SyncTaskState {
        cancelled: AtomicBool::new(false),
        progress: Mutex::new(SyncTaskProgress {
            task_id: task_id.clone(),
            stage: "preparing".to_owned(),
            completed: 0,
            total: 0,
        }),
    });
    {
        let mut tasks = SYNC_TASKS.lock().unwrap_or_else(|error| error.into_inner());
        if tasks.contains_key(&task_id) {
            return Err(RustComponentsError::Sync(format!(
                "Sync task already exists: {task_id}"
            )));
        }
        tasks.insert(task_id, task.clone());
    }
    let report = core_runtime()?.block_on(myreader_core::api::sync::sync_sidecar_observed(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        now_ms,
        mode,
        &storage,
        &NativeSyncObserver { task: task.clone() },
    ));
    let report = match report {
        Ok(report) => report,
        Err(error) => {
            let failure_stage = {
                let mut progress = task
                    .progress
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                progress.stage = if task.cancelled.load(Ordering::Relaxed) {
                    "cancelled".to_owned()
                } else {
                    format!("{}_failed", progress.stage)
                };
                progress.stage.clone()
            };
            let message = error.to_string();
            return Err(RustComponentsError::Sync(if failure_stage == "cancelled" {
                message
            } else {
                format!("[stage={failure_stage}] {message}")
            }));
        }
    };
    Ok(SyncLibrarySidecarReport {
        pushed: u32::try_from(report.pushed)
            .map_err(|_| RustComponentsError::Sync("Pushed count is out of range".to_owned()))?,
        pulled: u32::try_from(report.pulled)
            .map_err(|_| RustComponentsError::Sync("Pulled count is out of range".to_owned()))?,
    })
}

uniffi::setup_scaffolding!();
