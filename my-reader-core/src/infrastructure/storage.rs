use std::time::Duration;

use opendal::{
    layers::RetryLayer,
    services::{Onedrive, Webdav},
    Operator,
};

use crate::{
    models::{DataSource, RemoteCredential},
    CoreError,
};

pub(crate) fn build_remote_operator(
    source: &DataSource,
    credential: &RemoteCredential,
) -> Result<Operator, CoreError> {
    match (source, credential) {
        (
            DataSource::Webdav {
                endpoint,
                username,
                root_path,
                ..
            },
            RemoteCredential::Webdav { password },
        ) => {
            let endpoint = required(endpoint, "WEBDAV_ENDPOINT_REQUIRED")?;
            let username = required(username, "WEBDAV_USERNAME_REQUIRED")?;
            let password = required(password, "WEBDAV_PASSWORD_REQUIRED")?;
            let builder = Webdav::default()
                .endpoint(endpoint)
                .username(username)
                .password(password)
                .root(non_empty_root(root_path.as_deref()));
            Operator::new(builder)
                .map(|operator| operator.finish())
                .map_err(storage_error)
        }
        (DataSource::Onedrive { root_path, .. }, RemoteCredential::Onedrive { access_token }) => {
            let access_token = required(access_token, "ONEDRIVE_ACCESS_TOKEN_REQUIRED")?;
            let mut builder = Onedrive::default().access_token(access_token);
            if let Some(root) = root_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
            {
                builder = builder.root(root);
            }
            Operator::new(builder)
                .map_err(storage_error)
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
        (DataSource::Webdav { .. }, RemoteCredential::Onedrive { .. })
        | (DataSource::Onedrive { .. }, RemoteCredential::Webdav { .. }) => Err(CoreError::Config(
            "DATASOURCE_CREDENTIAL_TYPE_MISMATCH".into(),
        )),
        (DataSource::Local { .. }, _) => Err(CoreError::Config("DATASOURCE_NOT_REMOTE".into())),
    }
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

fn non_empty_root(root: Option<&str>) -> &str {
    root.filter(|value| !value.trim().is_empty()).unwrap_or("/")
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
    CoreError::Storage(error.to_string())
}

pub(crate) fn remote_storage_error(source: &DataSource, error: opendal::Error) -> CoreError {
    let detail = error.to_string();
    let code = match (source, error.kind(), detail.as_str()) {
        (DataSource::Webdav { .. }, _, detail) if detail.contains("status: 401") => {
            "WEBDAV_UNAUTHORIZED"
        }
        (DataSource::Webdav { .. }, _, detail) if detail.contains("status: 403") => {
            "WEBDAV_FORBIDDEN"
        }
        (DataSource::Webdav { .. }, opendal::ErrorKind::PermissionDenied, _) => {
            "WEBDAV_UNAUTHORIZED"
        }
        (DataSource::Webdav { .. }, opendal::ErrorKind::NotFound, _) => "WEBDAV_NOT_FOUND",
        (DataSource::Webdav { .. }, _, _) => "WEBDAV_UNEXPECTED_STATUS",
        (DataSource::Onedrive { .. }, opendal::ErrorKind::PermissionDenied, _) => {
            "ONEDRIVE_UNAUTHORIZED"
        }
        (DataSource::Onedrive { .. }, opendal::ErrorKind::NotFound, _) => "ONEDRIVE_NOT_FOUND",
        (DataSource::Onedrive { .. }, _, _) => "ONEDRIVE_STORAGE_FAILED",
        (DataSource::Local { .. }, _, _) => "DATASOURCE_NOT_REMOTE",
    };
    CoreError::Storage(format!("{code}: {detail}"))
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

        let error = reqwest::get(format!("https://{address}"))
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
