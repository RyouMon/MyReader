use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use my_reader_core::api::sync::{SyncObserver, SyncProgress, SyncReport, SyncStage};
use my_reader_core::models::SyncFailureKind;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tracing::error;

use crate::error::AppError;

pub(crate) const SYNC_STATUS_OBSERVATION_EVENT: &str = "sync_status_observation";

static NEXT_SYNC_TASK_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SyncStatusReason {
    Manual,
    LocalChange,
    AutomaticCheck,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum SyncStatusObservation {
    Started {
        library_id: String,
        task_id: String,
        started_at: u64,
        reason: SyncStatusReason,
    },
    Progress {
        library_id: String,
        task_id: String,
        stage: SyncStage,
        completed: usize,
        total: usize,
    },
    Succeeded {
        library_id: String,
        task_id: String,
        completed_at: u64,
        reason: SyncStatusReason,
    },
    Unchanged {
        library_id: String,
        task_id: String,
        completed_at: u64,
        reason: SyncStatusReason,
    },
    Failed {
        library_id: String,
        task_id: String,
        completed_at: u64,
        failure_kind: SyncFailureKind,
        failure_stage: Option<SyncStage>,
        message: String,
        reason: SyncStatusReason,
    },
}

pub(crate) struct SyncStatusEmitter<R: Runtime> {
    app: AppHandle<R>,
    library_id: String,
    task_id: String,
    reason: SyncStatusReason,
    failure_stage: Mutex<Option<SyncStage>>,
    sidecar_completed: AtomicBool,
    emit_sidecar_completion: bool,
}

impl<R: Runtime> SyncStatusEmitter<R> {
    pub(crate) fn new(
        app: AppHandle<R>,
        library_id: String,
        reason: SyncStatusReason,
        emit_sidecar_completion: bool,
    ) -> Self {
        let sequence = NEXT_SYNC_TASK_ID.fetch_add(1, Ordering::Relaxed);
        Self {
            app,
            task_id: format!("{library_id}:{}:{sequence}", unix_epoch_millis()),
            library_id,
            reason,
            failure_stage: Mutex::new(None),
            sidecar_completed: AtomicBool::new(false),
            emit_sidecar_completion,
        }
    }

    pub(crate) fn started(&self) {
        self.emit(SyncStatusObservation::Started {
            library_id: self.library_id.clone(),
            task_id: self.task_id.clone(),
            started_at: unix_epoch_millis(),
            reason: self.reason,
        });
    }

    pub(crate) fn finished(&self, changed: bool) {
        let completed_at = unix_epoch_millis();
        let observation = if changed {
            SyncStatusObservation::Succeeded {
                library_id: self.library_id.clone(),
                task_id: self.task_id.clone(),
                completed_at,
                reason: self.reason,
            }
        } else {
            SyncStatusObservation::Unchanged {
                library_id: self.library_id.clone(),
                task_id: self.task_id.clone(),
                completed_at,
                reason: self.reason,
            }
        };
        self.emit(observation);
    }

    pub(crate) fn failed(&self, failure_kind: SyncFailureKind, failure: &AppError) {
        self.emit(SyncStatusObservation::Failed {
            library_id: self.library_id.clone(),
            task_id: self.task_id.clone(),
            completed_at: unix_epoch_millis(),
            failure_kind,
            failure_stage: self.failure_stage(),
            message: failure.to_string(),
            reason: self.reason,
        });
    }

    fn emit(&self, observation: SyncStatusObservation) {
        if let Err(event_error) = self.app.emit(SYNC_STATUS_OBSERVATION_EVENT, observation) {
            error!(
                target: "myreader_sync",
                event = "sync.status_event_failed",
                library_id = self.library_id,
                error = %event_error,
                "Failed to emit sync status observation"
            );
        }
    }

    fn failure_stage(&self) -> Option<SyncStage> {
        *self
            .failure_stage
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }
}

impl<R: Runtime> SyncObserver for SyncStatusEmitter<R> {
    fn is_cancelled(&self) -> bool {
        false
    }

    fn on_progress(&self, progress: SyncProgress) {
        if tracks_failure_stage(
            progress.stage,
            self.sidecar_completed.load(Ordering::Relaxed),
        ) {
            *self
                .failure_stage
                .lock()
                .unwrap_or_else(|error| error.into_inner()) = Some(progress.stage);
        }
        self.emit(SyncStatusObservation::Progress {
            library_id: self.library_id.clone(),
            task_id: self.task_id.clone(),
            stage: progress.stage,
            completed: progress.completed,
            total: progress.total,
        });
    }

    fn on_sidecar_complete(&self, report: &SyncReport) {
        self.sidecar_completed.store(true, Ordering::Relaxed);
        if self.emit_sidecar_completion {
            emit_sidecar_sync_completed(&self.app, &self.library_id, report.pushed, report.pulled);
        }
    }
}

pub(crate) fn emit_sidecar_sync_completed<R: Runtime>(
    app: &AppHandle<R>,
    library_id: &str,
    pushed: usize,
    pulled: usize,
) {
    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Payload<'a> {
        library_id: &'a str,
        mode: &'static str,
        pushed: usize,
        pulled: usize,
    }

    if let Err(event_error) = app.emit(
        "sidecar_sync_completed",
        Payload {
            library_id,
            mode: "full",
            pushed,
            pulled,
        },
    ) {
        error!(
            target: "myreader_sync",
            event = "sync.sidecar_event_failed",
            library_id,
            error = %event_error,
            "Failed to emit sidecar completion"
        );
    }
}

fn tracks_failure_stage(stage: SyncStage, sidecar_completed: bool) -> bool {
    match stage {
        SyncStage::Complete => false,
        SyncStage::Calibre => sidecar_completed,
        _ => true,
    }
}

fn unix_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn should_serialize_camel_case_progress_when_bridging_to_desktop() {
        let value = serde_json::to_value(SyncStatusObservation::Progress {
            library_id: "library-1".to_owned(),
            task_id: "task-1".to_owned(),
            stage: SyncStage::Pulling,
            completed: 2,
            total: 4,
        })
        .unwrap();

        assert_eq!(
            value,
            json!({
                "type": "progress",
                "libraryId": "library-1",
                "taskId": "task-1",
                "stage": "pulling",
                "completed": 2,
                "total": 4,
            })
        );
    }

    #[test]
    fn should_keep_sidecar_stage_when_calibre_runs_after_sidecar_failure() {
        assert!(!tracks_failure_stage(SyncStage::Calibre, false));
        assert!(tracks_failure_stage(SyncStage::Calibre, true));
        assert!(!tracks_failure_stage(SyncStage::Complete, true));
    }
}
