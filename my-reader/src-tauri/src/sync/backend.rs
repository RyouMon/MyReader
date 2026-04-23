//! 同步后端抽象：基于 OpenDAL 适配 WebDAV；本地直读走短路径不经 OpenDAL。
//!
//! 本期只接入 `services-webdav` 与 `services-fs` 两个 feature（Cargo.toml 中显式启用）。
//! S3 / OneDrive 等延后，但数据结构在此预留枚举分支以避免后续改接口。

use std::path::PathBuf;

use opendal::{services, Operator};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::credentials;

/// 统一的后端配置；前端通过 Tauri command 传入。
///
/// `LocalDirect` 与 `Webdav` 都会走同一套 `SyncEngine` API，但 `LocalDirect`
/// 在 `download` / `evictLocal` 等能力上会短路（见第十三节 Local 直读）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackendKind {
    /// 本地直读：应用把该路径视为事实来源，不生成 manifest 也不做网络传输。
    LocalDirect { root: String },
    /// WebDAV 远端：`endpoint` 形如 `https://host/dav`，`root_path` 相对 endpoint。
    Webdav {
        endpoint: String,
        username: String,
        /// 指向 keyring 账户名；桌面端通过该字段 lazy 读出密码，不直接把密码序列化。
        credential_account: Option<String>,
        /// 调用方可直接传入密码供一次性测试（如 `testBackend`），不落盘。
        #[serde(skip_serializing, default)]
        inline_password: Option<String>,
        root_path: Option<String>,
    },
}

impl BackendKind {
    /// 是否为本地直读：许多 API 在此模式下需要短路。
    pub fn is_local_direct(&self) -> bool {
        matches!(self, BackendKind::LocalDirect { .. })
    }

    /// Local 直读下的根目录。
    pub fn local_root(&self) -> Option<PathBuf> {
        match self {
            BackendKind::LocalDirect { root } => Some(PathBuf::from(root)),
            _ => None,
        }
    }
}

/// 构造 OpenDAL `Operator`；`LocalDirect` 返回 `fs` 后端，`Webdav` 返回 `webdav` 后端。
///
/// Local 直读逻辑上不需要 OpenDAL（后续多数调用会短路），但预留以备同一 API 面
/// 在"本地挂载云盘"等边界场景共用。
pub fn build_operator(kind: &BackendKind) -> Result<Operator, AppError> {
    match kind {
        BackendKind::LocalDirect { root } => {
            let builder = services::Fs::default().root(root);
            Operator::new(builder)
                .map_err(|err| AppError::Config(format!("初始化本地 Operator 失败: {err}")))?
                .finish()
                .pipe(Ok)
        }
        BackendKind::Webdav {
            endpoint,
            username,
            credential_account,
            inline_password,
            root_path,
        } => {
            let password = resolve_webdav_password(inline_password, credential_account)?;
            let mut builder = services::Webdav::default()
                .endpoint(endpoint.trim())
                .username(username.trim())
                .password(password.trim());
            if let Some(root) = root_path.as_ref().filter(|p| !p.trim().is_empty()) {
                builder = builder.root(root);
            } else {
                builder = builder.root("/");
            }
            Operator::new(builder)
                .map_err(|err| AppError::Config(format!("初始化 WebDAV Operator 失败: {err}")))?
                .finish()
                .pipe(Ok)
        }
    }
}

fn resolve_webdav_password(
    inline: &Option<String>,
    account: &Option<String>,
) -> Result<String, AppError> {
    if let Some(pw) = inline.as_ref() {
        let trimmed = pw.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    if let Some(acc) = account.as_ref().filter(|s| !s.trim().is_empty()) {
        return credentials::read_webdav_password(acc.trim())?.ok_or_else(|| {
            AppError::Config("系统钥匙串未找到对应 WebDAV 密码，请在设置页重新保存".into())
        });
    }
    Err(AppError::Config(
        "缺少 WebDAV 密码（inline_password / credential_account 均为空）".into(),
    ))
}

/// 健康检查：尝试 `stat` 根路径；`LocalDirect` 改为 `fs::metadata`。
pub async fn test_backend(kind: &BackendKind) -> Result<(), AppError> {
    if let BackendKind::LocalDirect { root } = kind {
        let meta = tokio::fs::metadata(root)
            .await
            .map_err(|err| AppError::Config(format!("本地目录不可读: {root}: {err}")))?;
        if !meta.is_dir() {
            return Err(AppError::Config(format!("路径不是目录: {root}")));
        }
        return Ok(());
    }
    let op = build_operator(kind)?;
    op.stat("/")
        .await
        .map(|_| ())
        .map_err(|err| AppError::Config(format!("后端不可用: {err}")))
}

/// 小工具：`.pipe(Ok)` 链式收尾，避免 `Result<Operator, _>` 的中间变量。
trait Pipe: Sized {
    fn pipe<R>(self, f: impl FnOnce(Self) -> R) -> R {
        f(self)
    }
}
impl<T> Pipe for T {}
