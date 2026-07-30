use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use myreader_core::api::sync::{
    SchedulerEvent, SchedulerPolicy, SchedulerState, SchedulerTransition, SyncMode, SyncTiming,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Semaphore;
use tracing::{error, info};

use crate::commands::AppState;
use crate::services::sync_service::{SidecarSyncMode, SyncService};

const PULL_FRESHNESS_MS: u64 = 30_000;
const SAFETY_SWEEP_MS: u64 = 60_000;
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
    RecoverySweep,
    StartupRecovery,
}

impl SidecarSyncReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::LocalChange => "local_change",
            Self::AppFocused => "app_focused",
            Self::NetworkReconnected => "network_reconnected",
            Self::LibraryActivated => "library_activated",
            Self::RecoverySweep => "recovery_sweep",
            Self::StartupRecovery => "startup_recovery",
        }
    }
}

fn scheduler_mode(mode: SidecarSyncMode) -> SyncMode {
    match mode {
        SidecarSyncMode::PushOnly => SyncMode::PushOnly,
        SidecarSyncMode::Full => SyncMode::Full,
    }
}

fn scheduler_timing(timing: SidecarSyncTiming) -> SyncTiming {
    match timing {
        SidecarSyncTiming::Debounced => SyncTiming::Debounced,
        SidecarSyncTiming::Immediate => SyncTiming::Immediate,
    }
}

fn safety_sweep_delay_ms(random_fraction: f64) -> u64 {
    let factor = 0.8 + random_fraction.clamp(0.0, 1.0) * 0.4;
    (SAFETY_SWEEP_MS as f64 * factor) as u64
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarSyncCompletedPayload {
    library_id: String,
    mode: &'static str,
    pushed: usize,
    pulled: usize,
}

#[derive(Clone)]
pub struct SidecarSyncScheduler {
    app: AppHandle,
    app_data_dir: PathBuf,
    state: Arc<Mutex<SchedulerState>>,
    concurrency: Arc<Semaphore>,
}

impl SidecarSyncScheduler {
    pub fn start(app: AppHandle, app_data_dir: PathBuf) -> Self {
        let scheduler = Self {
            app,
            app_data_dir,
            state: Arc::new(Mutex::new(SchedulerState::new(SchedulerPolicy::default()))),
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
        let transition = self
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .apply(SchedulerEvent::Request {
                library_id,
                mode: scheduler_mode(mode),
                reason: reason.as_str().to_owned(),
                timing: scheduler_timing(timing),
                now_ms,
            });
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
                let snapshot = match SyncService::schedule_snapshot(
                    &scheduler.app_data_dir,
                    &config,
                    &library.id,
                )
                .await
                {
                    Ok(snapshot) => snapshot,
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
                };
                scheduler
                    .state
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .apply(SchedulerEvent::Restore {
                        library_id: library.id.clone(),
                        next_retry_at: snapshot.next_retry_at,
                        retry_count: snapshot.transient_failure_count,
                        suspended: snapshot.suspended_reason.is_some(),
                    });
                if snapshot.suspended_reason.is_some() {
                    continue;
                }
                match SyncService::has_pending_sidecar_work(
                    &scheduler.app_data_dir,
                    &config,
                    &library.id,
                )
                .await
                {
                    Ok(true) => scheduler.request(
                        library.id.clone(),
                        SidecarSyncMode::PushOnly,
                        SidecarSyncReason::StartupRecovery,
                        SidecarSyncTiming::Immediate,
                    ),
                    Ok(false) => {}
                    Err(error) => error!(
                        target: "myreader_sync",
                        event = "sync.scheduler_recovery_failed",
                        library_id = library.id,
                        error = %error,
                        "Failed to inspect pending sidecar work"
                    ),
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
            let transition = self
                .state
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .apply(SchedulerEvent::WakeRetry {
                    library_id: library_id.clone(),
                    now_ms,
                });
            self.spawn_transition(transition);
        }
        self.recover_pending_work();
        self.schedule_active_pull(SidecarSyncReason::NetworkReconnected);
    }

    pub fn resume_library(&self, library_id: &str) {
        let transition = self
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .apply(SchedulerEvent::Resume {
                library_id: library_id.to_owned(),
                now_ms: unix_epoch_millis(),
            });
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
        let transition = self
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .apply(SchedulerEvent::Begin {
                library_id: library_id.clone(),
                generation,
            });
        let Some(execution) = transition.execution else {
            return;
        };
        let _permit = match self.concurrency.acquire().await {
            Ok(permit) => permit,
            Err(_) => return,
        };
        let config = self.config_snapshot();
        let mode = SyncService::effective_mode(
            &self.app_data_dir,
            &config,
            &execution.library_id,
            match execution.mode {
                SyncMode::PushOnly => SidecarSyncMode::PushOnly,
                SyncMode::Full => SidecarSyncMode::Full,
            },
            unix_epoch_millis(),
            PULL_FRESHNESS_MS,
        )
        .await;
        let result = match mode {
            Ok(Some(mode)) => SyncService::sync_sidecar_for_library(
                &self.app_data_dir,
                &config,
                &library_id,
                mode,
            )
            .await
            .map(|report| Some((mode, report))),
            Ok(None) => Ok(None),
            Err(error) => Err(error),
        };

        match result {
            Ok(Some((mode, report))) => {
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
                    let _ = self.app.emit(
                        "sidecar_sync_completed",
                        SidecarSyncCompletedPayload {
                            library_id: library_id.clone(),
                            mode: "full",
                            pushed: report.pushed,
                            pulled: report.pulled,
                        },
                    );
                }
                let transition = self
                    .state
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .apply(SchedulerEvent::Complete {
                        library_id,
                        now_ms: unix_epoch_millis(),
                    });
                self.spawn_transition(transition);
            }
            Ok(None) => {
                let transition = self
                    .state
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .apply(SchedulerEvent::Complete {
                        library_id,
                        now_ms: unix_epoch_millis(),
                    });
                self.spawn_transition(transition);
            }
            Err(error) if SyncService::should_suspend(&error) => {
                error!(
                    target: "myreader_sync",
                    event = "sync.scheduler_suspended",
                    library_id,
                    error = %error,
                    "Suspended automatic sidecar sync"
                );
                self.state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .apply(SchedulerEvent::Suspend { execution });
                if let Err(state_error) = SyncService::record_suspension(
                    &self.app_data_dir,
                    &config,
                    &library_id,
                    error.to_string(),
                )
                .await
                {
                    error!(
                        target: "myreader_sync",
                        event = "sync.scheduler_state_write_failed",
                        library_id,
                        error = %state_error,
                        "Failed to persist sidecar scheduler suspension"
                    );
                }
            }
            Err(error) => {
                error!(
                    target: "myreader_sync",
                    event = "sync.scheduler_retry",
                    library_id,
                    error = %error,
                    "Scheduled automatic sidecar sync retry"
                );
                let random_fraction = jitter_fraction();
                let transition = self
                    .state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .apply(SchedulerEvent::Retry {
                        execution,
                        now_ms: unix_epoch_millis(),
                        random_fraction,
                    });
                let Some(retry) = transition.retry.as_ref() else {
                    return;
                };
                if let Err(state_error) = SyncService::record_retry(
                    &self.app_data_dir,
                    &config,
                    &library_id,
                    retry.next_retry_at,
                    retry.retry_count,
                )
                .await
                {
                    error!(
                        target: "myreader_sync",
                        event = "sync.scheduler_state_write_failed",
                        library_id,
                        error = %state_error,
                        "Failed to persist sidecar scheduler retry"
                    );
                }
                self.spawn_transition(transition);
            }
        }
    }

    fn start_safety_sweep(&self) {
        let scheduler = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(safety_sweep_delay_ms(
                    jitter_fraction(),
                )))
                .await;
                scheduler.schedule_active_pull(SidecarSyncReason::RecoverySweep);
            }
        });
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

    #[test]
    fn should_keep_safety_sweep_between_48_and_72_seconds_when_jittering() {
        assert_eq!(safety_sweep_delay_ms(0.0), 48_000);
        assert_eq!(safety_sweep_delay_ms(1.0), 72_000);
    }
}
