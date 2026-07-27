use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Semaphore;
use tracing::{error, info};

use crate::commands::AppState;
use crate::error::AppError;
use crate::services::sync_service::{SidecarSyncMode, SyncService};

const DEBOUNCE_MS: u64 = 2_000;
const MAX_WAIT_MS: u64 = 10_000;
const PULL_FRESHNESS_MS: u64 = 30_000;
const RETRY_BASE_MS: u64 = 2_000;
const RETRY_MAX_MS: u64 = 5 * 60_000;
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct SidecarSyncExecution {
    library_id: String,
    mode: SidecarSyncMode,
    reasons: BTreeSet<SidecarSyncReason>,
}

#[derive(Debug, Clone)]
struct PendingIntent {
    mode: SidecarSyncMode,
    reasons: BTreeSet<SidecarSyncReason>,
    first_requested_at: u64,
    deadline: u64,
    generation: u64,
}

#[derive(Debug, Default)]
struct LibrarySchedule {
    pending: Option<PendingIntent>,
    running: bool,
    retry_count: u32,
}

#[derive(Debug, Default)]
struct SchedulerState {
    libraries: HashMap<String, LibrarySchedule>,
    suspended: HashSet<String>,
    blocked_until: HashMap<String, u64>,
    next_generation: u64,
}

impl SchedulerState {
    fn request(
        &mut self,
        library_id: &str,
        mode: SidecarSyncMode,
        reason: SidecarSyncReason,
        timing: SidecarSyncTiming,
        now_ms: u64,
    ) -> Option<(u64, u64)> {
        if self.suspended.contains(library_id) {
            return None;
        }
        self.next_generation += 1;
        let generation = self.next_generation;
        let schedule = self.libraries.entry(library_id.to_owned()).or_default();
        let pending = schedule.pending.get_or_insert_with(|| PendingIntent {
            mode,
            reasons: BTreeSet::new(),
            first_requested_at: now_ms,
            deadline: now_ms,
            generation,
        });
        pending.mode = merge_mode(pending.mode, mode);
        pending.reasons.insert(reason);
        pending.generation = generation;
        pending.deadline = match timing {
            SidecarSyncTiming::Immediate => now_ms,
            SidecarSyncTiming::Debounced => {
                (now_ms + DEBOUNCE_MS).min(pending.first_requested_at + MAX_WAIT_MS)
            }
        }
        .max(self.blocked_until.get(library_id).copied().unwrap_or(0));
        if schedule.running {
            None
        } else {
            Some((generation, pending.deadline))
        }
    }

    fn begin(&mut self, library_id: &str, generation: u64) -> Option<SidecarSyncExecution> {
        let schedule = self.libraries.get_mut(library_id)?;
        let pending = schedule.pending.as_ref()?;
        if schedule.running || pending.generation != generation {
            return None;
        }
        let pending = schedule.pending.take()?;
        schedule.running = true;
        Some(SidecarSyncExecution {
            library_id: library_id.to_owned(),
            mode: pending.mode,
            reasons: pending.reasons,
        })
    }

    fn complete(&mut self, library_id: &str, now_ms: u64) -> Option<(u64, u64)> {
        let schedule = self.libraries.get_mut(library_id)?;
        schedule.running = false;
        schedule.retry_count = 0;
        self.blocked_until.remove(library_id);
        schedule
            .pending
            .as_ref()
            .map(|pending| (pending.generation, pending.deadline.max(now_ms)))
    }

    fn retry(
        &mut self,
        execution: SidecarSyncExecution,
        now_ms: u64,
        random_fraction: f64,
    ) -> (u64, u64, u32) {
        self.next_generation += 1;
        let generation = self.next_generation;
        let schedule = self
            .libraries
            .entry(execution.library_id.clone())
            .or_default();
        schedule.running = false;
        schedule.retry_count += 1;
        let delay = retry_delay_ms(schedule.retry_count, random_fraction);
        self.blocked_until
            .insert(execution.library_id.clone(), now_ms + delay);
        let pending = schedule.pending.get_or_insert_with(|| PendingIntent {
            mode: execution.mode,
            reasons: BTreeSet::new(),
            first_requested_at: now_ms,
            deadline: now_ms + delay,
            generation,
        });
        pending.mode = merge_mode(pending.mode, execution.mode);
        pending.reasons.extend(execution.reasons);
        pending.generation = generation;
        pending.deadline = now_ms + delay;
        (generation, pending.deadline, schedule.retry_count)
    }

    fn suspend(&mut self, execution: SidecarSyncExecution) {
        if let Some(schedule) = self.libraries.get_mut(&execution.library_id) {
            schedule.running = false;
        }
        self.suspended.insert(execution.library_id);
    }

    fn resume(&mut self, library_id: &str, now_ms: u64) -> Option<(u64, u64)> {
        self.suspended.remove(library_id);
        self.blocked_until.remove(library_id);
        let schedule = self.libraries.get_mut(library_id)?;
        schedule.retry_count = 0;
        schedule
            .pending
            .as_ref()
            .map(|pending| (pending.generation, pending.deadline.max(now_ms)))
    }

    fn wake_retry(&mut self, library_id: &str, now_ms: u64) -> Option<(u64, u64)> {
        self.blocked_until.remove(library_id);
        let schedule = self.libraries.get_mut(library_id)?;
        schedule.pending.as_mut().map(|pending| {
            pending.deadline = now_ms;
            (pending.generation, pending.deadline)
        })
    }

    fn restore(
        &mut self,
        library_id: &str,
        next_retry_at: Option<u64>,
        retry_count: u32,
        suspended: bool,
    ) {
        self.libraries
            .entry(library_id.to_owned())
            .or_default()
            .retry_count = retry_count;
        if suspended {
            self.suspended.insert(library_id.to_owned());
        }
        if let Some(next_retry_at) = next_retry_at {
            self.blocked_until
                .insert(library_id.to_owned(), next_retry_at);
        }
    }
}

fn merge_mode(current: SidecarSyncMode, incoming: SidecarSyncMode) -> SidecarSyncMode {
    if current == SidecarSyncMode::Full || incoming == SidecarSyncMode::Full {
        SidecarSyncMode::Full
    } else {
        SidecarSyncMode::PushOnly
    }
}

fn retry_delay_ms(retry_count: u32, random_fraction: f64) -> u64 {
    let ceiling = RETRY_BASE_MS
        .saturating_mul(2_u64.saturating_pow(retry_count.saturating_sub(1)))
        .min(RETRY_MAX_MS);
    (ceiling as f64 * random_fraction.clamp(0.0, 1.0)) as u64
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
            state: Arc::new(Mutex::new(SchedulerState::default())),
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
        let scheduled = self
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .request(&library_id, mode, reason, timing, now_ms);
        if let Some((generation, deadline)) = scheduled {
            self.spawn_deadline(library_id, generation, deadline);
        }
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
                    .restore(
                        &library.id,
                        snapshot.next_retry_at,
                        snapshot.transient_failure_count,
                        snapshot.suspended_reason.is_some(),
                    );
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
            let scheduled = self
                .state
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .wake_retry(library_id, now_ms);
            if let Some((generation, deadline)) = scheduled {
                self.spawn_deadline(library_id.clone(), generation, deadline);
            }
        }
        self.recover_pending_work();
        self.schedule_active_pull(SidecarSyncReason::NetworkReconnected);
    }

    pub fn resume_library(&self, library_id: &str) {
        let scheduled = self
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .resume(library_id, unix_epoch_millis());
        if let Some((generation, deadline)) = scheduled {
            self.spawn_deadline(library_id.to_owned(), generation, deadline);
        }
    }

    fn config_snapshot(&self) -> crate::models::AppConfig {
        self.app
            .state::<AppState>()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
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
        let execution = self
            .state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .begin(&library_id, generation);
        let Some(execution) = execution else {
            return;
        };
        let _permit = match self.concurrency.acquire().await {
            Ok(permit) => permit,
            Err(_) => return,
        };
        let config = self.config_snapshot();
        let mode = self.effective_mode(&config, &execution).await;
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
                let scheduled = self
                    .state
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .complete(&library_id, unix_epoch_millis());
                if let Some((generation, deadline)) = scheduled {
                    self.spawn_deadline(library_id, generation, deadline);
                }
            }
            Ok(None) => {
                let scheduled = self
                    .state
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .complete(&library_id, unix_epoch_millis());
                if let Some((generation, deadline)) = scheduled {
                    self.spawn_deadline(library_id, generation, deadline);
                }
            }
            Err(error) if should_suspend(&error) => {
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
                    .suspend(execution);
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
                let (generation, deadline, retry_count) = self
                    .state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .retry(execution, unix_epoch_millis(), random_fraction);
                if let Err(state_error) = SyncService::record_retry(
                    &self.app_data_dir,
                    &config,
                    &library_id,
                    deadline,
                    retry_count,
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
                self.spawn_deadline(library_id, generation, deadline);
            }
        }
    }

    async fn effective_mode(
        &self,
        config: &crate::models::AppConfig,
        execution: &SidecarSyncExecution,
    ) -> Result<Option<SidecarSyncMode>, AppError> {
        if execution.mode == SidecarSyncMode::PushOnly {
            return Ok(Some(SidecarSyncMode::PushOnly));
        }
        if !SyncService::is_pull_fresh(
            &self.app_data_dir,
            config,
            &execution.library_id,
            unix_epoch_millis(),
            PULL_FRESHNESS_MS,
        )
        .await?
        {
            return Ok(Some(SidecarSyncMode::Full));
        }
        if SyncService::has_pending_sidecar_work(&self.app_data_dir, config, &execution.library_id)
            .await?
        {
            return Ok(Some(SidecarSyncMode::PushOnly));
        }
        Ok(None)
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

fn should_suspend(error: &AppError) -> bool {
    matches!(
        error,
        AppError::Credential(_) | AppError::Auth(_) | AppError::Config(_)
    )
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
    fn should_coalesce_and_upgrade_work_when_changes_arrive_during_debounce() {
        let mut state = SchedulerState::default();
        state.request(
            "library-1",
            SidecarSyncMode::PushOnly,
            SidecarSyncReason::LocalChange,
            SidecarSyncTiming::Debounced,
            1_000,
        );
        let (generation, deadline) = state
            .request(
                "library-1",
                SidecarSyncMode::Full,
                SidecarSyncReason::AppFocused,
                SidecarSyncTiming::Debounced,
                2_000,
            )
            .unwrap();

        assert_eq!(deadline, 4_000);
        assert_eq!(
            state.begin("library-1", generation),
            Some(SidecarSyncExecution {
                library_id: "library-1".to_owned(),
                mode: SidecarSyncMode::Full,
                reasons: BTreeSet::from([
                    SidecarSyncReason::LocalChange,
                    SidecarSyncReason::AppFocused,
                ]),
            })
        );
    }

    #[test]
    fn should_execute_by_maximum_wait_when_changes_keep_resetting_debounce() {
        let mut state = SchedulerState::default();
        let mut scheduled = None;
        for now_ms in (0..=10_000).step_by(1_000) {
            scheduled = state.request(
                "library-1",
                SidecarSyncMode::PushOnly,
                SidecarSyncReason::LocalChange,
                SidecarSyncTiming::Debounced,
                now_ms,
            );
        }

        assert_eq!(scheduled.unwrap().1, MAX_WAIT_MS);
    }

    #[test]
    fn should_rerun_without_overlap_when_work_arrives_during_execution() {
        let mut state = SchedulerState::default();
        let (generation, _) = state
            .request(
                "library-1",
                SidecarSyncMode::PushOnly,
                SidecarSyncReason::LocalChange,
                SidecarSyncTiming::Immediate,
                1_000,
            )
            .unwrap();
        assert!(state.begin("library-1", generation).is_some());

        assert!(state
            .request(
                "library-1",
                SidecarSyncMode::Full,
                SidecarSyncReason::NetworkReconnected,
                SidecarSyncTiming::Immediate,
                1_100,
            )
            .is_none());
        let (rerun_generation, _) = state.complete("library-1", 1_200).unwrap();
        let rerun = state.begin("library-1", rerun_generation).unwrap();

        assert_eq!(rerun.mode, SidecarSyncMode::Full);
        assert_eq!(
            rerun.reasons,
            BTreeSet::from([SidecarSyncReason::NetworkReconnected])
        );
    }

    #[test]
    fn should_keep_library_state_independent_when_requests_target_two_libraries() {
        let mut state = SchedulerState::default();
        let (first_generation, _) = state
            .request(
                "library-1",
                SidecarSyncMode::PushOnly,
                SidecarSyncReason::LocalChange,
                SidecarSyncTiming::Immediate,
                1_000,
            )
            .unwrap();
        let (second_generation, _) = state
            .request(
                "library-2",
                SidecarSyncMode::Full,
                SidecarSyncReason::AppFocused,
                SidecarSyncTiming::Immediate,
                1_000,
            )
            .unwrap();

        assert_eq!(
            state.begin("library-1", first_generation).unwrap().mode,
            SidecarSyncMode::PushOnly
        );
        assert_eq!(
            state.begin("library-2", second_generation).unwrap().mode,
            SidecarSyncMode::Full
        );
    }

    #[test]
    fn should_use_jittered_exponential_delay_when_retrying() {
        assert_eq!(retry_delay_ms(1, 0.5), 1_000);
        assert_eq!(retry_delay_ms(2, 0.5), 2_000);
        assert_eq!(retry_delay_ms(20, 1.0), RETRY_MAX_MS);
    }

    #[test]
    fn should_keep_safety_sweep_between_48_and_72_seconds_when_jittering() {
        assert_eq!(safety_sweep_delay_ms(0.0), 48_000);
        assert_eq!(safety_sweep_delay_ms(1.0), 72_000);
    }
}
