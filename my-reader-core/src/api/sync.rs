use std::path::Path;

use crate::{
    models::{SidecarStorageConfig, SidecarSyncMode, SidecarSyncReport, SyncFailureKind},
    services, CoreError,
};

pub use crate::sync::{
    exchange::{SyncMode, SyncObserver, SyncProgress, SyncStage},
    scheduler::{SchedulerPolicy, SchedulerTransition, SyncExecution, SyncTiming},
};

pub struct SyncCoordinator {
    inner: services::sync::SyncCoordinator,
}

impl Default for SyncCoordinator {
    fn default() -> Self {
        Self::new(SchedulerPolicy::default())
    }
}

impl SyncCoordinator {
    pub fn new(policy: SchedulerPolicy) -> Self {
        Self {
            inner: services::sync::SyncCoordinator::new(policy),
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
        self.inner.request(library_id, mode, reason, timing, now_ms)
    }

    pub fn flush(&self, library_id: &str, reason: &str, now_ms: u64) -> SchedulerTransition {
        self.inner.flush(library_id, reason, now_ms)
    }

    pub async fn request_contextual_pull(
        &self,
        sidecar_root: &Path,
        library_id: &str,
        reason: &str,
        now_ms: u64,
        freshness_ms: u64,
    ) -> Result<SchedulerTransition, CoreError> {
        self.inner
            .request_contextual_pull(sidecar_root, library_id, reason, now_ms, freshness_ms)
            .await
    }

    pub async fn recover_library(
        &self,
        sidecar_root: &Path,
        library_id: &str,
        now_ms: u64,
    ) -> Result<SchedulerTransition, CoreError> {
        self.inner
            .recover_library(sidecar_root, library_id, now_ms)
            .await
    }

    pub fn begin(&self, library_id: &str, generation: u64) -> SchedulerTransition {
        self.inner.begin(library_id, generation)
    }

    pub async fn effective_execution(
        &self,
        sidecar_root: &Path,
        execution: SyncExecution,
        now_ms: u64,
        freshness_ms: u64,
    ) -> Result<Option<SyncExecution>, CoreError> {
        self.inner
            .effective_execution(sidecar_root, execution, now_ms, freshness_ms)
            .await
    }

    pub fn complete(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.inner.complete(library_id, now_ms)
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
        self.inner
            .fail(
                sidecar_root,
                execution,
                kind,
                reason,
                now_ms,
                random_fraction,
            )
            .await
    }

    pub fn resume(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.inner.resume(library_id, now_ms)
    }

    pub fn wake_retry(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.inner.wake_retry(library_id, now_ms)
    }

    pub fn set_library_online(
        &self,
        library_id: &str,
        online: bool,
        now_ms: u64,
    ) -> SchedulerTransition {
        self.inner.set_library_online(library_id, online, now_ms)
    }

    pub fn dispose(&self) -> SchedulerTransition {
        self.inner.dispose()
    }
}

pub async fn sync_sidecar(
    sidecar_root: &Path,
    library_root: &Path,
    now_ms: i64,
    mode: SidecarSyncMode,
    storage: &SidecarStorageConfig,
) -> Result<SidecarSyncReport, CoreError> {
    services::sync::sync_sidecar(sidecar_root, library_root, now_ms, mode, storage).await
}

pub async fn sync_sidecar_observed(
    sidecar_root: &Path,
    library_root: &Path,
    now_ms: i64,
    mode: SidecarSyncMode,
    storage: &SidecarStorageConfig,
    observer: &dyn SyncObserver,
) -> Result<SidecarSyncReport, CoreError> {
    services::sync::sync_sidecar_observed(
        sidecar_root,
        library_root,
        now_ms,
        mode,
        storage,
        observer,
    )
    .await
}
