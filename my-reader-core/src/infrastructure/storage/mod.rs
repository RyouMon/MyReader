pub(crate) mod download;
mod dropbox;
mod gdrive;
pub(crate) mod transport;

use opendal::Operator;

use crate::{
    models::{DataSource, LibraryStorageConfig, RemoteCredential},
    CoreError,
};

pub(crate) fn build_remote_operator(
    source: &DataSource,
    credential: &RemoteCredential,
) -> Result<Operator, CoreError> {
    transport::build_storage_operator(&resolve_remote_storage(source, credential, "")?)
}

pub(crate) fn resolve_remote_storage(
    source: &DataSource,
    credential: &RemoteCredential,
    source_path: &str,
) -> Result<LibraryStorageConfig, CoreError> {
    match (source, credential) {
        (
            DataSource::Webdav {
                endpoint,
                username,
                root_path,
                ..
            },
            RemoteCredential::Webdav { password },
        ) => Ok(LibraryStorageConfig::Webdav {
            endpoint: required(endpoint, "WEBDAV_ENDPOINT_REQUIRED")?.into(),
            username: required(username, "WEBDAV_USERNAME_REQUIRED")?.into(),
            password: required(password, "WEBDAV_PASSWORD_REQUIRED")?.into(),
            root: Some(scope_remote_root(root_path.as_deref(), source_path)?),
        }),
        (DataSource::Onedrive { root_path, .. }, RemoteCredential::Onedrive { access_token }) => {
            Ok(LibraryStorageConfig::Onedrive {
                access_token: required(access_token, "ONEDRIVE_ACCESS_TOKEN_REQUIRED")?.into(),
                root: Some(scope_remote_root(root_path.as_deref(), source_path)?),
            })
        }
        (
            DataSource::Gdrive {
                root_path,
                root_folder_id,
                ..
            },
            RemoteCredential::Gdrive { access_token },
        ) => Ok(LibraryStorageConfig::Gdrive {
            access_token: required(access_token, "GDRIVE_ACCESS_TOKEN_REQUIRED")?.into(),
            root: Some(scope_remote_root(root_path.as_deref(), source_path)?),
            root_folder_id: root_folder_id.clone(),
        }),
        (DataSource::Dropbox { root_path, .. }, RemoteCredential::Dropbox { access_token }) => {
            Ok(LibraryStorageConfig::Dropbox {
                access_token: required(access_token, "DROPBOX_ACCESS_TOKEN_REQUIRED")?.into(),
                root: Some(scope_remote_root(root_path.as_deref(), source_path)?),
            })
        }
        (
            DataSource::S3 {
                endpoint,
                bucket,
                region,
                root_path,
                virtual_host_style,
                ..
            },
            RemoteCredential::S3 {
                access_key_id,
                secret_access_key,
                session_token,
            },
        ) => Ok(LibraryStorageConfig::S3 {
            endpoint: endpoint.clone(),
            bucket: bucket.clone(),
            region: region.clone(),
            root: Some(scope_remote_root(root_path.as_deref(), source_path)?),
            virtual_host_style: *virtual_host_style,
            access_key_id: required(access_key_id, "S3_ACCESS_KEY_REQUIRED")?.into(),
            secret_access_key: required(secret_access_key, "S3_SECRET_KEY_REQUIRED")?.into(),
            session_token: session_token.clone(),
        }),
        (DataSource::Local { .. }, _) => Err(CoreError::Config("DATASOURCE_NOT_REMOTE".into())),
        _ => Err(CoreError::Config(
            "DATASOURCE_CREDENTIAL_TYPE_MISMATCH".into(),
        )),
    }
}

pub(crate) fn scope_remote_root(base: Option<&str>, library: &str) -> Result<String, CoreError> {
    let root = join_remote_path(base.unwrap_or_default(), library)?;
    Ok(if root.is_empty() {
        "/".to_owned()
    } else {
        format!("/{root}")
    })
}

pub(crate) fn normalize_remote_path(path: &str) -> Result<String, CoreError> {
    let normalized = path.trim().replace('\\', "/");
    let segments = normalized
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            if segment == "." || segment == ".." {
                Err(CoreError::Config("INVALID_REMOTE_PATH".into()))
            } else {
                Ok(segment)
            }
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(segments.join("/"))
}

pub(crate) fn join_remote_path(parent: &str, child: &str) -> Result<String, CoreError> {
    let parent = normalize_remote_path(parent)?;
    let child = normalize_remote_path(child)?;
    match (parent.is_empty(), child.is_empty()) {
        (true, true) => Ok(String::new()),
        (true, false) => Ok(child),
        (false, true) => Ok(parent),
        (false, false) => Ok(format!("{parent}/{child}")),
    }
}

fn required<'a>(value: &'a str, code: &str) -> Result<&'a str, CoreError> {
    let value = value.trim();
    if value.is_empty() {
        Err(CoreError::Config(code.into()))
    } else {
        Ok(value)
    }
}

pub(crate) fn storage_error(error: opendal::Error) -> CoreError {
    error.into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn https_transport_should_support_tls_when_remote_backend_requires_https() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (connection, _) = listener.accept().await.unwrap();
            drop(connection);
        });

        let error = crate::infrastructure::http::client_builder()
            .build()
            .unwrap()
            .get(format!("https://{address}"))
            .send()
            .await
            .unwrap_err();
        server.abort();
        let detail = format!("{error:?}");

        assert!(
            !detail.contains("scheme is not http"),
            "HTTPS transport is unavailable: {detail}"
        );
    }

    #[test]
    fn normalize_remote_path_should_reject_parent_traversal_when_path_is_untrusted() {
        let error = normalize_remote_path("/Books/../Secrets").unwrap_err();

        assert!(error.to_string().contains("INVALID_REMOTE_PATH"));
    }

    #[test]
    fn join_remote_path_should_normalize_slashes_when_paths_are_combined() {
        assert_eq!(
            join_remote_path("/Books/", "/Calibre/metadata.db").unwrap(),
            "Books/Calibre/metadata.db"
        );
    }
}
