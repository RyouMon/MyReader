use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use futures::AsyncReadExt;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;
use tracing::{debug, info, warn};

use crate::error::AppError;
use crate::models::{AppConfig, FileStateDto, LibraryConfig};
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};
use crate::repositories::file_state_repo::SqliteFileStateRepository;
use crate::services::library_service::LibraryService;
use crate::storage::from_data_source;
use crate::utils::paths::{compute_book_relative_path, library_root_path, library_sidecar_path};

const DOWNLOAD_CHUNK_SIZE: usize = 256 * 1024;
const DOWNLOAD_EVENT_THROTTLE_BYTES: u64 = 256 * 1024;

/// Progress payload emitted during book file downloads.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressPayload {
    pub library_id: String,
    pub book_id: i64,
    pub format: String,
    pub status: String,
    pub bytes_written: i64,
    pub total_bytes: Option<i64>,
    pub error: Option<String>,
}

#[allow(clippy::too_many_arguments)]
fn emit_download_progress<R: Runtime>(
    app: &AppHandle<R>,
    library_id: &str,
    book_id: i64,
    format: &str,
    status: &str,
    bytes_written: u64,
    total_bytes: Option<u64>,
    error: Option<String>,
) {
    let event_name = format!("download_progress/{library_id}/{book_id}/{format}");
    let payload = DownloadProgressPayload {
        library_id: library_id.to_string(),
        book_id,
        format: format.to_string(),
        status: status.to_string(),
        bytes_written: bytes_written as i64,
        total_bytes: total_bytes.map(|v| v as i64),
        error,
    };
    if let Err(e) = app.emit(&event_name, payload) {
        debug!("Failed to emit download progress event. event: \"{event_name}\", error: {e}");
    }
}

fn normalize_remote_path(source_path: Option<&str>, relative: &str) -> String {
    let relative = relative.replace('\\', "/").trim_start_matches('/').to_string();
    match source_path {
        Some(sp) => {
            let sp = sp.trim().trim_start_matches('/').trim_end_matches('/');
            if sp.is_empty() {
                relative
            } else {
                format!("{sp}/{relative}")
            }
        }
        None => relative,
    }
}

fn is_cancelled(cancel_rx: &Option<watch::Receiver<bool>>) -> bool {
    cancel_rx.as_ref().is_some_and(|rx| *rx.borrow())
}

/// Coordinates active book file downloads and records cancellations that arrive
/// before a download has finished registering.
#[derive(Clone)]
pub struct DownloadService {
    active: Arc<Mutex<HashMap<String, watch::Sender<bool>>>>,
    pending_cancellations: Arc<Mutex<HashSet<String>>>,
}

impl DownloadService {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
            pending_cancellations: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    fn make_key(library_id: &str, book_id: i64, format: &str) -> String {
        format!("{library_id}/{book_id}/{format}")
    }

    /// Register a new download. Returns a cancellation receiver if the download
    /// was started, or `None` if a download for the same key is already running.
    ///
    /// If a cancellation was requested before the download started, the returned
    /// receiver is already signalled so the task will cancel at its first
    /// checkpoint.
    pub fn start(
        &self,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Option<watch::Receiver<bool>> {
        let mut active = self.active.lock().unwrap_or_else(|e| e.into_inner());
        let mut pending = self.pending_cancellations.lock().unwrap_or_else(|e| e.into_inner());
        let key = Self::make_key(library_id, book_id, format);

        if active.contains_key(&key) {
            return None;
        }

        let (tx, rx) = watch::channel(false);
        if pending.remove(&key) {
            let _ = tx.send(true);
        }
        active.insert(key, tx);
        Some(rx)
    }

    /// Cancel a running or pending download. Returns `true` if a download was
    /// found and signalled to cancel, or if a pending cancellation was recorded
    /// for a download that has not started yet.
    pub fn cancel(&self, library_id: &str, book_id: i64, format: &str) -> bool {
        let key = Self::make_key(library_id, book_id, format);

        {
            let active = self.active.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(tx) = active.get(&key) {
                let _ = tx.send(true);
                return true;
            }
        }

        let mut pending = self.pending_cancellations.lock().unwrap_or_else(|e| e.into_inner());
        let already_pending = pending.contains(&key);
        if already_pending {
            true
        } else {
            pending.insert(key)
        }
    }

    /// Mark a download as finished so subsequent attempts can start a new one.
    pub fn finish(&self, library_id: &str, book_id: i64, format: &str) {
        let mut active = self.active.lock().unwrap_or_else(|e| e.into_inner());
        active.remove(&Self::make_key(library_id, book_id, format));
    }
}

impl Default for DownloadService {
    fn default() -> Self {
        Self::new()
    }
}

impl DownloadService {
    /// Emit a download error event to the frontend.
    pub fn emit_download_error<R: Runtime>(
        app: &AppHandle<R>,
        library_id: &str,
        book_id: i64,
        format: &str,
        error: &AppError,
    ) {
        emit_download_progress(
            app,
            library_id,
            book_id,
            format,
            "error",
            0,
            None,
            Some(error.to_string()),
        );
    }

    /// Check whether a book file already exists locally in the library container.
    pub async fn is_book_file_present(local_path: &Path) -> bool {
        match tokio::fs::metadata(local_path).await {
            Ok(meta) => meta.is_file() && meta.len() > 0,
            Err(_) => false,
        }
    }

    /// Normalize a book format string to uppercase.
    fn normalize_format(format: &str) -> String {
        format.to_uppercase()
    }

    /// Resolve the absolute local path for a specific book format.
    pub async fn resolve_book_file_path(
        app_data_dir: &Path,
        lib: &LibraryConfig,
        book_id: i64,
        format: &str,
    ) -> Result<PathBuf, AppError> {
        let lib_root = library_root_path(lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        let repo = CalibreBookRepository::open(&lib_root).await?;
        let file_path = repo
            .get_book_file_path(&lib_root, book_id, format)
            .await?
            .ok_or_else(|| {
                AppError::NotFound(format!(
                    "BOOK_FORMAT_NOT_FOUND: book={book_id}, format={format}"
                ))
            })?;
        Ok(file_path)
    }

    /// Build an OpenDAL operator for a remote library's data source.
    pub async fn build_operator_for_library(
        lib: &LibraryConfig,
        config: &AppConfig,
    ) -> Result<opendal::Operator, AppError> {
        let data_source_id = lib
            .data_source_id
            .as_deref()
            .ok_or_else(|| AppError::Config("REMOTE_LIBRARY_MISSING_DATASOURCE".into()))?;
        let source = config
            .data_sources
            .iter()
            .find(|s| s.id == data_source_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
        from_data_source(&source).await
    }

    /// Check the local cache state of a book file.
    pub async fn check_file_state(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<FileStateDto, AppError> {
        let format = Self::normalize_format(format);
        let lib = LibraryService::resolve_library(Some(library_id), config)?;
        let lib_root = library_root_path(&lib, app_data_dir);
        let file_path = Self::resolve_book_file_path(app_data_dir, &lib, book_id, &format).await?;
        let relative_path = compute_book_relative_path(&file_path, &lib_root)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir);

        let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy()).await?;
        let row = SqliteFileStateRepository::get_by_path(&db, &relative_path).await?;

        let present = Self::is_book_file_present(&file_path).await;
        let local_state = if present { "present" } else { "remote_only" };

        Ok(FileStateDto {
            path: relative_path,
            local_state: local_state.to_string(),
            local_size: row.and_then(|r| r.local_size),
        })
    }

    /// Delete a locally cached book file and reset its state to remote_only.
    pub async fn delete_local_file(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<(), AppError> {
        let format = Self::normalize_format(format);
        let lib = LibraryService::resolve_library(Some(library_id), config)?;
        let lib_root = library_root_path(&lib, app_data_dir);
        let file_path = Self::resolve_book_file_path(app_data_dir, &lib, book_id, &format).await?;
        let relative_path = compute_book_relative_path(&file_path, &lib_root)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir);

        if tokio::fs::try_exists(&file_path).await.unwrap_or(false) {
            tokio::fs::remove_file(&file_path)
                .await
                .map_err(|e| AppError::Config(format!("BOOK_FILE_DELETE_FAILED: {e}")))?;
        }

        let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy()).await?;
        SqliteFileStateRepository::upsert(&db, &relative_path, "remote_only", None, None)
            .await?;
        Ok(())
    }

    /// Execute a full download workflow: resolve paths, build operator for remote libraries,
    /// and stream the file into the local container. This is intended to run inside the
    /// detached task spawned by the `download_book_file` command.
    #[allow(clippy::too_many_arguments)]
    pub async fn execute_download<R: Runtime>(
        app: &AppHandle<R>,
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        book_id: i64,
        format: &str,
        cancel_rx: watch::Receiver<bool>,
    ) -> Result<String, AppError> {
        let format = Self::normalize_format(format);
        let lib = LibraryService::resolve_library(Some(library_id), config)?;
        let file_path = Self::resolve_book_file_path(app_data_dir, &lib, book_id, &format).await?;

        if !lib.is_remote() {
            return Ok(file_path.to_string_lossy().to_string());
        }

        let lib_root = library_root_path(&lib, app_data_dir);
        let relative_path = compute_book_relative_path(&file_path, &lib_root)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir);
        let op = Self::build_operator_for_library(&lib, config).await?;

        Self::download_book_file(
            app,
            &op,
            lib.source_path.as_deref(),
            &file_path,
            &relative_path,
            library_id,
            book_id,
            &format,
            &sidecar_root,
            Some(cancel_rx),
        )
        .await
        .map(|p| p.to_string_lossy().to_string())
    }

    /// Download a single book file from remote storage into the local container.
    /// Emits progress events on a Tauri channel.
    #[allow(clippy::too_many_arguments)]
    pub async fn download_book_file<R: Runtime>(
        app: &AppHandle<R>,
        op: &opendal::Operator,
        source_path: Option<&str>,
        local_path: &Path,
        book_relative_path: &str,
        library_id: &str,
        book_id: i64,
        format: &str,
        sidecar_root: &Path,
        cancel_rx: Option<watch::Receiver<bool>>,
    ) -> Result<PathBuf, AppError> {
        let relative_local = book_relative_path.replace('\\', "/");
        info!(
            "Start to download book file. library id: \"{}\", book id: {}, format: \"{}\", local: \"{}\", relative: \"{}\"",
            library_id, book_id, format, local_path.display(), relative_local
        );

        // Errors and cancellation are emitted by the caller (download command) so
        // that setup failures before this service is reached are also reported to
        // the frontend without duplicate events.
        Self::download_book_file_inner(
            app,
            op,
            source_path,
            local_path,
            &relative_local,
            library_id,
            book_id,
            format,
            sidecar_root,
            cancel_rx,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn download_book_file_inner<R: Runtime>(
        app: &AppHandle<R>,
        op: &opendal::Operator,
        source_path: Option<&str>,
        local_path: &Path,
        book_relative_path: &str,
        library_id: &str,
        book_id: i64,
        format: &str,
        sidecar_root: &Path,
        cancel_rx: Option<watch::Receiver<bool>>,
    ) -> Result<PathBuf, AppError> {
        if Self::is_book_file_present(local_path).await {
            info!(
                "Book file already present locally, skip download. library id: \"{}\", book id: {}, format: \"{}\"",
                library_id, book_id, format
            );
            let local_size = tokio::fs::metadata(local_path)
                .await
                .map(|m| m.len())
                .unwrap_or(0);
            emit_download_progress(
                app,
                library_id,
                book_id,
                format,
                "done",
                local_size,
                Some(local_size),
                None,
            );
            return Ok(local_path.to_path_buf());
        }

        let remote_path = normalize_remote_path(source_path, book_relative_path);
        info!(
            "Resolved remote book file path. library id: \"{}\", book id: {}, format: \"{}\", remote: \"{}\"",
            library_id, book_id, format, remote_path
        );

        // Ensure parent directory exists.
        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Config(format!("BOOK_FILE_CACHE_DIR_FAILED: {e}")))?;
        }

        // Try to get total size for progress reporting.
        let total_bytes: Option<u64> = match op.stat(&remote_path).await {
            Ok(meta) => Some(meta.content_length()),
            Err(e) => {
                warn!("Failed to stat remote book file before download. remote: \"{remote_path}\", error: {e}");
                None
            }
        };

        if is_cancelled(&cancel_rx) {
            Self::handle_cancel(
                local_path,
                sidecar_root,
                book_relative_path,
                0,
                total_bytes,
            )
            .await?;
            emit_download_progress(
                app,
                library_id,
                book_id,
                format,
                "cancelled",
                0,
                total_bytes,
                None,
            );
            return Err(AppError::Config("BOOK_DOWNLOAD_CANCELLED".into()));
        }

        emit_download_progress(
            app,
            library_id,
            book_id,
            format,
            "starting",
            0,
            total_bytes,
            None,
        );

        let reader = op
            .reader(&remote_path)
            .await
            .map_err(|e| AppError::Config(format!("REMOTE_BOOK_FILE_OPEN_FAILED: {e} ({remote_path})")))?;

        if is_cancelled(&cancel_rx) {
            Self::handle_cancel(
                local_path,
                sidecar_root,
                book_relative_path,
                0,
                total_bytes,
            )
            .await?;
            emit_download_progress(
                app,
                library_id,
                book_id,
                format,
                "cancelled",
                0,
                total_bytes,
                None,
            );
            return Err(AppError::Config("BOOK_DOWNLOAD_CANCELLED".into()));
        }

        let mut async_reader = reader
            .into_futures_async_read(..)
            .await
            .map_err(|e| AppError::Config(format!("REMOTE_BOOK_FILE_READER_FAILED: {e}")))?;

        if is_cancelled(&cancel_rx) {
            Self::handle_cancel(
                local_path,
                sidecar_root,
                book_relative_path,
                0,
                total_bytes,
            )
            .await?;
            emit_download_progress(
                app,
                library_id,
                book_id,
                format,
                "cancelled",
                0,
                total_bytes,
                None,
            );
            return Err(AppError::Config("BOOK_DOWNLOAD_CANCELLED".into()));
        }

        let mut file = tokio::fs::File::create(local_path)
            .await
            .map_err(|e| AppError::Config(format!("BOOK_FILE_CACHE_CREATE_FAILED: {e}")))?;

        let mut buf = vec![0u8; DOWNLOAD_CHUNK_SIZE];
        let mut bytes_written: u64 = 0;
        let mut last_reported: u64 = 0;
        loop {
            if is_cancelled(&cancel_rx) {
                drop(file);
                Self::handle_cancel(
                    local_path,
                    sidecar_root,
                    book_relative_path,
                    bytes_written,
                    total_bytes,
                )
                .await?;
                emit_download_progress(
                    app,
                    library_id,
                    book_id,
                    format,
                    "cancelled",
                    bytes_written,
                    total_bytes,
                    None,
                );
                return Err(AppError::Config("BOOK_DOWNLOAD_CANCELLED".into()));
            }

            let n = async_reader
                .read(&mut buf)
                .await
                .map_err(|e| AppError::Config(format!("REMOTE_BOOK_FILE_READ_FAILED: {e}")))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n])
                .await
                .map_err(|e| AppError::Config(format!("BOOK_FILE_CACHE_WRITE_FAILED: {e}")))?;
            bytes_written += n as u64;

            if bytes_written - last_reported >= DOWNLOAD_EVENT_THROTTLE_BYTES {
                emit_download_progress(
                    app,
                    library_id,
                    book_id,
                    format,
                    "downloading",
                    bytes_written,
                    total_bytes,
                    None,
                );
                last_reported = bytes_written;
            }
        }

        file.flush()
            .await
            .map_err(|e| AppError::Config(format!("BOOK_FILE_CACHE_FLUSH_FAILED: {e}")))?;

        let local_size = tokio::fs::metadata(local_path)
            .await
            .map(|m| m.len() as i64)
            .unwrap_or(bytes_written as i64);
        let local_mtime = tokio::fs::metadata(local_path)
            .await
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64);

        // Update file_state to present.
        let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy()).await?;
        SqliteFileStateRepository::upsert(
            &db,
            book_relative_path,
            "present",
            Some(local_size),
            local_mtime,
        )
        .await?;

        emit_download_progress(
            app,
            library_id,
            book_id,
            format,
            "done",
            bytes_written,
            total_bytes,
            None,
        );

        info!(
            "Success to download book file. library id: \"{}\", book id: {}, format: \"{}\", bytes: {}",
            library_id, book_id, format, bytes_written
        );

        Ok(local_path.to_path_buf())
    }

    #[allow(clippy::too_many_arguments)]
    async fn handle_cancel(
        local_path: &Path,
        sidecar_root: &Path,
        book_relative_path: &str,
        _bytes_written: u64,
        _total_bytes: Option<u64>,
    ) -> Result<(), AppError> {
        if tokio::fs::try_exists(local_path).await.unwrap_or(false) {
            if let Err(e) = tokio::fs::remove_file(local_path).await {
                warn!(
                    "Failed to remove partial downloaded file after cancel. path: \"{}\", error: {e}",
                    local_path.display()
                );
            }
        }
        let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy()).await?;
        SqliteFileStateRepository::upsert(
            &db,
            book_relative_path,
            "remote_only",
            None,
            None,
        )
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use sea_orm::ConnectionTrait;

    use super::*;
    use crate::models::{DataSourceConfig, DataSourceDetail};
    use crate::repositories::file_state_repo::SqliteFileStateRepository;
    use crate::utils::paths::{compute_book_relative_path, library_container_dir, library_sidecar_path};
    use tempfile::tempdir;

    #[test]
    fn normalize_format_should_convert_to_uppercase() {
        assert_eq!(DownloadService::normalize_format("epub"), "EPUB");
        assert_eq!(DownloadService::normalize_format("Epub"), "EPUB");
        assert_eq!(DownloadService::normalize_format("PDF"), "PDF");
    }

    #[test]
    fn normalize_remote_path_should_return_relative_when_source_path_is_none() {
        assert_eq!(
            normalize_remote_path(None, "author/book/file.epub"),
            "author/book/file.epub"
        );
    }

    #[test]
    fn normalize_remote_path_should_prepend_source_path_and_trim_slashes() {
        assert_eq!(
            normalize_remote_path(Some("/Library/CalibreLibrary/"), "author/book/file.epub"),
            "Library/CalibreLibrary/author/book/file.epub"
        );
    }

    #[test]
    fn normalize_remote_path_should_ignore_empty_source_path() {
        assert_eq!(
            normalize_remote_path(Some(""), "author/book/file.epub"),
            "author/book/file.epub"
        );
        assert_eq!(
            normalize_remote_path(Some("/"), "author/book/file.epub"),
            "author/book/file.epub"
        );
    }

    #[test]
    fn normalize_remote_path_should_convert_backslashes_to_forward_slashes() {
        assert_eq!(
            normalize_remote_path(Some("Library/CalibreLibrary"), "author\\book\\file.epub"),
            "Library/CalibreLibrary/author/book/file.epub"
        );
    }

    #[tokio::test]
    async fn is_book_file_present_should_return_true_for_non_empty_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("book.epub");
        tokio::fs::write(&path, b"hello")
            .await
            .expect("write temp file should succeed");
        assert!(DownloadService::is_book_file_present(&path).await);
    }

    #[tokio::test]
    async fn is_book_file_present_should_return_false_for_missing_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("missing.epub");
        assert!(!DownloadService::is_book_file_present(&path).await);
    }

    #[tokio::test]
    async fn is_book_file_present_should_return_false_for_empty_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("empty.epub");
        tokio::fs::write(&path, b"")
            .await
            .expect("write temp file should succeed");
        assert!(!DownloadService::is_book_file_present(&path).await);
    }

    #[test]
    fn start_should_return_receiver_for_new_download() {
        let service = DownloadService::new();
        assert!(service.start("lib", 1, "EPUB").is_some());
        // A second start for the same key must be rejected while active.
        assert!(service.start("lib", 1, "EPUB").is_none());
    }

    #[test]
    fn start_should_return_pre_cancelled_receiver_after_early_cancel() {
        let service = DownloadService::new();
        assert!(service.cancel("lib", 1, "EPUB"));
        let rx = service.start("lib", 1, "EPUB").expect("start should succeed");
        assert!(*rx.borrow());
    }

    #[test]
    fn cancel_should_signal_active_download() {
        let service = DownloadService::new();
        let rx = service.start("lib", 1, "EPUB").unwrap();
        assert!(!*rx.borrow());
        assert!(service.cancel("lib", 1, "EPUB"));
        assert!(*rx.borrow());
    }

    #[test]
    fn cancel_should_record_pending_cancellation_when_not_active() {
        let service = DownloadService::new();
        assert!(service.cancel("lib", 1, "EPUB"));
        let rx = service.start("lib", 1, "EPUB").unwrap();
        assert!(*rx.borrow());
    }

    #[test]
    fn cancel_should_return_true_when_already_pending() {
        let service = DownloadService::new();
        assert!(service.cancel("lib", 1, "EPUB"));
        assert!(service.cancel("lib", 1, "EPUB"));
    }

    #[test]
    fn finish_should_allow_new_download_after_completion() {
        let service = DownloadService::new();
        assert!(service.start("lib", 1, "EPUB").is_some());
        service.finish("lib", 1, "EPUB");
        assert!(service.start("lib", 1, "EPUB").is_some());
    }

    #[test]
    fn cloned_service_should_share_download_state() {
        let service = DownloadService::new();
        let clone = service.clone();
        let rx = service.start("lib", 1, "EPUB").unwrap();
        assert!(clone.cancel("lib", 1, "EPUB"));
        assert!(*rx.borrow());
    }

    #[tokio::test]
    async fn build_operator_for_library_should_build_local_operator_when_source_exists() {
        let dir = tempdir().unwrap();
        let config = AppConfig {
            data_sources: vec![DataSourceConfig {
                id: "ds-local".into(),
                name: "Local".into(),
                enabled: true,
                detail: DataSourceDetail::Local {
                    root_path: dir.path().to_string_lossy().to_string(),
                },
            }],
            ..Default::default()
        };
        let lib = LibraryConfig {
            id: "lib".into(),
            name: "Test".into(),
            path: "".into(),
            source_type: Some("local".into()),
            data_source_id: Some("ds-local".into()),
            source_path: None,
        };

        let op = DownloadService::build_operator_for_library(&lib, &config)
            .await
            .expect("operator should build");
        op.write("test.txt", b"hello".to_vec())
            .await
            .expect("write should succeed");
        let content: Vec<u8> = op.read("test.txt").await.expect("read should succeed").to_vec();
        assert_eq!(content, b"hello");
    }

    #[tokio::test]
    async fn build_operator_for_library_should_return_not_found_when_source_missing() {
        let config = AppConfig::default();
        let lib = LibraryConfig {
            id: "lib".into(),
            name: "Test".into(),
            path: "".into(),
            source_type: Some("local".into()),
            data_source_id: Some("missing".into()),
            source_path: None,
        };

        let err = DownloadService::build_operator_for_library(&lib, &config)
            .await
            .unwrap_err();
        assert!(format!("{err}").contains("DATASOURCE_NOT_FOUND"));
    }

    // -------------------------------------------------------------------------
    // Helpers and integration-style tests for path resolution, file state, and
    // download execution. These build a minimal Calibre metadata.db so the
    // service methods can be exercised without a real library.
    // -------------------------------------------------------------------------

    fn local_test_library(id: &str, root: &std::path::Path) -> LibraryConfig {
        LibraryConfig {
            id: id.into(),
            name: "Test".into(),
            path: root.to_string_lossy().to_string(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }
    }

    async fn create_minimal_calibre_library(root: &std::path::Path) -> (i64, String, PathBuf) {
        let db_path = root.join("metadata.db");
        let url = format!(
            "sqlite://{}?mode=rwc",
            db_path.to_str().expect("valid utf8")
        );
        let db = sea_orm::Database::connect(&url)
            .await
            .expect("connect to setup db");

        let schema = "
            CREATE TABLE books (
                id INTEGER PRIMARY KEY,
                title TEXT, sort TEXT, timestamp TEXT, pubdate TEXT, series_index REAL,
                author_sort TEXT, isbn TEXT, lccn TEXT, path TEXT, flags INTEGER,
                uuid TEXT, has_cover INTEGER, last_modified TEXT
            );
            CREATE TABLE data (
                id INTEGER PRIMARY KEY,
                book INTEGER NOT NULL,
                format TEXT NOT NULL,
                uncompressed_size INTEGER NOT NULL,
                name TEXT NOT NULL
            );
        ";
        db.execute_unprepared(schema)
            .await
            .expect("create calibre schema");

        let book_id = 42i64;
        let book_path = "It";
        let file_name = "It";
        let format = "EPUB";

        db.execute_unprepared(
            &format!(
                "INSERT INTO books (id, path) VALUES ({book_id}, '{book_path}');"
            ),
        )
        .await
        .expect("insert book");

        db.execute_unprepared(
            &format!(
                "INSERT INTO data (id, book, format, uncompressed_size, name) \
                 VALUES (1, {book_id}, '{format}', 12, '{file_name}');"
            ),
        )
        .await
        .expect("insert data");

        let file_dir = root.join(book_path);
        tokio::fs::create_dir_all(&file_dir)
            .await
            .expect("create book dir");
        let file_path = file_dir.join(format!("{file_name}.{}", format.to_lowercase()));
        tokio::fs::write(&file_path, b"book content")
            .await
            .expect("write book file");

        (book_id, format.to_string(), file_path)
    }

    #[tokio::test]
    async fn resolve_book_file_path_should_return_path_when_format_exists() {
        let lib_root = tempdir().unwrap();
        let (book_id, format, expected_path) =
            create_minimal_calibre_library(lib_root.path()).await;
        let lib = local_test_library("lib-resolve", lib_root.path());

        let path = DownloadService::resolve_book_file_path(lib_root.path(), &lib, book_id, &format)
            .await
            .expect("resolve should succeed");

        assert_eq!(path, expected_path);
    }

    #[tokio::test]
    async fn resolve_book_file_path_should_return_none_when_book_missing() {
        let lib_root = tempdir().unwrap();
        let (_, format, _) = create_minimal_calibre_library(lib_root.path()).await;
        let lib = local_test_library("lib-resolve-missing", lib_root.path());

        let err = DownloadService::resolve_book_file_path(lib_root.path(), &lib, 9999, &format)
            .await
            .expect_err("missing book should fail");

        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn resolve_book_file_path_should_return_none_when_format_missing() {
        let lib_root = tempdir().unwrap();
        let (book_id, _, _) = create_minimal_calibre_library(lib_root.path()).await;
        let lib = local_test_library("lib-resolve-no-format", lib_root.path());

        let err = DownloadService::resolve_book_file_path(lib_root.path(), &lib, book_id, "PDF")
            .await
            .expect_err("missing format should fail");

        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn check_file_state_should_return_present_when_file_exists() {
        let lib_root = tempdir().unwrap();
        let app_data = tempdir().unwrap();
        let (book_id, format, _) = create_minimal_calibre_library(lib_root.path()).await;
        let config = AppConfig {
            libraries: vec![local_test_library("lib-state-present", lib_root.path())],
            ..Default::default()
        };

        let dto = DownloadService::check_file_state(
            app_data.path(),
            &config,
            "lib-state-present",
            book_id,
            &format,
        )
        .await
        .expect("check should succeed");

        assert_eq!(dto.local_state, "present");
        assert!(dto.path.contains("It/It.epub"));
    }

    #[tokio::test]
    async fn check_file_state_should_return_remote_only_when_file_missing() {
        let lib_root = tempdir().unwrap();
        let app_data = tempdir().unwrap();
        let (book_id, format, file_path) =
            create_minimal_calibre_library(lib_root.path()).await;
        tokio::fs::remove_file(&file_path).await.unwrap();

        let config = AppConfig {
            libraries: vec![local_test_library("lib-state-missing", lib_root.path())],
            ..Default::default()
        };

        let dto = DownloadService::check_file_state(
            app_data.path(),
            &config,
            "lib-state-missing",
            book_id,
            &format,
        )
        .await
        .expect("check should succeed");

        assert_eq!(dto.local_state, "remote_only");
    }

    #[tokio::test]
    async fn check_file_state_should_return_local_size_from_file_state_row() {
        let lib_root = tempdir().unwrap();
        let app_data = tempdir().unwrap();
        let (book_id, format, file_path) =
            create_minimal_calibre_library(lib_root.path()).await;
        let lib = local_test_library("lib-state-size", lib_root.path());

        let relative_path =
            compute_book_relative_path(&file_path, lib_root.path()).expect("relative path");
        let sidecar_root = library_sidecar_path(&lib, app_data.path());
        let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy())
            .await
            .expect("open sidecar db");
        SqliteFileStateRepository::upsert(&db, &relative_path, "present", Some(12345), Some(1111111111),
        )
        .await
        .expect("upsert state");

        let config = AppConfig {
            libraries: vec![lib],
            ..Default::default()
        };
        let dto = DownloadService::check_file_state(
            app_data.path(),
            &config,
            "lib-state-size",
            book_id,
            &format,
        )
        .await
        .expect("check should succeed");

        assert_eq!(dto.local_state, "present");
        assert_eq!(dto.local_size, Some(12345));
    }

    #[tokio::test]
    async fn delete_local_file_should_remove_file_and_set_remote_only() {
        let lib_root = tempdir().unwrap();
        let app_data = tempdir().unwrap();
        let (book_id, format, file_path) =
            create_minimal_calibre_library(lib_root.path()).await;
        let lib = local_test_library("lib-delete", lib_root.path());

        let relative_path =
            compute_book_relative_path(&file_path, lib_root.path()).expect("relative path");
        let sidecar_root = library_sidecar_path(&lib, app_data.path());
        let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy())
            .await
            .expect("open sidecar db");
        SqliteFileStateRepository::upsert(&db, &relative_path, "present", Some(12), Some(1111111111),
        )
        .await
        .expect("upsert state");

        let config = AppConfig {
            libraries: vec![lib],
            ..Default::default()
        };
        DownloadService::delete_local_file(
            app_data.path(),
            &config,
            "lib-delete",
            book_id,
            &format,
        )
        .await
        .expect("delete should succeed");

        assert!(!tokio::fs::try_exists(&file_path).await.unwrap());
        let row = SqliteFileStateRepository::get_by_path(&db, &relative_path)
            .await
            .expect("query should succeed")
            .expect("row should exist");
        assert_eq!(row.local_state, "remote_only");
        assert!(row.local_size.is_none());
    }

    // Note: tests using mock_app() need the tauri "test" feature and, on
    // Windows, the Common Controls v6 manifest workaround in build.rs to avoid
    // STATUS_ENTRYPOINT_NOT_FOUND. See tauri-apps/tauri#13419.
    fn mock_app_handle() -> tauri::AppHandle<tauri::test::MockRuntime> {
        tauri::test::mock_app().handle().clone()
    }

    #[tokio::test]
    async fn execute_download_should_return_path_for_local_library() {
        let lib_root = tempdir().unwrap();
        let app_data = tempdir().unwrap();
        let (book_id, format, expected_path) =
            create_minimal_calibre_library(lib_root.path()).await;
        let config = AppConfig {
            libraries: vec![local_test_library("lib-local-dl", lib_root.path())],
            ..Default::default()
        };

        let (_tx, rx) = watch::channel(false);
        let path = DownloadService::execute_download(
            &mock_app_handle(),
            app_data.path(),
            &config,
            "lib-local-dl",
            book_id,
            &format,
            rx,
        )
        .await
        .expect("execute_download should succeed");

        assert_eq!(PathBuf::from(path), expected_path);
    }

    #[tokio::test]
    async fn execute_download_should_download_remote_file_into_container() {
        // Simulate a remote library: the original book file lives in
        // `original_root`, while the container (`{app_data}/libraries/{lib_id}`)
        // only holds metadata.db. The download should copy the file into the
        // container and record its state.
        let original_root = tempdir().unwrap();
        let app_data = tempdir().unwrap();

        // Place the actual book file in the remote/original storage.
        let book_dir = original_root.path().join("It");
        tokio::fs::create_dir_all(&book_dir).await.unwrap();
        let original_file = book_dir.join("It.epub");
        tokio::fs::write(&original_file, b"remote book content")
            .await
            .unwrap();

        let lib = LibraryConfig {
            id: "lib-remote-dl".into(),
            name: "Remote".into(),
            path: "".into(),
            source_type: Some("webdav".into()),
            data_source_id: Some("ds-remote".into()),
            source_path: None,
        };

        // The container is where metadata.db and the downloaded file live.
        let container_root = library_container_dir(app_data.path(), &lib.id);
        tokio::fs::create_dir_all(&container_root).await.unwrap();

        // Create a matching metadata.db in the container.
        let (book_id, format, local_file) =
            create_minimal_calibre_library(&container_root).await;

        // Remove the file created by the helper so the download is required.
        tokio::fs::remove_file(&local_file).await.unwrap();

        let config = AppConfig {
            libraries: vec![lib.clone()],
            data_sources: vec![DataSourceConfig {
                id: "ds-remote".into(),
                name: "Remote".into(),
                enabled: true,
                detail: DataSourceDetail::Local {
                    root_path: original_root.path().to_string_lossy().to_string(),
                },
            }],
            ..Default::default()
        };

        let (_tx, rx) = watch::channel(false);
        DownloadService::execute_download(
            &mock_app_handle(),
            app_data.path(),
            &config,
            "lib-remote-dl",
            book_id,
            &format,
            rx,
        )
        .await
        .expect("execute_download should succeed");

        let downloaded = container_root.join("It/It.epub");
        assert!(tokio::fs::try_exists(&downloaded).await.unwrap());
        let content: Vec<u8> = tokio::fs::read(&downloaded).await.unwrap();
        assert_eq!(content, b"remote book content");

        let sidecar_root = library_sidecar_path(&lib, app_data.path());
        let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy())
            .await
            .expect("open sidecar db");
        let row = SqliteFileStateRepository::get_by_path(
            &db,
            "It/It.epub",
        )
        .await
        .expect("query should succeed")
        .expect("row should exist");
        assert_eq!(row.local_state, "present");
        assert_eq!(row.local_size, Some(19));
    }
}
