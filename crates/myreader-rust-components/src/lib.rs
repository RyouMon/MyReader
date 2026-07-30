//! Aggregation root for MyReader Rust components.

use std::{
    collections::HashMap,
    future::Future,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
};

pub use myreader_core::sync;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum RustComponentsError {
    #[error("CORE_ERROR: {0}")]
    Core(String),

    #[error("SYNC_ERROR: {0}")]
    Sync(String),
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncDatabaseScheduleState {
    pub last_successful_pull_at: Option<i64>,
    pub next_retry_at: Option<i64>,
    pub transient_failure_count: u32,
    pub suspended_reason: Option<String>,
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

struct SyncTaskState {
    cancelled: AtomicBool,
    progress: Mutex<SyncTaskProgress>,
}

static SYNC_TASKS: LazyLock<Mutex<HashMap<String, Arc<SyncTaskState>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

struct NativeSyncObserver {
    task: Arc<SyncTaskState>,
}

impl sync::exchange::SyncObserver for NativeSyncObserver {
    fn is_cancelled(&self) -> bool {
        self.task.cancelled.load(Ordering::Relaxed)
    }

    fn on_progress(&self, progress: sync::exchange::SyncProgress) {
        let stage = match progress.stage {
            sync::exchange::SyncStage::Preparing => "preparing",
            sync::exchange::SyncStage::Pushing => "pushing",
            sync::exchange::SyncStage::Pulling => "pulling",
            sync::exchange::SyncStage::Applying => "applying",
            sync::exchange::SyncStage::Complete => "complete",
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
    9
}

#[uniffi::export]
pub fn migrate_library_database(database_path: String) -> Result<(), RustComponentsError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| {
            RustComponentsError::Core(format!("Failed to start database runtime: {error}"))
        })?;
    runtime
        .block_on(myreader_core::database::migrate_database_file(Path::new(
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
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| {
            RustComponentsError::Core(format!("Failed to start core runtime: {error}"))
        })?;
    runtime
        .block_on(future)
        .map_err(|error| RustComponentsError::Core(error.to_string()))
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
    start_day: String,
    end_day: String,
) -> Result<String, RustComponentsError> {
    let statistics = run_core_async(myreader_core::api::reading::get_reading_statistics(
        Path::new(&sidecar_root_path),
        &start_day,
        &end_day,
    ))?;
    serialize_core_json(&statistics)
}

#[uniffi::export]
pub fn list_legacy_finished_readings(
    sidecar_root_path: String,
) -> Result<String, RustComponentsError> {
    let readings = run_core_async(myreader_core::api::reading::list_legacy_finished_readings(
        Path::new(&sidecar_root_path),
    ))?;
    serialize_core_json(&readings)
}

#[uniffi::export]
pub fn advance_sync_scheduler(
    state_json: Option<String>,
    policy_json: String,
    event_json: String,
) -> Result<String, RustComponentsError> {
    sync::scheduler::reduce_json(state_json.as_deref(), &policy_json, &event_json)
        .map_err(map_sync_error)
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

fn map_sync_error(error: sync::SyncError) -> RustComponentsError {
    match error {
        sync::SyncError::Sync(message) => RustComponentsError::Sync(message),
    }
}

fn parse_now_ms(value: &str) -> Result<i64, RustComponentsError> {
    value
        .parse()
        .map_err(|_| RustComponentsError::Sync("Sync timestamp is invalid".to_owned()))
}

fn parse_sidecar_sync_mode(
    value: &str,
) -> Result<myreader_core::models::SidecarSyncMode, RustComponentsError> {
    match value {
        "push_only" => Ok(myreader_core::models::SidecarSyncMode::PushOnly),
        "full" => Ok(myreader_core::models::SidecarSyncMode::Full),
        _ => Err(RustComponentsError::Sync(
            "Sync mode is unsupported".to_owned(),
        )),
    }
}

#[uniffi::export]
pub fn read_sidecar_sync_schedule(
    sidecar_root_path: String,
) -> Result<SyncDatabaseScheduleState, RustComponentsError> {
    let state = run_core_async(myreader_core::api::sync::schedule_snapshot(Path::new(
        &sidecar_root_path,
    )))?;
    Ok(SyncDatabaseScheduleState {
        last_successful_pull_at: state.last_successful_pull_at,
        next_retry_at: state.next_retry_at,
        transient_failure_count: state.transient_failure_count,
        suspended_reason: state.suspended_reason,
    })
}

#[uniffi::export]
pub fn effective_sidecar_sync_mode(
    sidecar_root_path: String,
    requested_mode: String,
    now_ms: String,
    freshness_ms: String,
) -> Result<Option<String>, RustComponentsError> {
    let mode = run_core_async(myreader_core::api::sync::effective_mode(
        Path::new(&sidecar_root_path),
        parse_sidecar_sync_mode(&requested_mode)?,
        parse_now_ms(&now_ms)?,
        parse_now_ms(&freshness_ms)?,
    ))?;
    Ok(mode.map(|mode| match mode {
        myreader_core::models::SidecarSyncMode::PushOnly => "push_only".to_owned(),
        myreader_core::models::SidecarSyncMode::Full => "full".to_owned(),
    }))
}

#[uniffi::export]
pub fn record_sidecar_sync_retry(
    sidecar_root_path: String,
    next_retry_at: String,
    failure_count: u32,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::sync::record_retry(
        Path::new(&sidecar_root_path),
        parse_now_ms(&next_retry_at)?,
        failure_count,
    ))
}

#[uniffi::export]
pub fn record_sidecar_sync_suspension(
    sidecar_root_path: String,
    reason: String,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::sync::record_suspension(
        Path::new(&sidecar_root_path),
        &reason,
    ))
}

#[uniffi::export]
pub fn has_sidecar_sync_pending_work(
    sidecar_root_path: String,
) -> Result<bool, RustComponentsError> {
    run_core_async(myreader_core::api::sync::has_pending_work(Path::new(
        &sidecar_root_path,
    )))
}

#[uniffi::export]
pub fn classify_sidecar_sync_failure(kind: String) -> String {
    let kind = match kind.as_str() {
        "connectivity" => myreader_core::models::SyncFailureKind::Connectivity,
        "configuration" => myreader_core::models::SyncFailureKind::Configuration,
        "credential" => myreader_core::models::SyncFailureKind::Credential,
        "data_integrity" => myreader_core::models::SyncFailureKind::DataIntegrity,
        _ => myreader_core::models::SyncFailureKind::Unexpected,
    };
    match myreader_core::api::sync::classify_failure(kind) {
        myreader_core::models::SyncFailureDisposition::Retry => "retry".to_owned(),
        myreader_core::models::SyncFailureDisposition::Suspend => "suspend".to_owned(),
    }
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
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| {
            RustComponentsError::Sync(format!("Failed to start sync runtime: {error}"))
        })?;
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
    let report = runtime.block_on(myreader_core::api::sync::sync_sidecar_observed(
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
