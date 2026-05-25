//! 同步后端抽象：LocalDirect 与 Webdav 分别实现在子模块中。

mod local;
mod webdav;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// 统一的后端配置；前端通过 Tauri command 传入。
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
pub fn build_operator(kind: &BackendKind) -> Result<opendal::Operator, AppError> {
    match kind {
        BackendKind::LocalDirect { root } => local::build_operator(root),
        BackendKind::Webdav {
            endpoint,
            username,
            credential_account,
            inline_password,
            root_path,
        } => webdav::build_operator(endpoint, username, credential_account, inline_password, root_path),
    }
}

/// 小工具：`.pipe(Ok)` 链式收尾，避免 `Result<Operator, _>` 的中间变量。
pub(crate) trait Pipe: Sized {
    fn pipe<R>(self, f: impl FnOnce(Self) -> R) -> R {
        f(self)
    }
}
impl<T> Pipe for T {}

/// 健康检查：尝试 `stat` 根路径；`LocalDirect` 改为 `fs::metadata`。
pub async fn test_backend(kind: &BackendKind) -> Result<(), AppError> {
    match kind {
        BackendKind::LocalDirect { root } => local::test_backend(root).await,
        _ => {
            let op = build_operator(kind)?;
            op.stat("/")
                .await
                .map(|_| ())
                .map_err(|err| AppError::Config(format!("后端不可用: {err}")))
        }
    }
}
