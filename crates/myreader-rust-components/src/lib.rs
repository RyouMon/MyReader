//! Aggregation root for MyReader Rust components.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
};

pub use myreader_sync as sync;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum RustComponentsError {
    #[error("SYNC_ERROR: {0}")]
    Sync(String),
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncDocumentCommandResult {
    pub schema_version: u32,
    pub heads: Vec<String>,
    pub projection_json: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncDatabaseIdentity {
    pub library_uuid: String,
    pub replica_id: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncDatabaseScheduleState {
    pub last_successful_pull_at: Option<i64>,
    pub next_retry_at: Option<i64>,
    pub transient_failure_count: u32,
    pub suspended_reason: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncDatabaseDiagnostics {
    pub schema_version: Option<i64>,
    pub heads: Vec<String>,
    pub changes: i64,
    pub pending_outbox: i64,
    pub receipts: i64,
    pub projection_version: Option<i64>,
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
    7
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

fn map_document_result(
    result: sync::document_engine::DocumentCommandResult,
) -> Result<SyncDocumentCommandResult, RustComponentsError> {
    let projection_json = serde_json::to_string(&result.projection)
        .map_err(|error| RustComponentsError::Sync(format!("Invalid projection: {error}")))?;
    Ok(SyncDocumentCommandResult {
        schema_version: u32::try_from(result.schema_version)
            .map_err(|_| RustComponentsError::Sync("Schema version is out of range".to_owned()))?,
        heads: result.heads,
        projection_json,
    })
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

#[uniffi::export]
pub fn ensure_sync_database_identity(
    database_path: String,
    library_uuid: String,
) -> Result<SyncDatabaseIdentity, RustComponentsError> {
    sync::persistence::ensure_database_identity(&database_path, &library_uuid)
        .map(|identity| SyncDatabaseIdentity {
            library_uuid: identity.library_uuid,
            replica_id: identity.replica_id,
        })
        .map_err(map_sync_error)
}

#[uniffi::export]
pub fn read_sync_database_schedule_state(
    database_path: String,
) -> Result<Option<SyncDatabaseScheduleState>, RustComponentsError> {
    sync::persistence::read_schedule_state(&database_path)
        .map(|state| {
            state.map(|state| SyncDatabaseScheduleState {
                last_successful_pull_at: state.last_successful_pull_at,
                next_retry_at: state.next_retry_at,
                transient_failure_count: state.transient_failure_count,
                suspended_reason: state.suspended_reason,
            })
        })
        .map_err(map_sync_error)
}

#[uniffi::export]
pub fn write_sync_database_schedule_state(
    database_path: String,
    state: SyncDatabaseScheduleState,
) -> Result<(), RustComponentsError> {
    sync::persistence::write_schedule_state(
        &database_path,
        &sync::persistence::SyncScheduleState {
            last_successful_pull_at: state.last_successful_pull_at,
            next_retry_at: state.next_retry_at,
            transient_failure_count: state.transient_failure_count,
            suspended_reason: state.suspended_reason,
        },
    )
    .map_err(map_sync_error)
}

#[uniffi::export]
pub fn mark_sync_database_schedule_succeeded(
    database_path: String,
    completed_pull_at: Option<i64>,
) -> Result<(), RustComponentsError> {
    sync::persistence::mark_schedule_succeeded(&database_path, completed_pull_at)
        .map_err(map_sync_error)
}

#[uniffi::export]
pub fn ensure_sync_database_document(
    database_path: String,
    library_uuid: String,
    replica_id: String,
    now_ms: String,
) -> Result<SyncDocumentCommandResult, RustComponentsError> {
    let identity = sync::persistence::DatabaseIdentity {
        library_uuid,
        replica_id,
    };
    let result = sync::persistence::ensure_database_document(
        &database_path,
        &identity,
        parse_now_ms(&now_ms)?,
    )
    .map_err(map_sync_error)?;
    map_document_result(result)
}

#[uniffi::export]
pub fn execute_sync_database_command(
    database_path: String,
    library_uuid: String,
    replica_id: String,
    now_ms: String,
    command_json: String,
) -> Result<SyncDocumentCommandResult, RustComponentsError> {
    let identity = sync::persistence::DatabaseIdentity {
        library_uuid,
        replica_id,
    };
    let command = serde_json::from_str(&command_json).map_err(|error| {
        RustComponentsError::Sync(format!("Invalid sync database command: {error}"))
    })?;
    let result = sync::persistence::execute_local_database_command(
        &database_path,
        &identity,
        parse_now_ms(&now_ms)?,
        command,
    )
    .map_err(map_sync_error)?;
    map_document_result(result)
}

#[uniffi::export]
pub fn has_sync_database_pending_work(database_path: String) -> Result<bool, RustComponentsError> {
    sync::exchange::has_pending_database_work(&database_path).map_err(map_sync_error)
}

#[uniffi::export]
pub fn read_sync_database_diagnostics(
    database_path: String,
) -> Result<SyncDatabaseDiagnostics, RustComponentsError> {
    sync::persistence::read_database_diagnostics(&database_path)
        .map(|diagnostics| SyncDatabaseDiagnostics {
            schema_version: diagnostics.schema_version,
            heads: diagnostics.heads,
            changes: diagnostics.changes,
            pending_outbox: diagnostics.pending_outbox,
            receipts: diagnostics.receipts,
            projection_version: diagnostics.projection_version,
        })
        .map_err(map_sync_error)
}

#[uniffi::export]
pub fn sync_library_sidecar(
    task_id: String,
    database_path: String,
    library_uuid: String,
    replica_id: String,
    now_ms: String,
    mode: String,
    storage_json: String,
) -> Result<SyncLibrarySidecarReport, RustComponentsError> {
    let mode = match mode.as_str() {
        "push_only" => sync::exchange::SyncMode::PushOnly,
        "full" => sync::exchange::SyncMode::Full,
        _ => {
            return Err(RustComponentsError::Sync(
                "Sync mode is unsupported".to_owned(),
            ))
        }
    };
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
    let report = runtime.block_on(sync::transport::sync_database_observed(
        &database_path,
        &sync::persistence::DatabaseIdentity {
            library_uuid,
            replica_id,
        },
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
            let message = match error {
                sync::SyncError::Sync(message) => message,
            };
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
