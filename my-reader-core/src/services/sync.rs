use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, LazyLock, Mutex, Weak},
};

use tokio::sync::Mutex as AsyncMutex;

use crate::{
    database,
    models::{
        SidecarStorageConfig, SidecarSyncMode, SidecarSyncReport, SyncFailureDisposition,
        SyncFailureKind, SyncScheduleSnapshot,
    },
    sync::{
        exchange::{self, SyncMode, SyncObserver},
        persistence::{self, SyncScheduleState},
        scheduler::{
            SchedulerEvent, SchedulerPolicy, SchedulerState, SchedulerTransition, SyncExecution,
            SyncTiming,
        },
        transport,
    },
    CoreError,
};

static SYNC_LOCKS: LazyLock<Mutex<HashMap<String, Weak<AsyncMutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub struct SyncCoordinator {
    state: Mutex<SchedulerState>,
}

impl Default for SyncCoordinator {
    fn default() -> Self {
        Self::new(SchedulerPolicy::default())
    }
}

impl SyncCoordinator {
    pub fn new(policy: SchedulerPolicy) -> Self {
        Self {
            state: Mutex::new(SchedulerState::new(policy)),
        }
    }

    pub fn request(
        &self,
        library_id: &str,
        mode: SidecarSyncMode,
        reason: &str,
        timing: SyncTiming,
        now_ms: u64,
    ) -> SchedulerTransition {
        self.apply(SchedulerEvent::Request {
            library_id: library_id.to_owned(),
            mode: engine_mode(mode),
            reason: reason.to_owned(),
            timing,
            now_ms,
        })
    }

    pub fn flush(&self, library_id: &str, reason: &str, now_ms: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::Flush {
            library_id: library_id.to_owned(),
            reason: reason.to_owned(),
            now_ms,
        })
    }

    pub async fn request_contextual_pull(
        &self,
        sidecar_root: &Path,
        library_id: &str,
        reason: &str,
        now_ms: u64,
        freshness_ms: u64,
    ) -> Result<SchedulerTransition, CoreError> {
        let Some(mode) = SyncService::effective_mode(
            sidecar_root,
            SidecarSyncMode::Full,
            sqlite_timestamp(now_ms)?,
            sqlite_timestamp(freshness_ms)?,
        )
        .await?
        else {
            return Ok(SchedulerTransition::default());
        };
        Ok(self.request(library_id, mode, reason, SyncTiming::Immediate, now_ms))
    }

    pub async fn recover_library(
        &self,
        sidecar_root: &Path,
        library_id: &str,
        now_ms: u64,
    ) -> Result<SchedulerTransition, CoreError> {
        let snapshot = SyncService::schedule_snapshot(sidecar_root).await?;
        self.apply(SchedulerEvent::Restore {
            library_id: library_id.to_owned(),
            next_retry_at: snapshot
                .next_retry_at
                .map(|value| u64::try_from(value.max(0)).unwrap_or_default()),
            retry_count: snapshot.transient_failure_count,
            suspended: snapshot.suspended_reason.is_some(),
        });
        if snapshot.suspended_reason.is_some()
            || !SyncService::has_pending_work(sidecar_root).await?
        {
            return Ok(SchedulerTransition::default());
        }
        Ok(self.request(
            library_id,
            SidecarSyncMode::PushOnly,
            "startup_recovery",
            SyncTiming::Immediate,
            now_ms,
        ))
    }

    pub fn begin(&self, library_id: &str, generation: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::Begin {
            library_id: library_id.to_owned(),
            generation,
        })
    }

    pub async fn effective_execution(
        &self,
        sidecar_root: &Path,
        mut execution: SyncExecution,
        now_ms: u64,
        freshness_ms: u64,
    ) -> Result<Option<SyncExecution>, CoreError> {
        let requested_mode = sidecar_mode(execution.mode);
        match SyncService::effective_mode(
            sidecar_root,
            requested_mode,
            sqlite_timestamp(now_ms)?,
            sqlite_timestamp(freshness_ms)?,
        )
        .await?
        {
            Some(mode) => {
                execution.mode = engine_mode(mode);
                Ok(Some(execution))
            }
            None => Ok(None),
        }
    }

    pub fn complete(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::Complete {
            library_id: library_id.to_owned(),
            now_ms,
        })
    }

    pub async fn fail(
        &self,
        sidecar_root: &Path,
        execution: SyncExecution,
        kind: SyncFailureKind,
        reason: &str,
        now_ms: u64,
        random_fraction: f64,
    ) -> Result<SchedulerTransition, CoreError> {
        match SyncService::classify_failure(kind) {
            SyncFailureDisposition::Retry => {
                let transition = self.apply(SchedulerEvent::Retry {
                    execution,
                    now_ms,
                    random_fraction,
                });
                if let Some(retry) = transition.retry.as_ref() {
                    SyncService::record_retry(
                        sidecar_root,
                        sqlite_timestamp(retry.next_retry_at)?,
                        retry.retry_count,
                    )
                    .await?;
                }
                Ok(transition)
            }
            SyncFailureDisposition::Suspend => {
                let transition = self.apply(SchedulerEvent::Suspend { execution });
                SyncService::record_suspension(sidecar_root, reason).await?;
                Ok(transition)
            }
        }
    }

    pub fn resume(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::Resume {
            library_id: library_id.to_owned(),
            now_ms,
        })
    }

    pub fn wake_retry(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::WakeRetry {
            library_id: library_id.to_owned(),
            now_ms,
        })
    }

    pub fn set_library_online(
        &self,
        library_id: &str,
        online: bool,
        now_ms: u64,
    ) -> SchedulerTransition {
        let transition = self.apply(SchedulerEvent::SetLibraryOnline {
            library_id: library_id.to_owned(),
            online,
            now_ms,
        });
        if online {
            self.wake_retry(library_id, now_ms)
        } else {
            transition
        }
    }

    pub fn dispose(&self) -> SchedulerTransition {
        self.apply(SchedulerEvent::Dispose)
    }

    fn apply(&self, event: SchedulerEvent) -> SchedulerTransition {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .apply(event)
    }
}

struct NoopObserver;

impl SyncObserver for NoopObserver {
    fn is_cancelled(&self) -> bool {
        false
    }

    fn on_progress(&self, _progress: exchange::SyncProgress) {}
}

fn sync_lock(database_path: &str) -> Arc<AsyncMutex<()>> {
    let mut locks = SYNC_LOCKS.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(lock) = locks.get(database_path).and_then(Weak::upgrade) {
        return lock;
    }
    let lock = Arc::new(AsyncMutex::new(()));
    locks.insert(database_path.to_owned(), Arc::downgrade(&lock));
    lock
}

fn database_path(sidecar_root: &Path) -> Result<String, CoreError> {
    database::library_db_path(&sidecar_root.to_string_lossy())
        .map(|path| path.to_string_lossy().into_owned())
}

fn engine_mode(mode: SidecarSyncMode) -> SyncMode {
    match mode {
        SidecarSyncMode::PushOnly => SyncMode::PushOnly,
        SidecarSyncMode::Full => SyncMode::Full,
    }
}

fn sidecar_mode(mode: SyncMode) -> SidecarSyncMode {
    match mode {
        SyncMode::PushOnly => SidecarSyncMode::PushOnly,
        SyncMode::Full => SidecarSyncMode::Full,
    }
}

fn sqlite_timestamp(timestamp: u64) -> Result<i64, CoreError> {
    i64::try_from(timestamp)
        .map_err(|_| CoreError::Sync("Timestamp exceeds SQLite INTEGER range".into()))
}

pub struct SyncService;

impl SyncService {
    pub async fn sync_sidecar(
        sidecar_root: &Path,
        library_root: &Path,
        now_ms: i64,
        mode: SidecarSyncMode,
        storage: &SidecarStorageConfig,
    ) -> Result<SidecarSyncReport, CoreError> {
        Self::sync_sidecar_observed(
            sidecar_root,
            library_root,
            now_ms,
            mode,
            storage,
            &NoopObserver,
        )
        .await
    }

    pub async fn sync_sidecar_observed(
        sidecar_root: &Path,
        library_root: &Path,
        now_ms: i64,
        mode: SidecarSyncMode,
        storage: &SidecarStorageConfig,
        observer: &dyn SyncObserver,
    ) -> Result<SidecarSyncReport, CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let database_path = database_path(sidecar_root)?;
        let lock = sync_lock(&database_path);
        let _guard = lock.lock().await;
        let library_uuid = super::catalog::CatalogService::get_library_uuid(library_root).await?;
        let identity = persistence::ensure_database_identity(&database_path, &library_uuid)?;
        let report = transport::sync_database_observed(
            &database_path,
            &identity,
            now_ms,
            engine_mode(mode),
            storage,
            observer,
        )
        .await?;
        persistence::mark_schedule_succeeded(
            &database_path,
            (mode == SidecarSyncMode::Full).then_some(now_ms),
        )?;
        Ok(SidecarSyncReport {
            pushed: report.pushed,
            pulled: report.pulled,
        })
    }

    pub async fn has_pending_work(sidecar_root: &Path) -> Result<bool, CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        Ok(exchange::has_pending_database_work(&database_path(
            sidecar_root,
        )?)?)
    }

    pub async fn effective_mode(
        sidecar_root: &Path,
        requested_mode: SidecarSyncMode,
        now_ms: i64,
        freshness_ms: i64,
    ) -> Result<Option<SidecarSyncMode>, CoreError> {
        if requested_mode == SidecarSyncMode::PushOnly {
            return Ok(Some(SidecarSyncMode::PushOnly));
        }
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let path = database_path(sidecar_root)?;
        let last_pull = persistence::read_schedule_state(&path)?
            .and_then(|state| state.last_successful_pull_at);
        let is_fresh = last_pull.is_some_and(|last_pull| {
            last_pull <= now_ms && now_ms.saturating_sub(last_pull) < freshness_ms
        });
        if !is_fresh {
            return Ok(Some(SidecarSyncMode::Full));
        }
        if exchange::has_pending_database_work(&path)? {
            return Ok(Some(SidecarSyncMode::PushOnly));
        }
        Ok(None)
    }

    pub async fn schedule_snapshot(sidecar_root: &Path) -> Result<SyncScheduleSnapshot, CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let state = persistence::read_schedule_state(&database_path(sidecar_root)?)?;
        Ok(SyncScheduleSnapshot {
            last_successful_pull_at: state
                .as_ref()
                .and_then(|state| state.last_successful_pull_at),
            next_retry_at: state.as_ref().and_then(|state| state.next_retry_at),
            transient_failure_count: state
                .as_ref()
                .map_or(0, |state| state.transient_failure_count),
            suspended_reason: state.and_then(|state| state.suspended_reason),
        })
    }

    pub async fn record_retry(
        sidecar_root: &Path,
        next_retry_at: i64,
        failure_count: u32,
    ) -> Result<(), CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let path = database_path(sidecar_root)?;
        let last_successful_pull_at = persistence::read_schedule_state(&path)?
            .and_then(|state| state.last_successful_pull_at);
        Ok(persistence::write_schedule_state(
            &path,
            &SyncScheduleState {
                last_successful_pull_at,
                next_retry_at: Some(next_retry_at),
                transient_failure_count: failure_count,
                suspended_reason: None,
            },
        )?)
    }

    pub async fn record_suspension(sidecar_root: &Path, reason: &str) -> Result<(), CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let path = database_path(sidecar_root)?;
        let last_successful_pull_at = persistence::read_schedule_state(&path)?
            .and_then(|state| state.last_successful_pull_at);
        Ok(persistence::write_schedule_state(
            &path,
            &SyncScheduleState {
                last_successful_pull_at,
                next_retry_at: None,
                transient_failure_count: 0,
                suspended_reason: Some(reason.to_owned()),
            },
        )?)
    }

    pub fn classify_failure(kind: SyncFailureKind) -> SyncFailureDisposition {
        match kind {
            SyncFailureKind::Connectivity => SyncFailureDisposition::Retry,
            SyncFailureKind::Configuration
            | SyncFailureKind::Credential
            | SyncFailureKind::DataIntegrity
            | SyncFailureKind::Unexpected => SyncFailureDisposition::Suspend,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn begin_execution(coordinator: &SyncCoordinator) -> crate::sync::scheduler::SyncExecution {
        let scheduled = coordinator.request(
            "library-1",
            SidecarSyncMode::Full,
            "app_foregrounded",
            crate::sync::scheduler::SyncTiming::Immediate,
            1_000,
        );
        coordinator
            .begin("library-1", scheduled.schedules[0].generation)
            .execution
            .expect("execution should begin")
    }

    #[tokio::test]
    async fn should_pull_when_no_successful_pull_exists() {
        let directory = tempfile::tempdir().unwrap();

        let mode =
            SyncService::effective_mode(directory.path(), SidecarSyncMode::Full, 1_000, 30_000)
                .await
                .unwrap();

        assert_eq!(mode, Some(SidecarSyncMode::Full));
    }

    #[tokio::test]
    async fn should_skip_when_pull_is_fresh_and_no_work_is_pending() {
        let directory = tempfile::tempdir().unwrap();
        database::open_db(directory.path().to_str().unwrap())
            .await
            .unwrap();
        let path = database_path(directory.path()).unwrap();
        persistence::mark_schedule_succeeded(&path, Some(1_000)).unwrap();

        let mode =
            SyncService::effective_mode(directory.path(), SidecarSyncMode::Full, 2_000, 30_000)
                .await
                .unwrap();

        assert_eq!(mode, None);
    }

    #[test]
    fn should_retry_only_when_failure_is_connectivity_related() {
        assert_eq!(
            SyncService::classify_failure(SyncFailureKind::Connectivity),
            SyncFailureDisposition::Retry
        );
        assert_eq!(
            SyncService::classify_failure(SyncFailureKind::Credential),
            SyncFailureDisposition::Suspend
        );
        assert_eq!(
            SyncService::classify_failure(SyncFailureKind::Unexpected),
            SyncFailureDisposition::Suspend
        );
    }

    #[tokio::test]
    async fn should_persist_retry_when_connectivity_failure_occurs() {
        let directory = tempfile::tempdir().unwrap();
        let coordinator = SyncCoordinator::default();
        let execution = begin_execution(&coordinator);

        let transition = coordinator
            .fail(
                directory.path(),
                execution,
                SyncFailureKind::Connectivity,
                "network unavailable",
                2_000,
                0.5,
            )
            .await
            .unwrap();
        let snapshot = SyncService::schedule_snapshot(directory.path())
            .await
            .unwrap();

        assert_eq!(transition.retry.unwrap().next_retry_at, 3_000);
        assert_eq!(snapshot.next_retry_at, Some(3_000));
        assert_eq!(snapshot.transient_failure_count, 1);
        assert_eq!(snapshot.suspended_reason, None);
    }

    #[tokio::test]
    async fn should_persist_suspension_when_configuration_failure_occurs() {
        let directory = tempfile::tempdir().unwrap();
        let coordinator = SyncCoordinator::default();
        let execution = begin_execution(&coordinator);

        let transition = coordinator
            .fail(
                directory.path(),
                execution,
                SyncFailureKind::Configuration,
                "missing WebDAV URL",
                2_000,
                0.5,
            )
            .await
            .unwrap();
        let snapshot = SyncService::schedule_snapshot(directory.path())
            .await
            .unwrap();

        assert!(transition.retry.is_none());
        assert_eq!(
            snapshot.suspended_reason.as_deref(),
            Some("missing WebDAV URL")
        );
    }

    #[tokio::test]
    async fn should_skip_contextual_pull_when_recent_pull_is_fresh() {
        let directory = tempfile::tempdir().unwrap();
        database::open_db(directory.path().to_str().unwrap())
            .await
            .unwrap();
        let path = database_path(directory.path()).unwrap();
        persistence::mark_schedule_succeeded(&path, Some(1_000)).unwrap();
        let coordinator = SyncCoordinator::default();

        let transition = coordinator
            .request_contextual_pull(
                directory.path(),
                "library-1",
                "app_foregrounded",
                2_000,
                30_000,
            )
            .await
            .unwrap();

        assert!(transition.schedules.is_empty());
    }

    #[tokio::test]
    async fn should_wake_retry_when_library_reconnects() {
        let directory = tempfile::tempdir().unwrap();
        let coordinator = SyncCoordinator::default();
        let execution = begin_execution(&coordinator);
        coordinator
            .fail(
                directory.path(),
                execution,
                SyncFailureKind::Connectivity,
                "network unavailable",
                2_000,
                1.0,
            )
            .await
            .unwrap();
        coordinator.set_library_online("library-1", false, 2_100);

        let transition = coordinator.set_library_online("library-1", true, 2_200);

        assert_eq!(transition.schedules[0].deadline, 2_200);
    }
}
