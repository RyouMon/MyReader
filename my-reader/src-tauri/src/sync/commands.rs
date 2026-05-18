use std::path::{Path, PathBuf};

use sea_orm::DatabaseConnection;
use tracing::{error, info, warn};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::error::AppError;
use crate::{config, db};

use super::backend::{self, BackendKind};
use super::data_source_to_backend_kind;
use super::db_sync::{LwwProvider, SyncProvider};
use super::{file_ops, file_state, manifest};

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncBackendInfo {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub kind: String,
    pub summary: String,
    pub is_local_direct: bool,
}

fn resolve_backend(state: &State<'_, AppState>, id: &str) -> Result<BackendKind, AppError> {
    let config = state.lock().unwrap_or_else(|e| e.into_inner());
    let source = config
        .data_sources
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {id}")))?;
    data_source_to_backend_kind(source)
}

#[tauri::command]
#[specta::specta]
pub fn sync_list_backends(state: State<'_, AppState>) -> Result<Vec<SyncBackendInfo>, AppError> {
    info!("Start to list sync backends.");
    let config = state.lock().unwrap_or_else(|e| e.into_inner());
    let out = config
        .data_sources
        .iter()
        .map(|s| match &s.detail {
            crate::models::DataSourceDetail::Local { root_path } => SyncBackendInfo {
                id: s.id.clone(),
                name: s.name.clone(),
                enabled: s.enabled,
                kind: "localDirect".into(),
                summary: root_path.clone(),
                is_local_direct: true,
            },
            crate::models::DataSourceDetail::Webdav {
                endpoint,
                username,
                root_path,
                ..
            } => {
                let root_view = root_path.clone().unwrap_or_else(|| "/".into());
                SyncBackendInfo {
                    id: s.id.clone(),
                    name: s.name.clone(),
                    enabled: s.enabled,
                    kind: "webdav".into(),
                    summary: format!("{} (user: {}, root: {})", endpoint, username, root_view),
                    is_local_direct: false,
                }
            }
        })
        .collect::<Vec<_>>();
    info!("Success to list sync backends. count: {}", out.len());
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub async fn sync_test_backend(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    info!("Start to test sync backend via OpenDAL. id: \"{id}\"");
    let kind = resolve_backend(&state, &id)?;
    let result = backend::test_backend(&kind).await;
    match &result {
        Ok(()) => info!("Success to test sync backend. id: \"{id}\""),
        Err(err) => error!("Failed to test sync backend. id: \"{id}\", error: {err}"),
    }
    result
}

fn resolve_library_path(
    state: &State<'_, AppState>,
    library_id: &str,
) -> Result<(PathBuf, String), AppError> {
    let config = state.lock().unwrap_or_else(|e| e.into_inner());
    let lib = config
        .libraries
        .iter()
        .find(|l| l.id == library_id)
        .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {library_id}")))?;
    Ok((PathBuf::from(&lib.path), lib.id.clone()))
}

async fn open_library_db(library_path: &Path) -> Result<DatabaseConnection, AppError> {
    let path_str = library_path
        .to_str()
        .ok_or_else(|| AppError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
    db::open_db(path_str).await
}

#[tauri::command]
#[specta::specta]
pub async fn sync_list_file_states(
    _app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    filter: Option<String>,
) -> Result<Vec<file_state::FileStateRow>, AppError> {
    info!(
        "Start to list file states. library id: \"{library_id}\", filter: {:?}",
        filter
    );
    let (lib_path, _) = resolve_library_path(&state, &library_id)?;
    let db = open_library_db(&lib_path).await?;
    let rows = match filter.as_deref() {
        Some(s) if !s.is_empty() => file_state::list_by_state(&db, s).await?,
        _ => file_state::list_all(&db).await?,
    };
    info!("Success to list file states. count: {}", rows.len());
    Ok(rows)
}

#[tauri::command]
#[specta::specta]
pub async fn sync_download_file(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    data_source_id: String,
    relative_path: String,
) -> Result<(), AppError> {
    info!(
        "Start to download file. library id: \"{library_id}\", data source id: \"{data_source_id}\", path: \"{relative_path}\""
    );
    let (lib_path, _) = resolve_library_path(&state, &library_id)?;
    let kind = resolve_backend(&state, &data_source_id)?;
    let op = backend::build_operator(&kind)?;
    let device = device_identifier(&app, &state)?;
    let m = manifest::load(&op, &device).await?;
    let outcome = file_ops::download(&op, &lib_path, &m, &relative_path).await?;

    let db = open_library_db(&lib_path).await?;
    file_state::upsert(
        &db,
        &relative_path,
        "present",
        Some(&outcome.blake3),
        Some(outcome.size),
        Some(outcome.mtime_ms),
    )
    .await?;

    info!("Success to download file. path: \"{relative_path}\"");
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn sync_evict_local_file(
    _app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    relative_path: String,
) -> Result<(), AppError> {
    info!("Start to evict local file. library id: \"{library_id}\", path: \"{relative_path}\"");
    let (lib_path, _) = resolve_library_path(&state, &library_id)?;
    file_ops::evict_local(&lib_path, &relative_path).await?;

    let db = open_library_db(&lib_path).await?;
    file_state::upsert(&db, &relative_path, "remote_only", None, None, None).await?;

    info!("Success to evict local file. path: \"{relative_path}\"");
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn sync_delete_file_everywhere(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    data_source_id: String,
    relative_path: String,
) -> Result<(), AppError> {
    info!(
        "Start to delete file everywhere. library id: \"{library_id}\", data source id: \"{data_source_id}\", path: \"{relative_path}\""
    );
    let (lib_path, _) = resolve_library_path(&state, &library_id)?;
    let kind = resolve_backend(&state, &data_source_id)?;
    let op = backend::build_operator(&kind)?;
    let device = device_identifier(&app, &state)?;
    let mut m = manifest::load(&op, &device).await?;
    file_ops::delete_everywhere(&op, &lib_path, &mut m, &relative_path).await?;

    let db = open_library_db(&lib_path).await?;
    file_state::delete(&db, &relative_path).await?;

    info!("Success to delete file everywhere. path: \"{relative_path}\"");
    Ok(())
}

fn device_identifier(app: &AppHandle, state: &State<'_, AppState>) -> Result<String, AppError> {
    {
        let config = state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(id) = &config.device_id {
            if !id.is_empty() {
                return Ok(id.clone());
            }
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    let mut config = state.lock().unwrap_or_else(|e| e.into_inner());
    config.device_id = Some(id.clone());
    let path = config::config_path(&app.path().app_data_dir()?);
    config::save_config(&path, &config)?;
    Ok(id)
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DbSyncReport {
    pub pushed: usize,
    pub pulled: usize,
}

#[tauri::command]
#[specta::specta]
pub async fn sync_db_now(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    data_source_id: String,
) -> Result<DbSyncReport, AppError> {
    info!(
        "Start to run db sync. library id: \"{library_id}\", data source id: \"{data_source_id}\""
    );
    let (lib_path, _) = resolve_library_path(&state, &library_id)?;
    let kind = resolve_backend(&state, &data_source_id)?;
    let op = backend::build_operator(&kind)?;
    let device = device_identifier(&app, &state)?;
    let db = open_library_db(&lib_path).await?;
    let provider = LwwProvider::default_for_myreader();

    let pushed = provider.push_async(&db, &op, &device).await.unwrap_or_else(|e| {
        warn!("db sync: push error: {e}");
        0
    });

    let pulled = provider.pull_async(&db, &op, &device).await.unwrap_or_else(|e| {
        warn!("db sync: pull error: {e}");
        0
    });

    info!("Success to run db sync. pushed: {pushed}, pulled: {pulled}");
    Ok(DbSyncReport { pushed, pulled })
}

#[tauri::command]
#[specta::specta]
pub async fn sync_db_for_library(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
) -> Result<DbSyncReport, AppError> {
    info!("Start to sync db for library. id: \"{library_id}\"");

    let (lib_path, _) = resolve_library_path(&state, &library_id)?;

    let op = backend::build_operator(&BackendKind::LocalDirect {
        root: lib_path.to_string_lossy().to_string(),
    })?;
    let device = device_identifier(&app, &state)?;
    let db = open_library_db(&lib_path).await?;
    let provider = LwwProvider::default_for_myreader();

    let pushed = provider.push_async(&db, &op, &device).await.unwrap_or_else(|e| {
        warn!("db sync: push error: {e}");
        0
    });

    let pulled = provider.pull_async(&db, &op, &device).await.unwrap_or_else(|e| {
        warn!("db sync: pull error: {e}");
        0
    });

    info!("Success to sync db for library. pushed={pushed}, pulled={pulled}");
    Ok(DbSyncReport { pushed, pulled })
}