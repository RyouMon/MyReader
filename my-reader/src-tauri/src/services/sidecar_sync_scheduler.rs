use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use my_reader_core::api::sync::{
    SchedulerTransition, SyncCoordinator, SyncExecution, SyncMode, SyncTiming,
};
use my_reader_core::models::SyncFailureKind;
use tauri::{AppHandle, Manager};
use tokio::sync::Semaphore;
use tracing::{error, info};

use crate::commands::AppState;
use crate::events::sync_status::{
    emit_sidecar_sync_completed, SyncStatusEmitter, SyncStatusReason,
};
use crate::services::library_service::LibraryService;
use crate::services::sync_service::{SidecarSyncMode, SyncService};
use crate::utils::paths::library_sidecar_path;

const MAX_CONCURRENT_SYNCS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarSyncTiming {
    Debounced,
    Immediate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SidecarSyncReason {
    LocalChange,
    AppFocused,
    NetworkReconnected,
    LibraryActivated,
    SafetySweep,
    StartupRecovery,
}

impl SidecarSyncReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::LocalChange => "local_change",
            Self::AppFocused => "app_focused",
            Self::NetworkReconnected => "network_reconnected",
            Self::LibraryActivated => "library_activated",
            Self::SafetySweep => "safety_sweep",
            Self::StartupRecovery => "startup_recovery",
        }
    }
}

fn scheduler_timing(timing: SidecarSyncTiming) -> SyncTiming {
    match timing {
        SidecarSyncTiming::Debounced => SyncTiming::Debounced,
        SidecarSyncTiming::Immediate => SyncTiming::Immediate,
    }
}

#[derive(Clone)]
pub struct SidecarSyncScheduler {
    app: AppHandle,
    app_data_dir: PathBuf,
    coordinator: Arc<SyncCoordinator>,
    concurrency: Arc<Semaphore>,
}

impl SidecarSyncScheduler {
    pub fn start(app: AppHandle, app_data_dir: PathBuf) -> Self {
        let scheduler = Self {
            app,
            app_data_dir,
            coordinator: Arc::new(SyncCoordinator::default()),
            concurrency: Arc::new(Semaphore::new(MAX_CONCURRENT_SYNCS)),
        };
        scheduler.start_safety_sweep();
        scheduler
    }

    pub fn request(
        &self,
        library_id: impl Into<String>,
        mode: SidecarSyncMode,
        reason: SidecarSyncReason,
        timing: SidecarSyncTiming,
    ) {
        let library_id = library_id.into();
        let now_ms = unix_epoch_millis();
        let transition = self.coordinator.request(
            &library_id,
            mode,
            reason.as_str(),
            scheduler_timing(timing),
            now_ms,
        );
        self.spawn_transition(transition);
    }

    pub fn schedule_active_pull(&self, reason: SidecarSyncReason) {
        let active_library_id = self
            .app
            .state::<AppState>()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .active_library_id
            .clone();
        if let Some(library_id) = active_library_id {
            self.request(
                library_id,
                SidecarSyncMode::Full,
                reason,
                SidecarSyncTiming::Immediate,
            );
        }
    }

    pub fn recover_pending_work(&self) {
        let scheduler = self.clone();
        tauri::async_runtime::spawn(async move {
            let config = scheduler.config_snapshot();
            for library in &config.libraries {
                let sidecar_path = library_sidecar_path(library, &scheduler.app_data_dir);
                match scheduler
                    .coordinator
                    .recover_library(&sidecar_path, &library.id, unix_epoch_millis())
                    .await
                {
                    Ok(transition) => scheduler.spawn_transition(transition),
                    Err(error) => {
                        error!(
                            target: "myreader_sync",
                            event = "sync.scheduler_state_read_failed",
                            library_id = library.id,
                            error = %error,
                            "Failed to read sidecar scheduler state"
                        );
                        continue;
                    }
                }
            }
            scheduler.schedule_active_pull(SidecarSyncReason::StartupRecovery);
        });
    }

    pub fn network_reconnected(&self) {
        let library_ids = self
            .config_snapshot()
            .libraries
            .into_iter()
            .map(|library| library.id)
            .collect::<Vec<_>>();
        let now_ms = unix_epoch_millis();
        for library_id in &library_ids {
            let transition = self.coordinator.wake_retry(library_id, now_ms);
            self.spawn_transition(transition);
        }
        self.schedule_active_pull(SidecarSyncReason::NetworkReconnected);
    }

    pub fn resume_library(&self, library_id: &str) {
        let transition = self.coordinator.resume(library_id, unix_epoch_millis());
        self.spawn_transition(transition);
    }

    fn config_snapshot(&self) -> crate::models::AppConfig {
        self.app
            .state::<AppState>()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    fn spawn_transition(&self, transition: SchedulerTransition) {
        for scheduled in transition.schedules {
            self.spawn_deadline(
                scheduled.library_id,
                scheduled.generation,
                scheduled.deadline,
            );
        }
    }

    fn spawn_deadline(&self, library_id: String, generation: u64, deadline: u64) {
        let scheduler = self.clone();
        tauri::async_runtime::spawn(async move {
            let delay = deadline.saturating_sub(unix_epoch_millis());
            tokio::time::sleep(Duration::from_millis(delay)).await;
            scheduler.run(library_id, generation).await;
        });
    }

    async fn run(&self, library_id: String, generation: u64) {
        let transition = self.coordinator.begin(&library_id, generation);
        let Some(execution) = transition.execution else {
            return;
        };
        let _permit = match self.concurrency.acquire().await {
            Ok(permit) => permit,
            Err(_) => return,
        };
        let status = SyncStatusEmitter::new(
            self.app.clone(),
            library_id.clone(),
            status_reason(&execution),
            false,
        );
        let config = self.config_snapshot();
        let library = match LibraryService::resolve_library(Some(&library_id), &config) {
            Ok(library) => library,
            Err(error) => {
                status.failed(SyncService::failure_kind(&error), &error);
                self.fail_execution(&config, execution, error).await;
                return;
            }
        };
        let sidecar_path = library_sidecar_path(&library, &self.app_data_dir);
        let execution = match self
            .coordinator
            .effective_execution(&sidecar_path, execution.clone(), unix_epoch_millis())
            .await
        {
            Ok(Some(execution)) => execution,
            Ok(None) => {
                let transition = self.coordinator.complete(&library_id, unix_epoch_millis());
                self.spawn_transition(transition);
                return;
            }
            Err(error) => {
                let error = error.into();
                status.failed(SyncService::failure_kind(&error), &error);
                self.fail_execution(&config, execution, error).await;
                return;
            }
        };
        let mode = match execution.mode {
            SyncMode::PushOnly => SidecarSyncMode::PushOnly,
            SyncMode::Full => SidecarSyncMode::Full,
        };
        status.started();
        let result = SyncService::sync_sidecar_for_library_observed(
            &self.app_data_dir,
            &config,
            &library_id,
            mode,
            &status,
        )
        .await;

        match result {
            Ok(report) => {
                info!(
                    target: "myreader_sync",
                    event = "sync.scheduler_completed",
                    library_id,
                    mode = ?mode,
                    pushed = report.pushed,
                    pulled = report.pulled,
                    "Completed scheduled sidecar sync"
                );
                if mode == SidecarSyncMode::Full {
                    emit_sidecar_sync_completed(
                        &self.app,
                        &library_id,
                        report.pushed,
                        report.pulled,
                    );
                }
                status.finished(report.changed);
                let transition = self.coordinator.complete(&library_id, unix_epoch_millis());
                self.spawn_transition(transition);
            }
            Err(error) => {
                status.failed(SyncService::failure_kind(&error), &error);
                self.fail_execution(&config, execution, error).await;
            }
        }
    }

    async fn fail_execution(
        &self,
        config: &crate::models::AppConfig,
        execution: SyncExecution,
        failure: crate::error::AppError,
    ) {
        let library_id = execution.library_id.clone();
        let kind = SyncService::failure_kind(&failure);
        let event = if matches!(kind, SyncFailureKind::Connectivity) {
            "sync.scheduler_retry"
        } else {
            "sync.scheduler_suspended"
        };
        error!(
            target: "myreader_sync",
            event,
            library_id,
            error = %failure,
            "Scheduled automatic sidecar sync failed"
        );
        let sidecar_path = match LibraryService::resolve_library(Some(&library_id), config) {
            Ok(library) => library_sidecar_path(&library, &self.app_data_dir),
            Err(error) => {
                error!(
                    target: "myreader_sync",
                    event = "sync.scheduler_state_write_failed",
                    library_id,
                    error = %error,
                    "Failed to resolve sidecar scheduler state"
                );
                let transition = self.coordinator.complete(&library_id, unix_epoch_millis());
                self.spawn_transition(transition);
                return;
            }
        };
        match self
            .coordinator
            .fail(
                &sidecar_path,
                execution,
                kind,
                &failure.to_string(),
                unix_epoch_millis(),
                jitter_fraction(),
            )
            .await
        {
            Ok(transition) => self.spawn_transition(transition),
            Err(error) => error!(
                target: "myreader_sync",
                event = "sync.scheduler_state_write_failed",
                library_id,
                error = %error,
                "Failed to persist sidecar scheduler failure"
            ),
        }
    }

    fn start_safety_sweep(&self) {
        let scheduler = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(
                    scheduler
                        .coordinator
                        .safety_sweep_delay_ms(jitter_fraction()),
                ))
                .await;
                scheduler.schedule_active_pull(SidecarSyncReason::SafetySweep);
            }
        });
    }
}

fn status_reason(execution: &SyncExecution) -> SyncStatusReason {
    if execution.reasons.contains("local_change") {
        SyncStatusReason::LocalChange
    } else {
        SyncStatusReason::AutomaticCheck
    }
}

fn unix_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64)
}

fn jitter_fraction() -> f64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.subsec_nanos());
    f64::from(nanos % 10_000) / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn execution_with_reasons(reasons: &[&str]) -> SyncExecution {
        SyncExecution {
            library_id: "library-1".to_owned(),
            mode: SyncMode::Full,
            reasons: reasons.iter().map(|reason| (*reason).to_owned()).collect(),
        }
    }

    #[test]
    fn should_report_local_change_when_coalesced_sync_contains_local_work() {
        let execution = execution_with_reasons(&["app_focused", "local_change"]);

        assert_eq!(status_reason(&execution), SyncStatusReason::LocalChange);
    }

    #[test]
    fn should_report_automatic_check_when_sync_has_no_local_change() {
        let execution = execution_with_reasons(&["network_reconnected"]);

        assert_eq!(status_reason(&execution), SyncStatusReason::AutomaticCheck);
    }
}
