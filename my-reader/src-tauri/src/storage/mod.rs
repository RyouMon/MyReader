//! Storage infrastructure built on OpenDAL.
//!
//! Provides generic storage operators for local filesystem, WebDAV, and OneDrive.
//! This module intentionally has no knowledge of sync semantics.

#[cfg(test)]
mod cloud_tests;

use my_reader_core::api::storage::StorageService;
use my_reader_core::models::LibraryStorageConfig;

use crate::auth::credentials;
use crate::auth::onedrive::onedrive_token_manager;
use crate::error::AppError;
use crate::models::{AppConfig, DataSourceConfig, DataSourceDetail, LibraryConfig};

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
        DataSourceDetail::Gdrive {
            credential_account,
            client_id,
            ..
        }
        | DataSourceDetail::Dropbox {
            credential_account,
            client_id,
            ..
        } => {
            let account = credential_account
                .as_deref()
                .ok_or_else(|| AppError::Config("OAUTH_REFRESH_TOKEN_REQUIRED".into()))?;
            let google = matches!(source.detail, DataSourceDetail::Gdrive { .. });
            let provider = if google {
                crate::auth::cloud::CloudProvider::Gdrive
            } else {
                crate::auth::cloud::CloudProvider::Dropbox
            };
            let access_token =
                crate::auth::cloud::access_token(provider, client_id, account).await?;
            Ok(if google {
                my_reader_core::models::RemoteCredential::Gdrive { access_token }
            } else {
                my_reader_core::models::RemoteCredential::Dropbox { access_token }
            })
        }
        DataSourceDetail::S3 {
            credential_account, ..
        } => {
            let account = credential_account
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| AppError::Config("S3_CREDENTIALS_REQUIRED".into()))?;
            let access_key_id = credentials::read_remote_credential_field(account, "accessKeyId")?
                .ok_or_else(|| AppError::Config("S3_ACCESS_KEY_REQUIRED".into()))?;
            let secret_access_key =
                credentials::read_remote_credential_field(account, "secretAccessKey")?
                    .ok_or_else(|| AppError::Config("S3_SECRET_KEY_REQUIRED".into()))?;
            let session_token = credentials::read_remote_credential_field(account, "sessionToken")?;
            Ok(my_reader_core::models::RemoteCredential::S3 {
                access_key_id,
                secret_access_key,
                session_token,
            })
        }
        DataSourceDetail::Local { .. } => Err(AppError::Config("DATASOURCE_NOT_REMOTE".into())),
    }
}

pub async fn core_library_storage(
    config: &AppConfig,
    library: &LibraryConfig,
) -> Result<my_reader_core::models::LibraryStorageConfig, AppError> {
    let credential = if library.is_remote() {
        let data_source_id = library
            .data_source_id
            .as_deref()
            .ok_or_else(|| AppError::Config("LIBRARY_DATA_SOURCE_MISSING".into()))?;
        let source = config
            .data_sources
            .iter()
            .find(|source| source.id == data_source_id)
            .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
        Some(core_remote_credential(source).await?)
    } else {
        None
    };
    Ok(
        my_reader_core::api::sync::SyncService::resolve_library_storage(
            &config.to_core_config(),
            &library.id,
            &library.path,
            credential.as_ref(),
        )?,
    )
}

pub async fn from_data_source_at_path(
    source: &DataSourceConfig,
    relative_root: Option<&str>,
) -> Result<opendal::Operator, AppError> {
    if let DataSourceDetail::Local { root_path } = &source.detail {
        let relative_root = relative_root.unwrap_or_default();
        let normalized =
            my_reader_core::api::sync::SyncService::scope_remote_root(None, relative_root)?;
        let root = std::path::Path::new(root_path)
            .join(normalized.trim_start_matches('/'))
            .to_string_lossy()
            .into_owned();
        return Ok(StorageService::operator(
            &LibraryStorageConfig::LocalDirect { root },
        )?);
    }
    let credential = core_remote_credential(source).await?;
    Ok(StorageService::remote_operator(
        &source.into(),
        &credential,
        relative_root.unwrap_or_default(),
    )?)
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

    #[tokio::test]
    async fn from_data_source_should_build_webdav_operator_when_password_is_stored() {
        let _guard = use_test_backend(MemoryBackend::default());
        let account = "webdav-account";
        credentials::save_webdav_password(account, "secret").unwrap();

        let source = webdav_source(Some(account));
        let op = from_data_source(&source).await.unwrap();
        assert_eq!(op.info().scheme(), opendal::services::WEBDAV_SCHEME);
    }

    #[tokio::test]
    async fn from_data_source_should_fail_when_webdav_password_is_missing() {
        let _guard = use_test_backend(MemoryBackend::default());
        let source = webdav_source(Some("missing-account"));

        let err = from_data_source(&source).await.unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("WEBDAV_PASSWORD_REQUIRED"), "{msg}");
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
