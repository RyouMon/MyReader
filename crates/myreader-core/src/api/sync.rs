use std::path::Path;

use crate::{
    models::{
        SidecarSyncMode, SidecarSyncReport, SyncFailureDisposition, SyncFailureKind,
        SyncScheduleSnapshot,
    },
    services,
    sync::{exchange::SyncObserver, transport::StorageConfig},
    CoreError,
};

pub async fn sync_sidecar(
    sidecar_root: &Path,
    library_root: &Path,
    now_ms: i64,
    mode: SidecarSyncMode,
    storage: &StorageConfig,
) -> Result<SidecarSyncReport, CoreError> {
    services::sync::sync_sidecar(sidecar_root, library_root, now_ms, mode, storage).await
}

pub async fn sync_sidecar_observed(
    sidecar_root: &Path,
    library_root: &Path,
    now_ms: i64,
    mode: SidecarSyncMode,
    storage: &StorageConfig,
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

pub async fn has_pending_work(sidecar_root: &Path) -> Result<bool, CoreError> {
    services::sync::has_pending_work(sidecar_root).await
}

pub async fn effective_mode(
    sidecar_root: &Path,
    requested_mode: SidecarSyncMode,
    now_ms: i64,
    freshness_ms: i64,
) -> Result<Option<SidecarSyncMode>, CoreError> {
    services::sync::effective_mode(sidecar_root, requested_mode, now_ms, freshness_ms).await
}

pub async fn schedule_snapshot(sidecar_root: &Path) -> Result<SyncScheduleSnapshot, CoreError> {
    services::sync::schedule_snapshot(sidecar_root).await
}

pub async fn record_retry(
    sidecar_root: &Path,
    next_retry_at: i64,
    failure_count: u32,
) -> Result<(), CoreError> {
    services::sync::record_retry(sidecar_root, next_retry_at, failure_count).await
}

pub async fn record_suspension(sidecar_root: &Path, reason: &str) -> Result<(), CoreError> {
    services::sync::record_suspension(sidecar_root, reason).await
}

pub fn classify_failure(kind: SyncFailureKind) -> SyncFailureDisposition {
    services::sync::classify_failure(kind)
}
