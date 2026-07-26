//! Shared helpers for the `commands::*` modules. Centralises three repeated boilerplate
//! patterns:
//!
//! - `config_snapshot` / `with_config_mut` — replace 30+ inline
//!   `state.lock().unwrap_or_else(|e| e.into_inner())` clones.
//! - `app_data_dir` — replace 15+ inline `app.path().app_data_dir().map_err(...)?` blocks,
//!   and eliminate the silent inconsistency between the two error-mapping forms (some
//!   sites used the bare `?`, producing a different `AppError` variant for the same
//!   failure). Every failure now maps to `AppError::Config("APP_DATA_DIR_ERROR: …")`.
//! - `persist_config` — replace 10+ inline `save_config(&dir.join("config.json"), …)`
//!   call sites with the canonical `config::config_path(&dir)` lookup.
//!
//! These helpers are intentionally `pub(crate)` — they are internal plumbing for the
//! command layer, not part of the crate's public API surface for integration tests.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime, State};

use crate::commands::AppState;
use crate::config;
use crate::error::AppError;
use crate::models::AppConfig;
use crate::services::sidecar_sync_scheduler::{
    SidecarSyncReason, SidecarSyncScheduler, SidecarSyncTiming,
};
use crate::services::sync_service::SidecarSyncMode;

/// Clone the current `AppConfig` out of managed state. Safe to call from `async` paths
/// since the lock is released before this returns (the snapshot is owned).
pub(crate) fn config_snapshot(state: &State<'_, AppState>) -> AppConfig {
    state.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Mutate the managed `AppConfig` under the lock. **Do not call across `.await`** —
/// `MutexGuard<AppConfig>` is not `Send`. For async commands that need to mutate the
/// config and persist it, snapshot → mutate the snapshot → `persist_config` instead.
pub(crate) fn with_config_mut<F, R>(state: &State<'_, AppState>, f: F) -> R
where
    F: FnOnce(&mut AppConfig) -> R,
{
    let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut guard)
}

/// Resolve `app_data_dir` with the canonical error mapping. Replaces both inline forms
/// (`map_err(...)` and bare `?`) so every command produces the same error shape.
pub(crate) fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::Config(format!("APP_DATA_DIR_ERROR: {e}")))
}

/// Write `config` to `config.json` under the resolved `app_data_dir`. Routes through
/// `config::config_path` so the canonical filename is used everywhere instead of the
/// ad-hoc `.join("config.json")` pattern.
pub(crate) fn persist_config<R: Runtime>(
    app: &AppHandle<R>,
    config: &AppConfig,
) -> Result<(), AppError> {
    let path = config::config_path(&app_data_dir(app)?);
    config::save_config(&path, config)
}

pub(crate) fn schedule_sidecar_push<R: Runtime>(app: &AppHandle<R>, library_id: &str) {
    if let Some(scheduler) = app.try_state::<SidecarSyncScheduler>() {
        scheduler.request(
            library_id,
            SidecarSyncMode::PushOnly,
            SidecarSyncReason::LocalChange,
            SidecarSyncTiming::Debounced,
        );
    }
}

pub(crate) fn schedule_sidecar_pull<R: Runtime>(
    app: &AppHandle<R>,
    library_id: &str,
    reason: SidecarSyncReason,
) {
    if let Some(scheduler) = app.try_state::<SidecarSyncScheduler>() {
        scheduler.request(
            library_id,
            SidecarSyncMode::Full,
            reason,
            SidecarSyncTiming::Immediate,
        );
    }
}

/// Mutate the managed `AppConfig` and persist the result to `config.json`. The most
/// common shape across the command layer (`add_*_data_source`, `remove_data_source`,
/// `add_*_library`, etc.): mutate, then save. Folds the snapshot + persist tail so
/// callers stay one expression.
///
/// The closure returns `Result<R, AppError>` so it can fail without persisting (the
/// save only runs if the mutation succeeded). The persist itself can also fail, in
/// which case the in-memory mutation has already happened — callers must accept that
/// trade-off; rolling back is more complex than the boilerplate is worth.
pub(crate) fn with_config_mut_then_persist<F, R, Run>(
    app: &AppHandle<Run>,
    state: &State<'_, AppState>,
    f: F,
) -> Result<R, AppError>
where
    F: FnOnce(&mut AppConfig) -> Result<R, AppError>,
    Run: Runtime,
{
    let result = with_config_mut(state, f)?;
    let snapshot = config_snapshot(state);
    persist_config(app, &snapshot)?;
    Ok(result)
}
