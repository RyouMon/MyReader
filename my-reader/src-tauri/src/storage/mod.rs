//! Storage infrastructure built on OpenDAL.
//!
//! Provides generic storage operators for local filesystem, WebDAV, and OneDrive.
//! This module intentionally has no knowledge of sync semantics.

mod local;
mod onedrive;
mod webdav;

use crate::auth::credentials;
use crate::auth::onedrive::onedrive_token_manager;
use crate::error::AppError;
use crate::models::{AppConfig, DataSourceConfig, DataSourceDetail, LibraryConfig};

/// Runtime description of a storage backend.
#[derive(Debug, Clone)]
pub enum StorageBackend {
    /// Local filesystem: the path is the source of truth, no manifest, no network.
    LocalDirect { root: String },
    /// WebDAV remote: `endpoint` like `https://host/dav`, `root_path` relative to endpoint.
    Webdav {
        endpoint: String,
        username: String,
        credential_account: Option<String>,
        inline_password: Option<String>,
        root_path: Option<String>,
    },
    /// OneDrive remote: access Microsoft Graph via OAuth2 access token.
    Onedrive {
        data_source_id: String,
        client_id: String,
        tenant_id: String,
        inline_access_token: Option<String>,
        root_path: Option<String>,
    },
}

/// Build an OpenDAL `Operator` from a storage backend config.
pub fn build_operator(kind: &StorageBackend) -> Result<opendal::Operator, AppError> {
    match kind {
        StorageBackend::LocalDirect { root } => local::build_operator(root),
        StorageBackend::Webdav {
            endpoint,
            username,
            credential_account,
            inline_password,
            root_path,
        } => webdav::build_operator(
            endpoint,
            username,
            credential_account,
            inline_password,
            root_path,
        ),
        StorageBackend::Onedrive {
            inline_access_token,
            root_path,
            ..
        } => {
            let token = inline_access_token
                .as_deref()
                .filter(|t| !t.trim().is_empty())
                .ok_or_else(|| {
                    AppError::Auth(
                        "OneDrive access token not available; call onedrive_start_auth first"
                            .into(),
                    )
                })?;
            onedrive::build_operator(token, root_path.as_deref())
        }
    }
}

/// Build an OpenDAL operator for a persisted data source, lazily loading
/// WebDAV passwords from the keyring and OneDrive tokens from the token manager.
pub async fn from_data_source(source: &DataSourceConfig) -> Result<opendal::Operator, AppError> {
    from_data_source_at_path(source, None).await
}

pub async fn core_remote_credential(
    source: &DataSourceConfig,
) -> Result<my_reader_core::models::RemoteCredential, AppError> {
    match &source.detail {
        DataSourceDetail::Webdav {
            credential_account, ..
        } => {
            let account = credential_account
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| AppError::Config("WEBDAV_PASSWORD_REQUIRED".into()))?;
            let password = credentials::read_webdav_password(account)?
                .ok_or_else(|| AppError::Config("WEBDAV_PASSWORD_REQUIRED".into()))?;
            Ok(my_reader_core::models::RemoteCredential::Webdav { password })
        }
        DataSourceDetail::Onedrive {
            client_id,
            tenant_id,
            ..
        } => {
            let access_token = onedrive_token_manager()
                .get_access_token(&source.id, Some(client_id), Some(tenant_id))
                .await?;
            Ok(my_reader_core::models::RemoteCredential::Onedrive { access_token })
        }
        DataSourceDetail::Local { .. } => Err(AppError::Config("DATASOURCE_NOT_REMOTE".into())),
    }
}

pub async fn core_sidecar_storage(
    config: &AppConfig,
    library: &LibraryConfig,
) -> Result<my_reader_core::models::SidecarStorageConfig, AppError> {
    use my_reader_core::models::RemoteCredential;
    use my_reader_core::models::SidecarStorageConfig;

    if !library.is_remote() {
        return Ok(SidecarStorageConfig::LocalDirect {
            root: library.path.clone(),
        });
    }

    let data_source_id = library
        .data_source_id
        .as_deref()
        .ok_or_else(|| AppError::Config("LIBRARY_DATA_SOURCE_MISSING".into()))?;
    let source = config
        .data_sources
        .iter()
        .find(|source| source.id == data_source_id)
        .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
    let relative_root = library.source_path.as_deref().unwrap_or_default();
    let credential = core_remote_credential(source).await?;

    match (&source.detail, credential) {
        (
            DataSourceDetail::Webdav {
                endpoint,
                username,
                root_path,
                ..
            },
            RemoteCredential::Webdav { password },
        ) => Ok(SidecarStorageConfig::Webdav {
            endpoint: endpoint.clone(),
            username: username.clone(),
            password,
            root: Some(join_remote_root(root_path.as_deref(), relative_root)),
        }),
        (
            DataSourceDetail::Onedrive { root_path, .. },
            RemoteCredential::Onedrive { access_token },
        ) => Ok(SidecarStorageConfig::Onedrive {
            access_token,
            root: Some(join_remote_root(root_path.as_deref(), relative_root)),
        }),
        _ => Err(AppError::Config(
            "DATASOURCE_CREDENTIAL_TYPE_MISMATCH".into(),
        )),
    }
}

pub async fn from_data_source_at_path(
    source: &DataSourceConfig,
    relative_root: Option<&str>,
) -> Result<opendal::Operator, AppError> {
    let mut backend = build_backend(source)?;
    if let Some(relative_root) = relative_root.filter(|value| !value.trim().is_empty()) {
        match &mut backend {
            StorageBackend::LocalDirect { root } => {
                *root = std::path::Path::new(root)
                    .join(relative_root.trim_matches('/'))
                    .to_string_lossy()
                    .to_string();
            }
            StorageBackend::Webdav { root_path, .. }
            | StorageBackend::Onedrive { root_path, .. } => {
                *root_path = Some(join_remote_root(root_path.as_deref(), relative_root));
            }
        }
    }
    match &mut backend {
        StorageBackend::Webdav {
            inline_password,
            credential_account,
            ..
        } => {
            if let Some(account) = credential_account {
                *inline_password = credentials::read_webdav_password(account)?;
            }
        }
        StorageBackend::Onedrive {
            inline_access_token,
            data_source_id,
            client_id,
            tenant_id,
            ..
        } => {
            let token = onedrive_token_manager()
                .get_access_token(data_source_id, Some(client_id), Some(tenant_id))
                .await?;
            *inline_access_token = Some(token);
        }
        _ => {}
    }
    build_operator(&backend)
}

fn join_remote_root(base: Option<&str>, relative: &str) -> String {
    let base = base.unwrap_or_default().trim().trim_matches('/');
    let relative = relative.trim().trim_matches('/');
    match (base.is_empty(), relative.is_empty()) {
        (true, true) => "/".to_owned(),
        (true, false) => format!("/{relative}"),
        (false, true) => format!("/{base}"),
        (false, false) => format!("/{base}/{relative}"),
    }
}

fn build_backend(source: &DataSourceConfig) -> Result<StorageBackend, AppError> {
    match &source.detail {
        DataSourceDetail::Local { root_path } => Ok(StorageBackend::LocalDirect {
            root: root_path.clone(),
        }),
        DataSourceDetail::Webdav {
            endpoint,
            username,
            credential_account,
            root_path,
        } => Ok(StorageBackend::Webdav {
            endpoint: endpoint.clone(),
            username: username.clone(),
            credential_account: credential_account.clone(),
            inline_password: None,
            root_path: root_path.clone(),
        }),
        DataSourceDetail::Onedrive {
            client_id,
            tenant_id,
            root_path,
            ..
        } => Ok(StorageBackend::Onedrive {
            data_source_id: source.id.clone(),
            client_id: client_id.clone(),
            tenant_id: tenant_id.clone(),
            inline_access_token: None,
            root_path: root_path.clone(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use crate::auth::credentials::{self, use_test_backend, MemoryBackend};
    use crate::models::{DataSourceConfig, DataSourceDetail};

    use super::*;

    fn local_source(root_path: &str) -> DataSourceConfig {
        DataSourceConfig {
            id: "ds-local".to_string(),
            name: "Local".to_string(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: root_path.to_string(),
            },
        }
    }

    fn webdav_source(credential_account: Option<&str>) -> DataSourceConfig {
        DataSourceConfig {
            id: "ds-webdav".to_string(),
            name: "WebDAV".to_string(),
            enabled: true,
            detail: DataSourceDetail::Webdav {
                endpoint: "http://localhost/dav".to_string(),
                username: "user".to_string(),
                credential_account: credential_account.map(ToString::to_string),
                root_path: None,
            },
        }
    }

    fn onedrive_source() -> DataSourceConfig {
        DataSourceConfig {
            id: "ds-onedrive".to_string(),
            name: "OneDrive".to_string(),
            enabled: true,
            detail: DataSourceDetail::Onedrive {
                client_id: "client-id".to_string(),
                tenant_id: "consumers".to_string(),
                credential_account: None,
                root_path: None,
                user_name: None,
                user_email: None,
            },
        }
    }

    #[tokio::test]
    async fn from_data_source_should_build_local_operator_when_source_is_local() {
        let temp = tempfile::tempdir().unwrap();
        let source = local_source(temp.path().to_str().unwrap());

        let op = from_data_source(&source).await.unwrap();
        // Listing the root confirms the operator is usable.
        op.list("/").await.unwrap();
    }

    #[test]
    fn should_scope_library_below_data_source_root_when_remote_root_is_joined() {
        assert_eq!(
            join_remote_root(Some("/Reading/"), "/Calibre/Library/"),
            "/Reading/Calibre/Library"
        );
        assert_eq!(join_remote_root(None, "/Calibre"), "/Calibre");
    }

    #[tokio::test]
    async fn from_data_source_should_build_webdav_operator_when_password_is_stored() {
        let _guard = use_test_backend(MemoryBackend::default());
        let account = "webdav-account";
        credentials::save_webdav_password(account, "secret").unwrap();

        let source = webdav_source(Some(account));
        let op = from_data_source(&source).await.unwrap();
        assert_eq!(op.info().scheme(), opendal::Scheme::Webdav);
    }

    #[tokio::test]
    async fn from_data_source_should_fail_when_webdav_password_is_missing() {
        let _guard = use_test_backend(MemoryBackend::default());
        let source = webdav_source(Some("missing-account"));

        let err = from_data_source(&source).await.unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("WebDAV 密码"), "{msg}");
    }

    #[tokio::test]
    async fn from_data_source_should_fail_when_onedrive_refresh_token_is_missing() {
        let _guard = use_test_backend(MemoryBackend::default());
        let source = onedrive_source();

        let err = from_data_source(&source).await.unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("No refresh token found"), "{msg}");
    }
}
