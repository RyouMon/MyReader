use std::{
    collections::HashMap,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
};

use crate::{
    core_runtime, parse_core_json, run_core_async, serialize_core_json, RustComponentsError,
};

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
static SYNC_COORDINATORS: LazyLock<
    Mutex<HashMap<String, Arc<myreader_core::api::sync::SyncCoordinator>>>,
> = LazyLock::new(|| Mutex::new(HashMap::new()));

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
