//! 同步引擎相关 Tauri 命令。
//!
//! 阶段 1 先暴露最小集合：
//! - `sync_test_backend`：按数据源 id 走一次 OpenDAL `stat("/")`/`metadata` 健康检查，
//!   与现有 `test_webdav_connection`（reqwest）互补——后者面向"尚未保存"的用户输入，
//!   本命令面向"已保存并将用于同步"的数据源，验证 OpenDAL 适配层是否可用。
//! - `sync_list_backends`：返回每个数据源对应的 `BackendKind` 元信息（不含密码），
//!   供前端渲染同步设置页。

use std::path::{Path, PathBuf};

use log::{error, info};
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::commands::AppState;
use crate::error::AppError;
use crate::reading_progress;

use super::backend::{self, BackendKind};
use super::data_source_to_backend_kind;
use super::db_sync::{LwwProvider, SyncProvider};
use super::{file_ops, file_state, manifest};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBackendInfo {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub kind: String,
    /// Local 直读时指向本地根目录；WebDAV 为 `endpoint` 去掉敏感参数后的展示串。
    pub summary: String,
    pub is_local_direct: bool,
}

fn resolve_backend(state: &State<'_, AppState>, id: &str) -> Result<BackendKind, AppError> {
    let config = state.lock().unwrap();
    let source = config
        .data_sources
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| AppError::NotFound(format!("数据源 {id} 不存在")))?;
    data_source_to_backend_kind(source)
}

#[tauri::command]
pub fn sync_list_backends(
    state: State<'_, AppState>,
) -> Result<Vec<SyncBackendInfo>, AppError> {
    info!("Start to list sync backends.");
    let config = state.lock().unwrap();
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
pub async fn sync_test_backend(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to test sync backend via OpenDAL. id: \"{id}\"");
    let kind = resolve_backend(&state, &id)?;
    let result = backend::test_backend(&kind).await;
    match &result {
        Ok(()) => info!("Success to test sync backend. id: \"{id}\""),
        Err(err) => error!("Failed to test sync backend. id: \"{id}\", error: {err}"),
    }
    result
}

/// 解析 `library_id` → (library 本地根目录, library_id)。
fn resolve_library_path(
    state: &State<'_, AppState>,
    library_id: &str,
) -> Result<(PathBuf, String), AppError> {
    let config = state.lock().unwrap();
    let lib = config
        .libraries
        .iter()
        .find(|l| l.id == library_id)
        .ok_or_else(|| AppError::NotFound(format!("书库 {library_id} 不存在")))?;
    Ok((PathBuf::from(&lib.path), lib.id.clone()))
}

/// 为 library 打开本地 myreader.db 并确保 `file_state` schema 存在。
fn open_library_db(
    app: &AppHandle,
    library_path: &Path,
    library_id: &str,
) -> Result<Connection, AppError> {
    let path_str = library_path
        .to_str()
        .ok_or_else(|| AppError::Config("书库路径包含非 UTF-8 字符".into()))?;
    let conn = reading_progress::open_db(app, path_str, library_id)?;
    file_state::initialize_schema(&conn)?;
    Ok(conn)
}

#[tauri::command]
pub async fn sync_list_file_states(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    filter: Option<String>,
) -> Result<Vec<file_state::FileStateRow>, AppError> {
    info!(
        "Start to list file states. library id: \"{library_id}\", filter: {:?}",
        filter
    );
    let (lib_path, lib_id) = resolve_library_path(&state, &library_id)?;
    let rows = tauri::async_runtime::spawn_blocking(move || -> Result<_, AppError> {
        let conn = open_library_db(&app, &lib_path, &lib_id)?;
        match filter.as_deref() {
            Some(s) if !s.is_empty() => file_state::list_by_state(&conn, s),
            _ => {
                let mut stmt = conn
                    .prepare(
                        "SELECT path, local_state, local_blake3, local_size, local_mtime
                           FROM file_state ORDER BY path",
                    )
                    .map_err(|e| AppError::Database(e.to_string()))?;
                let iter = stmt
                    .query_map([], |row| {
                        Ok(file_state::FileStateRow {
                            path: row.get(0)?,
                            local_state: row.get(1)?,
                            local_blake3: row.get(2)?,
                            local_size: row.get(3)?,
                            local_mtime: row.get(4)?,
                        })
                    })
                    .map_err(|e| AppError::Database(e.to_string()))?;
                let mut out = Vec::new();
                for r in iter {
                    out.push(r.map_err(|e| AppError::Database(e.to_string()))?);
                }
                Ok(out)
            }
        }
    })
    .await
    .map_err(|err| AppError::Config(format!("blocking 任务失败: {err}")))??;
    info!("Success to list file states. count: {}", rows.len());
    Ok(rows)
}

#[tauri::command]
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
    let (lib_path, lib_id) = resolve_library_path(&state, &library_id)?;
    let kind = resolve_backend(&state, &data_source_id)?;
    let op = backend::build_operator(&kind)?;
    let device = device_identifier();
    let m = manifest::load(&op, &device).await?;
    let outcome = file_ops::download(&op, &lib_path, &m, &relative_path).await?;

    let rel = relative_path.clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        let conn = open_library_db(&app_clone, &lib_path, &lib_id)?;
        file_state::upsert(
            &conn,
            &rel,
            "present",
            Some(&outcome.blake3),
            Some(outcome.size),
            Some(outcome.mtime_ms),
        )
    })
    .await
    .map_err(|err| AppError::Config(format!("blocking 任务失败: {err}")))??;

    info!("Success to download file. path: \"{relative_path}\"");
    Ok(())
}

#[tauri::command]
pub async fn sync_evict_local_file(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    relative_path: String,
) -> Result<(), AppError> {
    info!(
        "Start to evict local file. library id: \"{library_id}\", path: \"{relative_path}\""
    );
    let (lib_path, lib_id) = resolve_library_path(&state, &library_id)?;
    file_ops::evict_local(&lib_path, &relative_path).await?;

    let rel = relative_path.clone();
    let app_clone = app.clone();
    let lib_path_clone = lib_path.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        let conn = open_library_db(&app_clone, &lib_path_clone, &lib_id)?;
        file_state::upsert(&conn, &rel, "remote_only", None, None, None)
    })
    .await
    .map_err(|err| AppError::Config(format!("blocking 任务失败: {err}")))??;

    info!("Success to evict local file. path: \"{relative_path}\"");
    Ok(())
}

#[tauri::command]
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
    let (lib_path, lib_id) = resolve_library_path(&state, &library_id)?;
    let kind = resolve_backend(&state, &data_source_id)?;
    let op = backend::build_operator(&kind)?;
    let device = device_identifier();
    let mut m = manifest::load(&op, &device).await?;
    file_ops::delete_everywhere(&op, &lib_path, &mut m, &relative_path).await?;

    let rel = relative_path.clone();
    let app_clone = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        let conn = open_library_db(&app_clone, &lib_path, &lib_id)?;
        file_state::delete(&conn, &rel)
    })
    .await
    .map_err(|err| AppError::Config(format!("blocking 任务失败: {err}")))??;

    info!("Success to delete file everywhere. path: \"{relative_path}\"");
    Ok(())
}

/// 稳定的设备标识；阶段 1 先用机器 hostname；后续可替换为 keyring 持久化 UUID。
fn device_identifier() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-device".into())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbSyncReport {
    pub pushed: usize,
    pub pulled: usize,
}

/// 对指定 library + 数据源做一次 DB changes push→pull 循环。
///
/// 阶段 1 使用 `LwwProvider`（行级 LWW by `updated_at`）；后续接入 cr-sqlite 时，
/// 调用方代码无需变化（`SyncProvider` trait 即可替换）。
#[tauri::command]
pub async fn sync_db_now(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    data_source_id: String,
) -> Result<DbSyncReport, AppError> {
    info!(
        "Start to run db sync. library id: \"{library_id}\", data source id: \"{data_source_id}\""
    );
    let (lib_path, lib_id) = resolve_library_path(&state, &library_id)?;
    let kind = resolve_backend(&state, &data_source_id)?;
    if kind.is_local_direct() {
        info!("Skip db sync: data source is LocalDirect.");
        return Ok(DbSyncReport {
            pushed: 0,
            pulled: 0,
        });
    }
    let op = backend::build_operator(&kind)?;
    let device = device_identifier();
    let provider = LwwProvider::default_for_myreader();

    let lib_path_push = lib_path.clone();
    let lib_id_push = lib_id.clone();
    let device_push = device.clone();
    let app_push = app.clone();
    let op_push = op.clone();

    let pushed = tauri::async_runtime::spawn_blocking(move || -> Result<usize, AppError> {
        let conn = open_library_db(&app_push, &lib_path_push, &lib_id_push)?;
        tauri::async_runtime::block_on(async {
            provider.push(&conn, &op_push, &device_push).await
        })
    })
    .await
    .map_err(|err| AppError::Config(format!("blocking push 任务失败: {err}")))??;

    let provider2 = LwwProvider::default_for_myreader();
    let app_pull = app.clone();
    let op_pull = op.clone();
    let device_pull = device.clone();
    let pulled = tauri::async_runtime::spawn_blocking(move || -> Result<usize, AppError> {
        let conn = open_library_db(&app_pull, &lib_path, &lib_id)?;
        tauri::async_runtime::block_on(async {
            provider2.pull(&conn, &op_pull, &device_pull).await
        })
    })
    .await
    .map_err(|err| AppError::Config(format!("blocking pull 任务失败: {err}")))??;

    info!("Success to run db sync. pushed: {pushed}, pulled: {pulled}");
    Ok(DbSyncReport { pushed, pulled })
}
