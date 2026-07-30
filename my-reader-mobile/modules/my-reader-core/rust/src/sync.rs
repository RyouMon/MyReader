use std::{
    collections::HashMap,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
};

use my_reader_core::api::sync::{SyncCoordinator, SyncService};

use crate::{
    types::{
        required_i64, required_u64, LibraryStorageConfig, LibrarySyncReport, LibrarySyncScope,
        SchedulerTransition, SidecarSyncMode, SidecarSyncReport, SyncExecution, SyncFailureKind,
        SyncTaskProgress, SyncTiming,
    },
    CoreFfiError,
};

struct SyncTaskState {
    cancelled: AtomicBool,
    progress: Mutex<SyncTaskProgress>,
    sidecar_report: Mutex<Option<SidecarSyncReport>>,
}

static SYNC_TASKS: LazyLock<Mutex<HashMap<String, Arc<SyncTaskState>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static SYNC_COORDINATORS: LazyLock<Mutex<HashMap<String, Arc<SyncCoordinator>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

struct FfiSyncObserver {
    task: Arc<SyncTaskState>,
}

impl my_reader_core::api::sync::SyncObserver for FfiSyncObserver {
    fn is_cancelled(&self) -> bool {
        self.task.cancelled.load(Ordering::Relaxed)
    }

    fn on_progress(&self, progress: my_reader_core::api::sync::SyncProgress) {
        let stage = match progress.stage {
            my_reader_core::api::sync::SyncStage::Preparing => "preparing",
            my_reader_core::api::sync::SyncStage::Pushing => "pushing",
            my_reader_core::api::sync::SyncStage::Pulling => "pulling",
            my_reader_core::api::sync::SyncStage::Applying => "applying",
            my_reader_core::api::sync::SyncStage::SidecarComplete => "sidecar_complete",
            my_reader_core::api::sync::SyncStage::Calibre => "calibre",
            my_reader_core::api::sync::SyncStage::Complete => "complete",
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

    fn on_sidecar_complete(&self, report: &my_reader_core::api::sync::SyncReport) {
        *self
            .task
            .sidecar_report
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(SidecarSyncReport {
            pushed: report.pushed as f64,
            pulled: report.pulled as f64,
        });
    }
}

#[uniffi::export]
pub fn sync_create_coordinator(coordinator_id: String) -> bool {
    SYNC_COORDINATORS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .insert(coordinator_id, Arc::new(SyncCoordinator::default()))
        .is_none()
}

#[uniffi::export]
pub fn sync_request(
    coordinator_id: String,
    library_id: String,
    mode: SidecarSyncMode,
    reason: String,
    timing: SyncTiming,
    now_ms: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .request(
            &library_id,
            mode.try_into()?,
            &reason,
            timing.try_into()?,
            required_u64(now_ms, "nowMs")?,
        )
        .into())
}

#[uniffi::export]
pub fn sync_flush(
    coordinator_id: String,
    library_id: String,
    reason: String,
    now_ms: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .flush(&library_id, &reason, required_u64(now_ms, "nowMs")?)
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn sync_recover(
    coordinator_id: String,
    sidecar_root_path: String,
    library_id: String,
    now_ms: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .recover_library(
            Path::new(&sidecar_root_path),
            &library_id,
            required_u64(now_ms, "nowMs")?,
        )
        .await
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn sync_request_contextual_pull(
    coordinator_id: String,
    sidecar_root_path: String,
    library_id: String,
    reason: String,
    now_ms: f64,
    freshness_ms: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .request_contextual_pull(
            Path::new(&sidecar_root_path),
            &library_id,
            &reason,
            required_u64(now_ms, "nowMs")?,
            required_u64(freshness_ms, "freshnessMs")?,
        )
        .await
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export]
pub fn sync_begin(
    coordinator_id: String,
    library_id: String,
    generation: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .begin(&library_id, required_u64(generation, "generation")?)
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn sync_effective_execution(
    coordinator_id: String,
    sidecar_root_path: String,
    execution: SyncExecution,
    now_ms: f64,
    freshness_ms: f64,
) -> Result<Option<SyncExecution>, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .effective_execution(
            Path::new(&sidecar_root_path),
            execution.try_into()?,
            required_u64(now_ms, "nowMs")?,
            required_u64(freshness_ms, "freshnessMs")?,
        )
        .await
        .map_err(CoreFfiError::from_core)?
        .map(Into::into))
}

#[uniffi::export]
pub fn sync_complete(
    coordinator_id: String,
    library_id: String,
    now_ms: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .complete(&library_id, required_u64(now_ms, "nowMs")?)
        .into())
}

#[uniffi::export]
pub fn sync_resume(
    coordinator_id: String,
    library_id: String,
    now_ms: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .resume(&library_id, required_u64(now_ms, "nowMs")?)
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn sync_fail(
    coordinator_id: String,
    sidecar_root_path: String,
    execution: SyncExecution,
    failure_kind: SyncFailureKind,
    reason: String,
    now_ms: f64,
    random_fraction: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .fail(
            Path::new(&sidecar_root_path),
            execution.try_into()?,
            failure_kind.try_into()?,
            &reason,
            required_u64(now_ms, "nowMs")?,
            random_fraction,
        )
        .await
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export]
pub fn sync_set_library_online(
    coordinator_id: String,
    library_id: String,
    online: bool,
    now_ms: f64,
) -> Result<SchedulerTransition, CoreFfiError> {
    Ok(sync_coordinator(&coordinator_id)?
        .set_library_online(&library_id, online, required_u64(now_ms, "nowMs")?)
        .into())
}

#[uniffi::export]
pub fn sync_dispose_coordinator(
    coordinator_id: String,
) -> Result<SchedulerTransition, CoreFfiError> {
    let coordinator = SYNC_COORDINATORS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .remove(&coordinator_id)
        .ok_or_else(|| {
            CoreFfiError::sync(format!(
                "Sync coordinator is not registered: {coordinator_id}"
            ))
        })?;
    Ok(coordinator.dispose().into())
}

#[uniffi::export]
pub fn sync_read_task_progress(task_id: String) -> Option<SyncTaskProgress> {
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
pub fn sync_read_task_sidecar_report(task_id: String) -> Option<SidecarSyncReport> {
    SYNC_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(&task_id)
        .and_then(|task| {
            task.sidecar_report
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .clone()
        })
}

#[uniffi::export]
pub fn sync_cancel_task(task_id: String) -> bool {
    let task = SYNC_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(&task_id)
        .cloned();
    if let Some(task) = task {
        task.cancelled.store(true, Ordering::Relaxed);
        task.progress
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .stage = "cancelling".to_owned();
        true
    } else {
        false
    }
}

#[uniffi::export]
pub fn sync_release_task(task_id: String) -> bool {
    SYNC_TASKS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .remove(&task_id)
        .is_some()
}

#[allow(clippy::too_many_arguments)]
#[uniffi::export(async_runtime = "tokio")]
pub async fn sync_run_library(
    task_id: String,
    config_path: String,
    sidecar_root_path: String,
    library_root_path: String,
    library_id: String,
    now_ms: f64,
    scope: LibrarySyncScope,
    force_calibre: bool,
    mode: SidecarSyncMode,
    storage: LibraryStorageConfig,
) -> Result<LibrarySyncReport, CoreFfiError> {
    let task = create_sync_task(&task_id)?;
    let storage = storage.try_into()?;
    let report = SyncService::sync_library_observed(
        Path::new(&config_path),
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &library_id,
        required_i64(now_ms, "nowMs")?,
        my_reader_core::models::LibrarySyncOptions {
            scope: scope.try_into()?,
            force_calibre,
            sidecar_mode: mode.try_into()?,
        },
        &storage,
        &FfiSyncObserver { task: task.clone() },
    )
    .await;

    report
        .map(Into::into)
        .map_err(CoreFfiError::from_core)
        .map_err(|error| {
            let mut progress = task
                .progress
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            progress.stage = if task.cancelled.load(Ordering::Relaxed) {
                "cancelled".to_owned()
            } else {
                format!("{}_failed", progress.stage)
            };
            error
        })
}

fn create_sync_task(task_id: &str) -> Result<Arc<SyncTaskState>, CoreFfiError> {
    let task = Arc::new(SyncTaskState {
        cancelled: AtomicBool::new(false),
        progress: Mutex::new(SyncTaskProgress {
            task_id: task_id.to_owned(),
            stage: "preparing".to_owned(),
            completed: 0,
            total: 0,
        }),
        sidecar_report: Mutex::new(None),
    });
    let mut tasks = SYNC_TASKS.lock().unwrap_or_else(|error| error.into_inner());
    if tasks.contains_key(task_id) {
        return Err(CoreFfiError::sync(format!(
            "Sync task already exists: {task_id}"
        )));
    }
    tasks.insert(task_id.to_owned(), task.clone());
    Ok(task)
}

fn sync_coordinator(coordinator_id: &str) -> Result<Arc<SyncCoordinator>, CoreFfiError> {
    SYNC_COORDINATORS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(coordinator_id)
        .cloned()
        .ok_or_else(|| {
            CoreFfiError::sync(format!(
                "Sync coordinator is not registered: {coordinator_id}"
            ))
        })
}
