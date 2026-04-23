//! 同步引擎模块根。
//!
//! 本模块是阶段 1 目标的聚合点：
//! - [`backend`]：基于 OpenDAL 的后端工厂，支持 WebDAV 与 LocalDirect（本地直读）。
//! - [`credentials`]：`keyring` 凭据存储封装（与 `crate::commands` 共用 WEBDAV_KEYRING_SERVICE）。
//! - [`manifest`]：云端 `.myreader/manifest.json` 的读写。
//! - [`file_state`]：本地 SQLite `file_state` 三态表。
//! - [`db_sync`]：DB 同步抽象（目前提供 `LwwProvider` 兜底，后续可替换为 cr-sqlite）。
//! - [`commands`]：对前端暴露的 Tauri 命令入口。

pub mod backend;
pub mod commands;
pub(crate) mod credentials;
pub mod db_sync;
pub mod file_ops;
pub mod file_state;
pub mod manifest;

use crate::error::AppError;
use crate::models::{DataSourceConfig, DataSourceDetail};
use backend::BackendKind;

/// 把持久化的 [`DataSourceConfig`] 转换为运行期可用的 [`BackendKind`]。
///
/// - `Local` 直接映射为 `LocalDirect`（用户侧"直读"）。
/// - `Webdav` 的密码在此不读取，仅透传 `credential_account`；真正需要密码时由
///   [`backend::build_operator`] 通过 keyring 懒加载。
pub fn data_source_to_backend_kind(source: &DataSourceConfig) -> Result<BackendKind, AppError> {
    match &source.detail {
        DataSourceDetail::Local { root_path } => Ok(BackendKind::LocalDirect {
            root: root_path.clone(),
        }),
        DataSourceDetail::Webdav {
            endpoint,
            username,
            credential_account,
            root_path,
        } => Ok(BackendKind::Webdav {
            endpoint: endpoint.clone(),
            username: username.clone(),
            credential_account: credential_account.clone(),
            inline_password: None,
            root_path: root_path.clone(),
        }),
    }
}
