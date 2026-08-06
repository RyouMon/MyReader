use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use super::SyncError;
use crate::models::LibraryStorageConfig;
use http::{header, Method, Request, Response, StatusCode};
use opendal::{
    layers::RetryLayer,
    raw::{percent_encode_path, HttpBody, HttpClient, HttpFetch},
    services::{Fs, Onedrive, Webdav},
    Buffer, Error, ErrorKind, Operator, Scheme,
};

const REMOTE_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REMOTE_READ_TIMEOUT: Duration = Duration::from_secs(60);
const REMOTE_REQUEST_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const ONEDRIVE_UPLOAD_SESSION_SUFFIX: &str = ":/createUploadSession";
const ONEDRIVE_SIMPLE_UPLOAD_MAX: i64 = 4 * 1024 * 1024;
const ONEDRIVE_UPLOAD_ATTEMPTS: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RemoteUploadByteProgress {
    pub completed: u64,
    pub total: u64,
}

#[derive(Clone, Default)]
pub(crate) struct RemoteUploadProgress {
    current: Arc<Mutex<Option<RemoteUploadByteProgress>>>,
}

impl RemoteUploadProgress {
    pub fn reset(&self) {
        *self
            .current
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = None;
    }

    pub fn snapshot(&self) -> Option<RemoteUploadByteProgress> {
        *self
            .current
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    fn record(&self, progress: RemoteUploadByteProgress) {
        let mut current = self
            .current
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if current.is_some_and(|value| {
            value.total == progress.total && value.completed >= progress.completed
        }) {
            return;
        }
        *current = Some(progress);
    }
}

#[derive(Clone)]
struct OneDriveHttpClient {
    inner: HttpClient,
    upload_progress: Option<RemoteUploadProgress>,
}

impl HttpFetch for OneDriveHttpClient {
    async fn fetch(&self, mut request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
        fix_onedrive_upload_session_url(&mut request)?;
        let progress = onedrive_upload_request_progress(&request);
        let completes_upload_session = request.headers().contains_key(header::CONTENT_RANGE)
            && progress.is_some_and(|value| value.completed == value.total);
        let mut response = self.inner.fetch(request).await?;
        if completes_upload_session && response.status() == StatusCode::OK {
            // Graph returns 200 when a session replaces an existing file, but
            // OpenDAL 0.53.3 recognizes only 201 as the final chunk response.
            *response.status_mut() = StatusCode::CREATED;
        }
        if response.status().is_success() {
            if let (Some(tracker), Some(progress)) = (&self.upload_progress, progress) {
                tracker.record(progress);
            }
        }
        Ok(response)
    }
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

pub fn build_storage_operator(config: &LibraryStorageConfig) -> Result<Operator, SyncError> {
    build_storage_operator_with_timeouts(
        config,
        REMOTE_CONNECT_TIMEOUT,
        REMOTE_READ_TIMEOUT,
        REMOTE_REQUEST_TIMEOUT,
    )
}

pub(crate) fn build_storage_operator_with_upload_progress(
    config: &LibraryStorageConfig,
) -> Result<(Operator, Option<RemoteUploadProgress>), SyncError> {
    let upload_progress =
        matches!(config, LibraryStorageConfig::Onedrive { .. }).then(RemoteUploadProgress::default);
    let operator = build_storage_operator_with_timeouts_and_progress(
        config,
        REMOTE_CONNECT_TIMEOUT,
        REMOTE_READ_TIMEOUT,
        REMOTE_REQUEST_TIMEOUT,
        upload_progress.clone(),
    )?;
    Ok((operator, upload_progress))
}

pub(crate) fn build_book_upload_operator(
    config: &LibraryStorageConfig,
    upload_progress: Option<RemoteUploadProgress>,
) -> Result<Option<Operator>, SyncError> {
    let LibraryStorageConfig::Onedrive { access_token, root } = config else {
        return Ok(None);
    };
    let client = remote_http_client(
        REMOTE_CONNECT_TIMEOUT,
        REMOTE_READ_TIMEOUT,
        REMOTE_REQUEST_TIMEOUT,
    )?;
    build_onedrive_operator(
        access_token,
        root.as_deref(),
        client,
        upload_progress,
        false,
    )
    .map(Some)
}

fn build_storage_operator_with_timeouts(
    config: &LibraryStorageConfig,
    connect_timeout: Duration,
    read_timeout: Duration,
    request_timeout: Duration,
) -> Result<Operator, SyncError> {
    build_storage_operator_with_timeouts_and_progress(
        config,
        connect_timeout,
        read_timeout,
        request_timeout,
        None,
    )
}

fn build_storage_operator_with_timeouts_and_progress(
    config: &LibraryStorageConfig,
    connect_timeout: Duration,
    read_timeout: Duration,
    request_timeout: Duration,
    upload_progress: Option<RemoteUploadProgress>,
) -> Result<Operator, SyncError> {
    match config {
        LibraryStorageConfig::LocalDirect { root } => {
            Operator::new(Fs::default().root(&non_empty(root, "Local storage root")?))
                .map(|operator| operator.finish())
                .map_err(|error| sync_error(format!("Initialize local storage failed: {error}")))
        }
        LibraryStorageConfig::Webdav {
            endpoint,
            username,
            password,
            root,
        } => {
            let client = remote_http_client(connect_timeout, read_timeout, request_timeout)?;
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
                .map(|operator| {
                    operator.update_http_client(|_| client);
                    operator
                })
                .map_err(|error| sync_error(format!("Initialize WebDAV storage failed: {error}")))
        }
        LibraryStorageConfig::Onedrive { access_token, root } => {
            let client = remote_http_client(connect_timeout, read_timeout, request_timeout)?;
            build_onedrive_operator(access_token, root.as_deref(), client, upload_progress, true)
        }
    }
}

fn build_onedrive_operator(
    access_token: &str,
    root: Option<&str>,
    client: HttpClient,
    upload_progress: Option<RemoteUploadProgress>,
    retry_operations: bool,
) -> Result<Operator, SyncError> {
    let mut builder =
        Onedrive::default().access_token(&non_empty(access_token, "OneDrive access token")?);
    if let Some(root) = root.filter(|value| !value.trim().is_empty()) {
        builder = builder.root(root);
    }
    let operator = Operator::new(builder)
        .map_err(|error| sync_error(format!("Initialize OneDrive storage failed: {error}")))?;
    let operator = if retry_operations {
        operator
            .layer(
                RetryLayer::new()
                    .with_min_delay(Duration::from_millis(500))
                    .with_max_delay(Duration::from_secs(2))
                    .with_max_times(3)
                    .with_jitter(),
            )
            .finish()
    } else {
        // Retrying OpenDAL's one-shot writer recreates a large-file upload
        // session instead of resuming the existing session. OneDrive keeps the
        // original target reserved and rejects the retry with nameAlreadyExists.
        operator.finish()
    };
    operator.update_http_client(|_| {
        HttpClient::with(OneDriveHttpClient {
            inner: client,
            upload_progress,
        })
    });
    Ok(operator)
}

pub(crate) async fn upload_book_file(
    operator: &Operator,
    book_upload_operator: &Operator,
    relative_path: &str,
    size: i64,
    bytes: Vec<u8>,
    upload_progress: Option<&RemoteUploadProgress>,
) -> opendal::Result<()> {
    let bytes = Buffer::from(bytes);
    if book_upload_operator.info().scheme() != Scheme::Onedrive
        || size <= ONEDRIVE_SIMPLE_UPLOAD_MAX
    {
        operator.write(relative_path, bytes).await?;
        return Ok(());
    }
    upload_staged_book_file(
        operator,
        book_upload_operator,
        relative_path,
        size,
        bytes,
        upload_progress,
    )
    .await
}

async fn upload_staged_book_file(
    operator: &Operator,
    book_upload_operator: &Operator,
    relative_path: &str,
    size: i64,
    bytes: Buffer,
    upload_progress: Option<&RemoteUploadProgress>,
) -> opendal::Result<()> {
    let mut last_error = None;
    for attempt in 0..ONEDRIVE_UPLOAD_ATTEMPTS {
        if let Some(upload_progress) = upload_progress {
            upload_progress.reset();
        }
        let staging_path = onedrive_upload_staging_path(relative_path);
        match book_upload_operator
            .write(&staging_path, bytes.clone())
            .await
        {
            Ok(_) => match operator.rename(&staging_path, relative_path).await {
                Ok(()) => return Ok(()),
                Err(error) => {
                    if remote_file_has_size(operator, relative_path, size).await {
                        let _ = operator.delete(&staging_path).await;
                        return Ok(());
                    }
                    let _ = operator.delete(&staging_path).await;
                    return Err(error);
                }
            },
            Err(error) => {
                let temporary = error.is_temporary();
                let _ = operator.delete(&staging_path).await;
                if !temporary || attempt + 1 == ONEDRIVE_UPLOAD_ATTEMPTS {
                    return Err(error);
                }
                last_error = Some(error);
                tokio::time::sleep(Duration::from_millis(500 * (attempt as u64 + 1))).await;
            }
        }
    }
    Err(last_error
        .unwrap_or_else(|| Error::new(ErrorKind::Unexpected, "OneDrive book upload did not run")))
}

fn onedrive_upload_staging_path(relative_path: &str) -> String {
    let parent = relative_path
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or_default();
    let attempt = uuid::Uuid::new_v4().as_simple().to_string();
    format!("{parent}/.myreader-upload-{}.tmp", &attempt[..12])
}

async fn remote_file_has_size(operator: &Operator, relative_path: &str, size: i64) -> bool {
    operator.stat(relative_path).await.is_ok_and(|metadata| {
        metadata.is_file() && i64::try_from(metadata.content_length()).ok() == Some(size)
    })
}

fn onedrive_upload_request_progress(request: &Request<Buffer>) -> Option<RemoteUploadByteProgress> {
    if request.method() != Method::PUT {
        return None;
    }
    if let Some(content_range) = request
        .headers()
        .get(header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("bytes "))
    {
        let (range, total) = content_range.split_once('/')?;
        let (_, end) = range.split_once('-')?;
        return Some(RemoteUploadByteProgress {
            completed: end.parse::<u64>().ok()?.saturating_add(1),
            total: total.parse().ok()?,
        });
    }
    let total = u64::try_from(request.body().len()).ok()?;
    (total > 0).then_some(RemoteUploadByteProgress {
        completed: total,
        total,
    })
}

fn fix_onedrive_upload_session_url(request: &mut Request<Buffer>) -> opendal::Result<()> {
    if request.method() != Method::POST
        || !request
            .uri()
            .path()
            .ends_with(ONEDRIVE_UPLOAD_SESSION_SUFFIX)
    {
        return Ok(());
    }

    let body: serde_json::Value =
        serde_json::from_slice(&request.body().to_vec()).map_err(|error| {
            Error::new(
                ErrorKind::Unexpected,
                "Parse OneDrive upload-session request failed",
            )
            .set_source(error)
        })?;
    let file_name = body
        .pointer("/item/name")
        .and_then(serde_json::Value::as_str)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| {
            Error::new(
                ErrorKind::Unexpected,
                "OneDrive upload-session request is missing item.name",
            )
        })?;
    let encoded_file_name = percent_encode_path(file_name);
    let uri = request.uri().to_string();
    let parent = uri
        .strip_suffix(ONEDRIVE_UPLOAD_SESSION_SUFFIX)
        .ok_or_else(|| {
            Error::new(
                ErrorKind::Unexpected,
                "OneDrive upload-session URL has an unexpected format",
            )
        })?;

    if parent.ends_with(&format!("/{encoded_file_name}")) {
        return Ok(());
    }

    // OpenDAL 0.53.3 sends only the parent path, but Graph requires the URL path
    // to contain the same file name as item.name.
    let separator = if parent.ends_with("/drive/root") {
        ":/"
    } else {
        "/"
    };
    let fixed_uri =
        format!("{parent}{separator}{encoded_file_name}{ONEDRIVE_UPLOAD_SESSION_SUFFIX}");
    *request.uri_mut() = fixed_uri.parse().map_err(|error| {
        Error::new(
            ErrorKind::Unexpected,
            "Build OneDrive upload-session URL failed",
        )
        .set_source(error)
    })?;
    Ok(())
}

fn remote_http_client(
    connect_timeout: Duration,
    read_timeout: Duration,
    request_timeout: Duration,
) -> Result<HttpClient, SyncError> {
    reqwest::Client::builder()
        .connect_timeout(connect_timeout)
        .read_timeout(read_timeout)
        .timeout(request_timeout)
        .build()
        .map(HttpClient::with)
        .map_err(|error| sync_error(format!("Initialize remote HTTP client failed: {error}")))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use futures::stream;
    use http::{header, StatusCode};
    use opendal::services::Fs;

    use super::*;

    #[derive(Clone, Default)]
    struct CapturingOneDriveClient {
        requests: Arc<Mutex<Vec<CapturedRequest>>>,
    }

    #[derive(Clone, Default)]
    struct InterruptedOneDriveClient {
        requests: Arc<Mutex<Vec<(Method, String)>>>,
    }

    struct CapturedRequest {
        method: Method,
        uri: String,
        authorization: Option<String>,
        body: Vec<u8>,
    }

    impl CapturingOneDriveClient {
        fn response(
            status: StatusCode,
            body: impl Into<Vec<u8>>,
        ) -> opendal::Result<Response<HttpBody>> {
            let body = Buffer::from(body.into());
            let content_length = body.len() as u64;
            Response::builder()
                .status(status)
                .body(HttpBody::new(
                    stream::iter(vec![Ok(body)]),
                    Some(content_length),
                ))
                .map_err(|error| {
                    Error::new(ErrorKind::Unexpected, "Build mock OneDrive response failed")
                        .set_source(error)
                })
        }
    }

    impl HttpFetch for CapturingOneDriveClient {
        async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
            let (parts, body) = request.into_parts();
            let authorization = parts
                .headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            let content_range = parts
                .headers
                .get(header::CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            self.requests.lock().unwrap().push(CapturedRequest {
                method: parts.method.clone(),
                uri: parts.uri.to_string(),
                authorization,
                body: body.to_vec(),
            });

            if parts.method == Method::POST {
                return Self::response(
                    StatusCode::OK,
                    br#"{"uploadUrl":"https://upload.example/session","expirationDateTime":"2026-08-04T09:22:45Z"}"#.to_vec(),
                );
            }

            let is_last_chunk = content_range
                .as_deref()
                .and_then(|value| value.split_once('/'))
                .and_then(|(range, total)| {
                    let end = range.rsplit_once('-')?.1.parse::<usize>().ok()?;
                    let total = total.parse::<usize>().ok()?;
                    Some(end + 1 == total)
                })
                .unwrap_or(false);
            if is_last_chunk {
                return Self::response(
                    StatusCode::OK,
                    br#"{"id":"item","name":"book.pdf","lastModifiedDateTime":"2026-08-04T08:22:45Z","eTag":"etag","size":4194305,"parentReference":{"path":"/drive/root:/Library/MyReaderTest2","driveId":"drive","id":"parent"},"file":{"mimeType":"application/pdf"}}"#.to_vec(),
                );
            }

            Self::response(StatusCode::ACCEPTED, Vec::new())
        }
    }

    impl HttpFetch for InterruptedOneDriveClient {
        async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
            let method = request.method().clone();
            let uri = request.uri().to_string();
            self.requests.lock().unwrap().push((method.clone(), uri));

            if method == Method::POST {
                return CapturingOneDriveClient::response(
                    StatusCode::OK,
                    br#"{"uploadUrl":"https://upload.example/interrupted","expirationDateTime":"2026-08-06T08:00:00Z"}"#.to_vec(),
                );
            }
            CapturingOneDriveClient::response(
                StatusCode::SERVICE_UNAVAILABLE,
                br#"{"error":{"code":"serviceUnavailable","message":"try again"}}"#.to_vec(),
            )
        }
    }

    #[test]
    fn should_build_each_storage_backend_when_required_values_are_present() {
        let local = tempfile::tempdir().unwrap();
        let local_operator = build_storage_operator(&LibraryStorageConfig::LocalDirect {
            root: local.path().to_string_lossy().into_owned(),
        })
        .unwrap();
        assert_eq!(local_operator.info().scheme(), opendal::Scheme::Fs);

        let webdav_operator = build_storage_operator(&LibraryStorageConfig::Webdav {
            endpoint: "https://example.com/dav".to_owned(),
            username: "reader".to_owned(),
            password: "secret".to_owned(),
            root: Some("/books".to_owned()),
        })
        .unwrap();
        assert_eq!(webdav_operator.info().scheme(), opendal::Scheme::Webdav);

        let onedrive_operator = build_storage_operator(&LibraryStorageConfig::Onedrive {
            access_token: "token".to_owned(),
            root: Some("/books".to_owned()),
        })
        .unwrap();
        assert_eq!(onedrive_operator.info().scheme(), opendal::Scheme::Onedrive);
    }

    #[test]
    fn should_reject_storage_backend_when_required_secret_is_missing() {
        let error = build_storage_operator(&LibraryStorageConfig::Webdav {
            endpoint: "https://example.com/dav".to_owned(),
            username: "reader".to_owned(),
            password: " ".to_owned(),
            root: None,
        })
        .unwrap_err();
        assert!(error.to_string().contains("WebDAV password is missing"));
    }

    #[tokio::test]
    async fn should_complete_large_upload_when_onedrive_replaces_existing_file() {
        const LARGE_FILE_SIZE: usize = 4 * 1024 * 1024 + 1;

        let client = CapturingOneDriveClient::default();
        let operator = Operator::new(
            Onedrive::default()
                .access_token("token")
                .root("/Library/MyReaderTest2"),
        )
        .unwrap()
        .finish();
        operator.update_http_client(|_| {
            HttpClient::with(OneDriveHttpClient {
                inner: HttpClient::with(client.clone()),
                upload_progress: None,
            })
        });

        operator
            .write(
                "Books/6253fdc2-a0e0-4606-8fe5-add04599b16b/book.pdf",
                vec![0; LARGE_FILE_SIZE],
            )
            .await
            .unwrap();

        let requests = client.requests.lock().unwrap();
        let session_request = requests
            .iter()
            .find(|request| request.method == Method::POST)
            .expect("large OneDrive upload should create an upload session");
        assert!(
            session_request.uri.ends_with(
                "/Library/MyReaderTest2/Books/6253fdc2-a0e0-4606-8fe5-add04599b16b/book.pdf:/createUploadSession"
            ),
            "unexpected upload-session URL: {}",
            session_request.uri
        );
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&session_request.body).unwrap(),
            serde_json::json!({
                "item": {
                    "@microsoft.graph.conflictBehavior": "replace",
                    "name": "book.pdf"
                }
            }),
            "OneDrive rejects the legacy @odata.type upload-session property",
        );
        assert!(
            requests
                .iter()
                .filter(|request| request.method == Method::PUT)
                .all(|request| request.authorization.is_none()),
            "preauthenticated upload-session PUT requests must not include Authorization",
        );
    }

    #[tokio::test]
    async fn should_not_restart_upload_session_when_onedrive_chunk_fails() {
        const LARGE_FILE_SIZE: usize = 4 * 1024 * 1024 + 1;

        let client = InterruptedOneDriveClient::default();
        let operator = build_onedrive_operator(
            "token",
            Some("/Library/MyReaderTest2"),
            HttpClient::with(client.clone()),
            None,
            false,
        )
        .unwrap();

        let error = operator
            .write("Books/Book (123456)/Book.pdf", vec![0; LARGE_FILE_SIZE])
            .await
            .unwrap_err();
        let requests = client.requests.lock().unwrap();
        let session_count = requests
            .iter()
            .filter(|(method, _)| method == Method::POST)
            .count();

        assert!(error.is_temporary(), "unexpected upload error: {error:?}");
        assert_eq!(
            session_count, 1,
            "a failed chunk must not recreate a session for the same target"
        );
    }

    #[tokio::test]
    async fn should_publish_only_final_path_when_staged_book_upload_completes() {
        let directory = tempfile::tempdir().unwrap();
        let operator = Operator::new(
            Fs::default().root(directory.path().to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let relative_path = "Books/Book (123456)/Book.pdf";

        upload_staged_book_file(
            &operator,
            &operator,
            relative_path,
            5,
            Buffer::from(b"book!".to_vec()),
            None,
        )
        .await
        .unwrap();
        let entries = operator
            .list("Books/Book (123456)/")
            .await
            .unwrap()
            .into_iter()
            .filter(|entry| entry.metadata().is_file())
            .map(|entry| entry.path().to_owned())
            .collect::<Vec<_>>();

        assert_eq!(entries, [relative_path]);
    }

    #[tokio::test]
    async fn should_report_uploaded_bytes_when_onedrive_accepts_a_session_chunk() {
        let progress = RemoteUploadProgress::default();
        let client = OneDriveHttpClient {
            inner: HttpClient::with(CapturingOneDriveClient::default()),
            upload_progress: Some(progress.clone()),
        };
        let request = Request::builder()
            .method(Method::PUT)
            .uri("https://upload.example/session")
            .header(header::CONTENT_RANGE, "bytes 0-9/100")
            .body(Buffer::from(vec![0; 10]))
            .unwrap();

        client.fetch(request).await.unwrap();

        assert_eq!(
            progress.snapshot(),
            Some(RemoteUploadByteProgress {
                completed: 10,
                total: 100,
            })
        );
    }

    #[tokio::test]
    async fn should_timeout_when_remote_server_stops_responding() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (_socket, _) = listener.accept().await.unwrap();
            std::future::pending::<()>().await;
        });
        let operator = build_storage_operator_with_timeouts(
            &LibraryStorageConfig::Webdav {
                endpoint: format!("http://{address}"),
                username: "reader".to_owned(),
                password: "secret".to_owned(),
                root: None,
            },
            Duration::from_millis(50),
            Duration::from_millis(50),
            Duration::from_millis(200),
        )
        .unwrap();

        let error = operator.stat("book.epub").await.unwrap_err();
        server.abort();

        assert!(error.is_temporary(), "unexpected timeout error: {error:?}");
        assert!(
            format!("{error:?}").contains("operation timed out"),
            "unexpected timeout error: {error:?}"
        );
    }
}
