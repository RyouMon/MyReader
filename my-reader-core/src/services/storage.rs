use opendal::Operator;

use crate::{
    infrastructure::storage,
    models::{
        DataSource, LibraryStorageConfig, RemoteCredential, RemoteDownloadRequest, RemoteFileStat,
    },
    CoreError,
};

/// Builds provider operators with the same transport, root isolation and retry
/// behavior for browsing, content transfers and synchronization.
pub struct StorageService;

impl StorageService {
    pub fn operator(config: &LibraryStorageConfig) -> Result<Operator, CoreError> {
        storage::transport::build_storage_operator(config)
    }

    pub async fn stat(
        config: &LibraryStorageConfig,
        path: &str,
    ) -> Result<Option<RemoteFileStat>, CoreError> {
        let path = storage::normalize_remote_path(path)?;
        let metadata = match Self::operator(config)?.stat(&path).await {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == opendal::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        Ok(Some(RemoteFileStat {
            etag: metadata.etag().unwrap_or_default().into(),
            size: metadata.content_length(),
            mtime_ms: metadata
                .last_modified()
                .and_then(|time| {
                    std::time::SystemTime::from(time)
                        .duration_since(std::time::UNIX_EPOCH)
                        .ok()
                })
                .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
                .unwrap_or_default(),
        }))
    }

    pub async fn download_request(
        config: &LibraryStorageConfig,
        path: &str,
    ) -> Result<RemoteDownloadRequest, CoreError> {
        storage::download::download_request(config, path).await
    }

    pub fn remote_operator(
        source: &DataSource,
        credential: &RemoteCredential,
        relative_root: &str,
    ) -> Result<Operator, CoreError> {
        Self::operator(&storage::resolve_remote_storage(
            source,
            credential,
            relative_root,
        )?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_and_library_roots_are_scoped_and_cannot_escape() {
        let source: DataSource = serde_json::from_value(serde_json::json!({
            "type": "webdav", "id": "source", "name": "Books",
            "endpoint": "https://example.com/dav", "username": "reader",
            "rootPath": "Books"
        }))
        .unwrap();
        let credential = RemoteCredential::Webdav {
            password: "secret".into(),
        };
        let operator =
            StorageService::remote_operator(&source, &credential, "中文/Library").unwrap();
        assert_eq!(operator.info().root(), "/Books/中文/Library/");
        let error =
            StorageService::remote_operator(&source, &credential, "../Private").unwrap_err();
        assert!(error.to_string().contains("INVALID_REMOTE_PATH"));
        let error = StorageService::remote_operator(
            &source,
            &RemoteCredential::Onedrive {
                access_token: "token".into(),
            },
            "",
        )
        .unwrap_err();
        assert!(error
            .to_string()
            .contains("DATASOURCE_CREDENTIAL_TYPE_MISMATCH"));
    }
}
