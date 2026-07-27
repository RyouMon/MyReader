use std::time::Duration;

use opendal::{
    layers::RetryLayer,
    services::{Fs, Onedrive, Webdav},
    Operator,
};
use serde::{Deserialize, Serialize};

use crate::{
    exchange::{sync_database_with_operator, SyncMode, SyncReport},
    persistence::DatabaseIdentity,
    SyncError,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum StorageConfig {
    LocalDirect {
        root: String,
    },
    Webdav {
        endpoint: String,
        username: String,
        password: String,
        root: Option<String>,
    },
    Onedrive {
        access_token: String,
        root: Option<String>,
    },
}

fn sync_error(message: impl Into<String>) -> SyncError {
    SyncError::Sync(message.into())
}

fn non_empty(value: &str, name: &str) -> Result<String, SyncError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(sync_error(format!("{name} is missing")));
    }
    Ok(value.to_owned())
}

pub fn build_storage_operator(config: &StorageConfig) -> Result<Operator, SyncError> {
    match config {
        StorageConfig::LocalDirect { root } => {
            Operator::new(Fs::default().root(&non_empty(root, "Local storage root")?))
                .map(|operator| operator.finish())
                .map_err(|error| sync_error(format!("Initialize local storage failed: {error}")))
        }
        StorageConfig::Webdav {
            endpoint,
            username,
            password,
            root,
        } => {
            let builder = Webdav::default()
                .endpoint(&non_empty(endpoint, "WebDAV endpoint")?)
                .username(username.trim())
                .password(&non_empty(password, "WebDAV password")?)
                .root(
                    root.as_deref()
                        .filter(|value| !value.trim().is_empty())
                        .unwrap_or("/"),
                );
            Operator::new(builder)
                .map(|operator| operator.finish())
                .map_err(|error| sync_error(format!("Initialize WebDAV storage failed: {error}")))
        }
        StorageConfig::Onedrive { access_token, root } => {
            let mut builder = Onedrive::default()
                .access_token(&non_empty(access_token, "OneDrive access token")?);
            if let Some(root) = root.as_deref().filter(|value| !value.trim().is_empty()) {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(|error| sync_error(format!("Initialize OneDrive storage failed: {error}")))
                .map(|operator| {
                    operator
                        .layer(
                            RetryLayer::new()
                                .with_min_delay(Duration::from_millis(500))
                                .with_max_delay(Duration::from_secs(2))
                                .with_max_times(3)
                                .with_jitter(),
                        )
                        .finish()
                })
        }
    }
}

pub async fn sync_database(
    database_path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    mode: SyncMode,
    storage: &StorageConfig,
) -> Result<SyncReport, SyncError> {
    let operator = build_storage_operator(storage)?;
    sync_database_with_operator(database_path, &operator, identity, now_ms, mode).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_build_each_storage_backend_when_required_values_are_present() {
        let local = tempfile::tempdir().unwrap();
        let local_operator = build_storage_operator(&StorageConfig::LocalDirect {
            root: local.path().to_string_lossy().into_owned(),
        })
        .unwrap();
        assert_eq!(local_operator.info().scheme(), opendal::Scheme::Fs);

        let webdav_operator = build_storage_operator(&StorageConfig::Webdav {
            endpoint: "https://example.com/dav".to_owned(),
            username: "reader".to_owned(),
            password: "secret".to_owned(),
            root: Some("/books".to_owned()),
        })
        .unwrap();
        assert_eq!(webdav_operator.info().scheme(), opendal::Scheme::Webdav);

        let onedrive_operator = build_storage_operator(&StorageConfig::Onedrive {
            access_token: "token".to_owned(),
            root: Some("/books".to_owned()),
        })
        .unwrap();
        assert_eq!(onedrive_operator.info().scheme(), opendal::Scheme::Onedrive);
    }

    #[test]
    fn should_reject_storage_backend_when_required_secret_is_missing() {
        let error = build_storage_operator(&StorageConfig::Webdav {
            endpoint: "https://example.com/dav".to_owned(),
            username: "reader".to_owned(),
            password: " ".to_owned(),
            root: None,
        })
        .unwrap_err();
        assert!(error.to_string().contains("WebDAV password is missing"));
    }
}
