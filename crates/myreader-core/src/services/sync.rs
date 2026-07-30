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
        transport,
    },
    CoreError,
};

static SYNC_LOCKS: LazyLock<Mutex<HashMap<String, Weak<AsyncMutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

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

pub(crate) async fn sync_sidecar(
    sidecar_root: &Path,
    library_root: &Path,
    now_ms: i64,
    mode: SidecarSyncMode,
    storage: &SidecarStorageConfig,
) -> Result<SidecarSyncReport, CoreError> {
    sync_sidecar_observed(
        sidecar_root,
        library_root,
        now_ms,
        mode,
        storage,
        &NoopObserver,
    )
    .await
}

pub(crate) async fn sync_sidecar_observed(
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
    let library_uuid = super::catalog::get_library_uuid(library_root).await?;
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

pub(crate) async fn has_pending_work(sidecar_root: &Path) -> Result<bool, CoreError> {
    database::open_db(&sidecar_root.to_string_lossy()).await?;
    Ok(exchange::has_pending_database_work(&database_path(
        sidecar_root,
    )?)?)
}

pub(crate) async fn effective_mode(
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
    let last_pull =
        persistence::read_schedule_state(&path)?.and_then(|state| state.last_successful_pull_at);
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

pub(crate) async fn schedule_snapshot(
    sidecar_root: &Path,
) -> Result<SyncScheduleSnapshot, CoreError> {
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

pub(crate) async fn record_retry(
    sidecar_root: &Path,
    next_retry_at: i64,
    failure_count: u32,
) -> Result<(), CoreError> {
    database::open_db(&sidecar_root.to_string_lossy()).await?;
    let path = database_path(sidecar_root)?;
    let last_successful_pull_at =
        persistence::read_schedule_state(&path)?.and_then(|state| state.last_successful_pull_at);
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

pub(crate) async fn record_suspension(sidecar_root: &Path, reason: &str) -> Result<(), CoreError> {
    database::open_db(&sidecar_root.to_string_lossy()).await?;
    let path = database_path(sidecar_root)?;
    let last_successful_pull_at =
        persistence::read_schedule_state(&path)?.and_then(|state| state.last_successful_pull_at);
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

pub(crate) fn classify_failure(kind: SyncFailureKind) -> SyncFailureDisposition {
    match kind {
        SyncFailureKind::Connectivity => SyncFailureDisposition::Retry,
        SyncFailureKind::Configuration
        | SyncFailureKind::Credential
        | SyncFailureKind::DataIntegrity
        | SyncFailureKind::Unexpected => SyncFailureDisposition::Suspend,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn effective_mode_should_pull_when_no_successful_pull_exists() {
        let directory = tempfile::tempdir().unwrap();

        let mode = effective_mode(directory.path(), SidecarSyncMode::Full, 1_000, 30_000)
            .await
            .unwrap();

        assert_eq!(mode, Some(SidecarSyncMode::Full));
    }

    #[tokio::test]
    async fn effective_mode_should_skip_when_pull_is_fresh_and_no_work_is_pending() {
        let directory = tempfile::tempdir().unwrap();
        database::open_db(directory.path().to_str().unwrap())
            .await
            .unwrap();
        let path = database_path(directory.path()).unwrap();
        persistence::mark_schedule_succeeded(&path, Some(1_000)).unwrap();

        let mode = effective_mode(directory.path(), SidecarSyncMode::Full, 2_000, 30_000)
            .await
            .unwrap();

        assert_eq!(mode, None);
    }

    #[test]
    fn classify_failure_should_retry_only_when_failure_is_connectivity_related() {
        assert_eq!(
            classify_failure(SyncFailureKind::Connectivity),
            SyncFailureDisposition::Retry
        );
        assert_eq!(
            classify_failure(SyncFailureKind::Credential),
            SyncFailureDisposition::Suspend
        );
        assert_eq!(
            classify_failure(SyncFailureKind::Unexpected),
            SyncFailureDisposition::Suspend
        );
    }
}
