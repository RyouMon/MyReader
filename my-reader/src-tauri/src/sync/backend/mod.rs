//! 同步后端抽象：LocalDirect 与 Webdav 与 Onedrive 分别实现在子模块中。

mod local;
mod onedrive;
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
        credential_account: Option<String>,
        #[serde(skip_serializing, default)]
        inline_password: Option<String>,
        root_path: Option<String>,
    },
    /// OneDrive 远端：通过 OAuth2 access_token 访问 Microsoft Graph。
    Onedrive {
        data_source_id: String,
        client_id: String,
        tenant_id: String,
        #[serde(skip_serializing, default)]
        inline_access_token: Option<String>,
        root_path: Option<String>,
    },
}

impl BackendKind {
    pub fn is_local_direct(&self) -> bool {
        matches!(self, BackendKind::LocalDirect { .. })
    }

    pub fn local_root(&self) -> Option<PathBuf> {
        match self {
            BackendKind::LocalDirect { root } => Some(PathBuf::from(root)),
            _ => None,
        }
    }
}

/// 构造 OpenDAL `Operator`。
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
        BackendKind::Onedrive {
            inline_access_token,
            root_path,
            ..
        } => {
            let token = inline_access_token.as_deref().filter(|t| !t.trim().is_empty())
                .ok_or_else(|| AppError::Auth("OneDrive access token not available; call onedrive_start_auth first".into()))?;
            onedrive::build_operator(token, root_path.as_deref())
        }
    }
}

/// Build an operator for a persisted data source, lazily loading credentials
/// (WebDAV password from keyring, OneDrive token via token manager).
pub async fn build_operator_for_data_source(source: &crate::models::DataSourceConfig) -> Result<opendal::Operator, AppError> {
    use crate::auth::credentials;
    use crate::auth::onedrive::OnedriveTokenManager;

    let mut kind = crate::sync::data_source_to_backend_kind(source)?;
    match &mut kind {
        BackendKind::Webdav { inline_password, credential_account, .. } => {
            if let Some(account) = credential_account {
                *inline_password = credentials::read_webdav_password(account)?;
            }
        }
        BackendKind::Onedrive { inline_access_token, data_source_id, client_id, tenant_id, .. } => {
            let manager = OnedriveTokenManager::new();
            let token = manager.get_access_token(data_source_id, Some(client_id), Some(tenant_id)).await?;
            *inline_access_token = Some(token);
        }
        _ => {}
    }
    build_operator(&kind)
}

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
