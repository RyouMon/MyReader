use std::{
    collections::HashMap,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
};

use serde::{Deserialize, Serialize};

use crate::{core_runtime, run_core_async, CoreFfiError};

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub(super) struct SyncTaskProgress {
    task_id: String,
    stage: String,
    completed: u32,
    total: u32,
}

struct SyncTaskState {
    cancelled: AtomicBool,
    progress: Mutex<SyncTaskProgress>,
}

static SYNC_TASKS: LazyLock<Mutex<HashMap<String, Arc<SyncTaskState>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static SYNC_COORDINATORS: LazyLock<
    Mutex<HashMap<String, Arc<my_reader_core::api::sync::SyncCoordinator>>>,
> = LazyLock::new(|| Mutex::new(HashMap::new()));

struct TransportSyncObserver {
    task: Arc<SyncTaskState>,
}

impl my_reader_core::api::sync::SyncObserver for TransportSyncObserver {
    fn is_cancelled(&self) -> bool {
        self.task.cancelled.load(Ordering::Relaxed)
    }

    fn on_progress(&self, progress: my_reader_core::api::sync::SyncProgress) {
        let stage = match progress.stage {
            my_reader_core::api::sync::SyncStage::Preparing => "preparing",
            my_reader_core::api::sync::SyncStage::Pushing => "pushing",
            my_reader_core::api::sync::SyncStage::Pulling => "pulling",
            my_reader_core::api::sync::SyncStage::Applying => "applying",
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
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub(super) enum SyncFailureKind {
    Connectivity,
    Configuration,
    Credential,
    DataIntegrity,
    Unexpected,
}

impl From<SyncFailureKind> for my_reader_core::models::SyncFailureKind {
    fn from(value: SyncFailureKind) -> Self {
        match value {
            SyncFailureKind::Connectivity => Self::Connectivity,
            SyncFailureKind::Configuration => Self::Configuration,
            SyncFailureKind::Credential => Self::Credential,
            SyncFailureKind::DataIntegrity => Self::DataIntegrity,
            SyncFailureKind::Unexpected => Self::Unexpected,
        }
    }
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(
    tag = "operation",
    content = "input",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum SyncRequest {
    CreateCoordinator {
        coordinator_id: String,
    },
    Request {
        coordinator_id: String,
        library_id: String,
        mode: my_reader_core::models::SidecarSyncMode,
        reason: String,
        timing: my_reader_core::api::sync::SyncTiming,
        now_ms: u64,
    },
    Flush {
        coordinator_id: String,
        library_id: String,
        reason: String,
        now_ms: u64,
    },
    Begin {
        coordinator_id: String,
        library_id: String,
        generation: u64,
    },
    Complete {
        coordinator_id: String,
        library_id: String,
        now_ms: u64,
    },
    SetLibraryOnline {
        coordinator_id: String,
        library_id: String,
        online: bool,
        now_ms: u64,
    },
    DisposeCoordinator {
        coordinator_id: String,
    },
    ReadTaskProgress {
        task_id: String,
    },
    CancelTask {
        task_id: String,
    },
    ReleaseTask {
        task_id: String,
    },
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum SyncResponse {
    CreateCoordinator(bool),
    Request(my_reader_core::api::sync::SchedulerTransition),
    Flush(my_reader_core::api::sync::SchedulerTransition),
    Begin(my_reader_core::api::sync::SchedulerTransition),
    Complete(my_reader_core::api::sync::SchedulerTransition),
    SetLibraryOnline(my_reader_core::api::sync::SchedulerTransition),
    DisposeCoordinator(my_reader_core::api::sync::SchedulerTransition),
    ReadTaskProgress(Option<SyncTaskProgress>),
    CancelTask(bool),
    ReleaseTask(bool),
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(
    tag = "operation",
    content = "input",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum SyncAsyncRequest {
    Recover {
        coordinator_id: String,
        sidecar_root_path: String,
        library_id: String,
        now_ms: u64,
    },
    RequestContextualPull {
        coordinator_id: String,
        sidecar_root_path: String,
        library_id: String,
        reason: String,
        now_ms: u64,
        freshness_ms: u64,
    },
    EffectiveExecution {
        coordinator_id: String,
        sidecar_root_path: String,
        execution: my_reader_core::api::sync::SyncExecution,
        now_ms: u64,
        freshness_ms: u64,
    },
    Fail {
        coordinator_id: String,
        sidecar_root_path: String,
        execution: my_reader_core::api::sync::SyncExecution,
        failure_kind: SyncFailureKind,
        reason: String,
        now_ms: u64,
        random_fraction: f64,
    },
    RunSidecar {
        task_id: String,
        sidecar_root_path: String,
        library_root_path: String,
        now_ms: i64,
        mode: my_reader_core::models::SidecarSyncMode,
        storage: my_reader_core::models::SidecarStorageConfig,
    },
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum SyncAsyncResponse {
    Recover(my_reader_core::api::sync::SchedulerTransition),
    RequestContextualPull(my_reader_core::api::sync::SchedulerTransition),
    EffectiveExecution(Option<my_reader_core::api::sync::SyncExecution>),
    Fail(my_reader_core::api::sync::SchedulerTransition),
    RunSidecar(my_reader_core::models::SidecarSyncReport),
}

pub(super) fn handle(request: SyncRequest) -> Result<SyncResponse, CoreFfiError> {
    Ok(match request {
        SyncRequest::CreateCoordinator { coordinator_id } => {
            let inserted = SYNC_COORDINATORS
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .insert(
                    coordinator_id,
                    Arc::new(my_reader_core::api::sync::SyncCoordinator::default()),
                )
                .is_none();
            SyncResponse::CreateCoordinator(inserted)
        }
        SyncRequest::Request {
            coordinator_id,
            library_id,
            mode,
            reason,
            timing,
            now_ms,
        } => SyncResponse::Request(sync_coordinator(&coordinator_id)?.request(
            &library_id,
            mode,
            &reason,
            timing,
            now_ms,
        )),
        SyncRequest::Flush {
            coordinator_id,
            library_id,
            reason,
            now_ms,
        } => SyncResponse::Flush(sync_coordinator(&coordinator_id)?.flush(
            &library_id,
            &reason,
            now_ms,
        )),
        SyncRequest::Begin {
            coordinator_id,
            library_id,
            generation,
        } => SyncResponse::Begin(sync_coordinator(&coordinator_id)?.begin(&library_id, generation)),
        SyncRequest::Complete {
            coordinator_id,
            library_id,
            now_ms,
        } => {
            SyncResponse::Complete(sync_coordinator(&coordinator_id)?.complete(&library_id, now_ms))
        }
        SyncRequest::SetLibraryOnline {
            coordinator_id,
            library_id,
            online,
            now_ms,
        } => SyncResponse::SetLibraryOnline(sync_coordinator(&coordinator_id)?.set_library_online(
            &library_id,
            online,
            now_ms,
        )),
        SyncRequest::DisposeCoordinator { coordinator_id } => {
            let coordinator = SYNC_COORDINATORS
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .remove(&coordinator_id)
                .ok_or_else(|| {
                    CoreFfiError::Sync(format!(
                        "Sync coordinator is not registered: {coordinator_id}"
                    ))
                })?;
            SyncResponse::DisposeCoordinator(coordinator.dispose())
        }
        SyncRequest::ReadTaskProgress { task_id } => {
            let progress = SYNC_TASKS
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .get(&task_id)
                .map(|task| {
                    task.progress
                        .lock()
                        .unwrap_or_else(|error| error.into_inner())
                        .clone()
                });
            SyncResponse::ReadTaskProgress(progress)
        }
        SyncRequest::CancelTask { task_id } => {
            let task = SYNC_TASKS
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .get(&task_id)
                .cloned();
            let cancelled = if let Some(task) = task {
                task.cancelled.store(true, Ordering::Relaxed);
                task.progress
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .stage = "cancelling".to_owned();
                true
            } else {
                false
            };
            SyncResponse::CancelTask(cancelled)
        }
        SyncRequest::ReleaseTask { task_id } => SyncResponse::ReleaseTask(
            SYNC_TASKS
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .remove(&task_id)
                .is_some(),
        ),
    })
}

pub(super) fn handle_async(request: SyncAsyncRequest) -> Result<SyncAsyncResponse, CoreFfiError> {
    Ok(match request {
        SyncAsyncRequest::Recover {
            coordinator_id,
            sidecar_root_path,
            library_id,
            now_ms,
        } => SyncAsyncResponse::Recover(run_core_async(
            sync_coordinator(&coordinator_id)?.recover_library(
                Path::new(&sidecar_root_path),
                &library_id,
                now_ms,
            ),
        )?),
        SyncAsyncRequest::RequestContextualPull {
            coordinator_id,
            sidecar_root_path,
            library_id,
            reason,
            now_ms,
            freshness_ms,
        } => SyncAsyncResponse::RequestContextualPull(run_core_async(
            sync_coordinator(&coordinator_id)?.request_contextual_pull(
                Path::new(&sidecar_root_path),
                &library_id,
                &reason,
                now_ms,
                freshness_ms,
            ),
        )?),
        SyncAsyncRequest::EffectiveExecution {
            coordinator_id,
            sidecar_root_path,
            execution,
            now_ms,
            freshness_ms,
        } => SyncAsyncResponse::EffectiveExecution(run_core_async(
            sync_coordinator(&coordinator_id)?.effective_execution(
                Path::new(&sidecar_root_path),
                execution,
                now_ms,
                freshness_ms,
            ),
        )?),
        SyncAsyncRequest::Fail {
            coordinator_id,
            sidecar_root_path,
            execution,
            failure_kind,
            reason,
            now_ms,
            random_fraction,
        } => SyncAsyncResponse::Fail(run_core_async(sync_coordinator(&coordinator_id)?.fail(
            Path::new(&sidecar_root_path),
            execution,
            failure_kind.into(),
            &reason,
            now_ms,
            random_fraction,
        ))?),
        SyncAsyncRequest::RunSidecar {
            task_id,
            sidecar_root_path,
            library_root_path,
            now_ms,
            mode,
            storage,
        } => SyncAsyncResponse::RunSidecar(run_sidecar(
            task_id,
            sidecar_root_path,
            library_root_path,
            now_ms,
            mode,
            storage,
        )?),
    })
}

fn sync_coordinator(
    coordinator_id: &str,
) -> Result<Arc<my_reader_core::api::sync::SyncCoordinator>, CoreFfiError> {
    SYNC_COORDINATORS
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .get(coordinator_id)
        .cloned()
        .ok_or_else(|| {
            CoreFfiError::Sync(format!(
                "Sync coordinator is not registered: {coordinator_id}"
            ))
        })
}

fn run_sidecar(
    task_id: String,
    sidecar_root_path: String,
    library_root_path: String,
    now_ms: i64,
    mode: my_reader_core::models::SidecarSyncMode,
    storage: my_reader_core::models::SidecarStorageConfig,
) -> Result<my_reader_core::models::SidecarSyncReport, CoreFfiError> {
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
            return Err(CoreFfiError::Sync(format!(
                "Sync task already exists: {task_id}"
            )));
        }
        tasks.insert(task_id, task.clone());
    }
    let report = core_runtime()?.block_on(my_reader_core::api::sync::sync_sidecar_observed(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        now_ms,
        mode,
        &storage,
        &TransportSyncObserver { task: task.clone() },
    ));
    match report {
        Ok(report) => Ok(report),
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
            Err(CoreFfiError::Sync(if failure_stage == "cancelled" {
                message
            } else {
                format!("[stage={failure_stage}] {message}")
            }))
        }
    }
}
