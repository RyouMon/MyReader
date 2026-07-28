use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use futures::AsyncReadExt;
use myreader_core::api::content::{DownloadCancellation, DownloadCoordinator};
use myreader_core::models::DownloadTaskRequest;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::AsyncWriteExt;
use tracing::{debug, info, warn};

use crate::error::AppError;
use crate::models::{
    AppConfig, BookFileStateDto, FileStateDto, FileStateRequestDto, LibraryConfig,
};
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
    if let Err(e) = app.emit("download_progress", payload.clone()) {
        debug!("Failed to emit global download progress event. error: {e}");
    }
    if let Err(e) = app.emit(&event_name, payload) {
        debug!("Failed to emit download progress event. event: \"{event_name}\", error: {e}");
    }
}

fn is_cancelled(cancellation: &Option<DownloadCancellation>) -> bool {
    cancellation
        .as_ref()
        .is_some_and(DownloadCancellation::is_cancelled)
}

/// Adapts the shared download coordinator to Tauri events and background tasks.
#[derive(Clone)]
pub struct DownloadService {
    coordinator: Arc<DownloadCoordinator>,
}

impl DownloadService {
    pub fn new() -> Self {
        Self {
            coordinator: Arc::new(
                DownloadCoordinator::new(usize::MAX)
                    .expect("desktop download concurrency must be positive"),
            ),
        }
    }

    pub fn register_download_task(
        &self,
        request: DownloadTaskRequest,
    ) -> Result<Option<(String, DownloadCancellation)>, AppError> {
        let enqueued = self.coordinator.enqueue(request)?;
        if !enqueued.inserted {
            return Ok(None);
        }
        let task_id = enqueued.task.id;
        if self.coordinator.claim(&task_id).is_none() {
            if self.coordinator.is_cancelled(&task_id) {
                let cancellation = self
                    .coordinator
                    .cancellation_token(&task_id)
                    .expect("cancelled download must have a cancellation token");
                return Ok(Some((task_id, cancellation)));
            }
            self.coordinator.release(&task_id);
            return Ok(None);
        }
        let cancellation = self
            .coordinator
            .cancellation_token(&task_id)
            .expect("claimed download must have a cancellation token");
        Ok(Some((task_id, cancellation)))
    }

    pub fn release_download_task(&self, task_id: &str) -> bool {
        self.coordinator.release(task_id)
    }

    pub fn is_download_active(&self, library_id: &str, relative_path: &str) -> bool {
        self.coordinator.is_active(library_id, relative_path)
    }

    pub fn cancel_download_path(&self, library_id: &str, relative_path: &str) -> bool {
        self.coordinator.cancel_by_key(library_id, relative_path)
    }

    pub fn start(
        &self,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Option<DownloadCancellation> {
        let key = Self::book_download_key(book_id, format);
        self.register_download_task(DownloadTaskRequest {
            id: format!("{library_id}:{key}"),
            library_id: library_id.to_owned(),
            book_id: Some(book_id.to_string()),
            format: Some(Self::normalize_format(format)),
            relative_path: key.clone(),
            dedupe_key: Some(key),
            label: String::new(),
        })
        .ok()
        .flatten()
        .map(|(_, cancellation)| cancellation)
    }

    pub fn is_active(&self, library_id: &str, book_id: i64, format: &str) -> bool {
        self.is_download_active(library_id, &Self::book_download_key(book_id, format))
    }

    pub fn cancel(&self, library_id: &str, book_id: i64, format: &str) -> bool {
        self.cancel_download_path(library_id, &Self::book_download_key(book_id, format))
    }

    pub fn finish(&self, library_id: &str, book_id: i64, format: &str) {
        self.release_download_task(&format!(
            "{library_id}:{}",
            Self::book_download_key(book_id, format)
        ));
    }

    /// Enqueue a book file download. Returns an empty string immediately; the actual
    /// download runs in a background task. If a download for the same key is already
    /// active, this is a no-op deduplication.
    pub async fn enqueue_book_file_download<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<String, AppError> {
        let fmt = format.to_uppercase();
        if self.is_active(library_id, book_id, &fmt) {
            info!(
                "Download already in progress, return existing path. library id: \"{}\", book id: {}, format: \"{}\"",
                library_id, book_id, fmt
            );
            return Ok(String::new());
        }
        let lib = Self::resolve_remote_library(config, library_id)?;
        let lib_root = library_root_path(&lib, app_data_dir);
        let file_path = Self::resolve_book_file_path(app_data_dir, &lib, book_id, &fmt).await?;
        let relative_path = compute_book_relative_path(&file_path, &lib_root)?;
        let registered = self.register_download_task(DownloadTaskRequest {
            id: format!("{library_id}:{relative_path}"),
            library_id: library_id.to_owned(),
            book_id: Some(book_id.to_string()),
            format: Some(fmt.clone()),
            relative_path,
            dedupe_key: Some(Self::book_download_key(book_id, &fmt)),
            label: String::new(),
        })?;
        let Some((task_id, cancellation)) = registered else {
            info!(
                "Download already in progress, return existing path. library id: \"{}\", book id: {}, format: \"{}\"",
                library_id, book_id, fmt
            );
            return Ok(String::new());
        };

        emit_download_progress(app, library_id, book_id, &fmt, "starting", 0, None, None);

        let app_clone = app.clone();
        let app_data_dir = app_data_dir.to_path_buf();
        let config = config.clone();
        let library_id_clone = library_id.to_string();
        let fmt_clone = fmt.clone();
        let service_clone = self.clone();

        tauri::async_runtime::spawn(async move {
            let result = DownloadService::execute_download(
                &app_clone,
                &app_data_dir,
                &config,
                &library_id_clone,
                book_id,
                &fmt,
                cancellation,
            )
            .await;

            if let Err(e) = &result {
                if !matches!(e, AppError::Config(msg) if msg.starts_with("BOOK_DOWNLOAD_CANCELLED"))
                {
                    DownloadService::emit_download_error(
                        &app_clone,
                        &library_id_clone,
                        book_id,
                        &fmt_clone,
                        e,
                    );
                }
            }

            if result.is_ok() {
                service_clone.coordinator.complete(&task_id);
            } else if !service_clone.coordinator.is_cancelled(&task_id) {
                service_clone
                    .coordinator
                    .fail(&task_id, result.as_ref().unwrap_err().to_string());
            }
            service_clone.coordinator.release(&task_id);
            result
        });

        Ok(String::new())
    }

    /// Check file state and overlay any currently active in-memory download.
    pub async fn check_file_state_with_active_download(
        &self,
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<FileStateDto, AppError> {
        let fmt = Self::normalize_format(format);
        let mut dto =
            Self::check_file_state(app_data_dir, config, library_id, book_id, &fmt).await?;
        if dto.local_state != "present"
            && self
                .coordinator
                .is_active(library_id, &Self::book_download_key(book_id, &fmt))
        {
            dto.local_state = "downloading".into();
        }
        Ok(dto)
    }

    /// Check a batch of file states and overlay any currently active in-memory downloads.
    pub async fn check_file_states_with_active_download(
        &self,
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        requests: &[FileStateRequestDto],
    ) -> Result<Vec<BookFileStateDto>, AppError> {
        let mut rows = Self::check_file_states(app_data_dir, config, library_id, requests).await?;
        for row in &mut rows {
            if row.local_state != "present"
                && self.coordinator.is_active(
                    library_id,
                    &Self::book_download_key(row.book_id, &row.format),
                )
            {
                row.local_state = "downloading".into();
            }
        }
        Ok(rows)
    }

    /// Cancel a remote library download and broadcast the terminal state.
    pub fn cancel_book_download<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        config: &AppConfig,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<bool, AppError> {
        let fmt = Self::normalize_format(format);
        Self::resolve_remote_library(config, library_id)?;
        let cancelled =
            self.cancel_download_path(library_id, &Self::book_download_key(book_id, &fmt));
        if cancelled {
            Self::emit_download_status(app, library_id, book_id, &fmt, "cancelled");
        }
        Ok(cancelled)
    }

    /// Delete a remote library's local cached file and broadcast the remote-only state.
    pub async fn delete_local_book_file<R: Runtime>(
        app: &AppHandle<R>,
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<(), AppError> {
        let fmt = Self::normalize_format(format);
        Self::delete_local_file(app_data_dir, config, library_id, book_id, &fmt).await?;
        Self::emit_download_status(app, library_id, book_id, &fmt, "remote_only");
        Ok(())
    }

    pub fn emit_download_status<R: Runtime>(
        app: &AppHandle<R>,
        library_id: &str,
        book_id: i64,
        format: &str,
        status: &str,
    ) {
        emit_download_progress(app, library_id, book_id, format, status, 0, None, None);
    }

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

    fn book_download_key(book_id: i64, format: &str) -> String {
        format!("book:{book_id}:{}", Self::normalize_format(format))
    }

    async fn get_stored_file_state(
        sidecar_root: &Path,
        path: &str,
    ) -> Result<Option<myreader_core::models::FileState>, AppError> {
        Ok(myreader_core::api::content::get_file_state(sidecar_root, path).await?)
    }

    /// Resolve a library and reject file mutations against original local Calibre files.
    fn resolve_remote_library(
        config: &AppConfig,
        library_id: &str,
    ) -> Result<LibraryConfig, AppError> {
        let lib = LibraryService::resolve_library(Some(library_id), config)?;
        if !lib.is_remote() {
            return Err(AppError::Config(
                "LOCAL_LIBRARY_FILE_ACTION_NOT_ALLOWED".into(),
            ));
        }
        Ok(lib)
    }

    /// Resolve the absolute local path for a specific book format.
    pub async fn resolve_book_file_path(
        app_data_dir: &Path,
        lib: &LibraryConfig,
        book_id: i64,
        format: &str,
    ) -> Result<PathBuf, AppError> {
        let lib_root = library_root_path(lib, app_data_dir);
        let file_path = myreader_core::api::catalog::get_book_file_path(&lib_root, book_id, format)
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

        let row = Self::get_stored_file_state(&sidecar_root, &relative_path).await?;

        let present = Self::is_book_file_present(&file_path).await
            && (!lib.is_remote()
                || row
                    .as_ref()
                    .is_some_and(|r| r.local_state.as_str() == "present"));
        let local_state = if present { "present" } else { "remote_only" };

        Ok(FileStateDto {
            path: relative_path,
            local_state: local_state.to_string(),
            local_size: if present {
                row.and_then(|r| r.local_size)
            } else {
                None
            },
        })
    }

    /// Check the local cache state of multiple book files using one Calibre DB
    /// connection and one sidecar file_state query.
    pub async fn check_file_states(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        requests: &[FileStateRequestDto],
    ) -> Result<Vec<BookFileStateDto>, AppError> {
        if requests.is_empty() {
            return Ok(Vec::new());
        }

        let lib = LibraryService::resolve_library(Some(library_id), config)?;
        let lib_root = library_root_path(&lib, app_data_dir);
        let normalized_requests: Vec<(i64, String)> = requests
            .iter()
            .map(|item| (item.book_id, Self::normalize_format(&item.format)))
            .collect();
        let file_paths =
            myreader_core::api::catalog::get_book_file_paths(&lib_root, &normalized_requests)
                .await?;

        let mut relative_paths = Vec::with_capacity(normalized_requests.len());
        let mut relative_by_key = HashMap::with_capacity(normalized_requests.len());
        for (book_id, format) in &normalized_requests {
            let key = (*book_id, format.clone());
            let file_path = file_paths.get(&key).ok_or_else(|| {
                AppError::NotFound(format!(
                    "BOOK_FORMAT_NOT_FOUND: book={}, format={}",
                    book_id, format
                ))
            })?;
            let relative_path = compute_book_relative_path(file_path, &lib_root)?;
            relative_paths.push(relative_path.clone());
            relative_by_key.insert(key, (file_path.clone(), relative_path));
        }

        let rows_by_path = if lib.is_remote() {
            let sidecar_root = library_sidecar_path(&lib, app_data_dir);
            myreader_core::api::content::get_file_states(&sidecar_root, &relative_paths).await?
        } else {
            HashMap::new()
        };

        let mut result = Vec::with_capacity(normalized_requests.len());
        for (book_id, format) in normalized_requests {
            let (file_path, relative_path) = relative_by_key
                .get(&(book_id, format.clone()))
                .cloned()
                .expect("relative path should be resolved for request");
            let row = rows_by_path.get(&relative_path);
            let present = Self::is_book_file_present(&file_path).await
                && (!lib.is_remote()
                    || row.is_some_and(|row| row.local_state.as_str() == "present"));
            result.push(BookFileStateDto {
                book_id,
                format,
                path: relative_path,
                local_state: if present { "present" } else { "remote_only" }.to_string(),
                local_size: if present {
                    row.and_then(|row| row.local_size)
                } else {
                    None
                },
            });
        }

        Ok(result)
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
        let lib = Self::resolve_remote_library(config, library_id)?;
        let lib_root = library_root_path(&lib, app_data_dir);
        let file_path = Self::resolve_book_file_path(app_data_dir, &lib, book_id, &format).await?;
        let relative_path = compute_book_relative_path(&file_path, &lib_root)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir);

        if tokio::fs::try_exists(&file_path).await.unwrap_or(false) {
            tokio::fs::remove_file(&file_path)
                .await
                .map_err(|e| AppError::Config(format!("BOOK_FILE_DELETE_FAILED: {e}")))?;
        }

        myreader_core::api::content::mark_file_remote_only(&sidecar_root, &relative_path).await?;
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
        cancellation: DownloadCancellation,
    ) -> Result<String, AppError> {
        let format = Self::normalize_format(format);
        let lib = Self::resolve_remote_library(config, library_id)?;
        let file_path = Self::resolve_book_file_path(app_data_dir, &lib, book_id, &format).await?;

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
            Some(cancellation),
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
        cancellation: Option<DownloadCancellation>,
    ) -> Result<PathBuf, AppError> {
        let relative_local = book_relative_path.replace('\\', "/");
        info!(
            "Start to download book file. library id: \"{}\", book id: {}, format: \"{}\", local: \"{}\", relative: \"{}\"",
            library_id, book_id, format, local_path.display(), relative_local
        );

        // Errors and cancellation are emitted by the caller (download command) so
        // that setup failures before this service is reached are also reported to
        // the frontend without duplicate events.
        let result = Self::download_book_file_inner(
            app,
            op,
            source_path,
            local_path,
            &relative_local,
            library_id,
            book_id,
            format,
            sidecar_root,
            cancellation,
        )
        .await;

        if result.is_err() {
            if let Err(cleanup_err) =
                Self::reset_failed_download(local_path, sidecar_root, &relative_local).await
            {
                warn!(
                    "Failed to reset failed book download. path: \"{}\", error: {cleanup_err}",
                    local_path.display()
                );
            }
        }

        result
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
        cancellation: Option<DownloadCancellation>,
    ) -> Result<PathBuf, AppError> {
        let row = Self::get_stored_file_state(sidecar_root, book_relative_path).await?;
        let sidecar_present = row
            .as_ref()
            .is_some_and(|r| r.local_state.as_str() == "present");

        if sidecar_present && Self::is_book_file_present(local_path).await {
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

        let remote_path =
            myreader_core::api::content::resolve_remote_file_path(source_path, book_relative_path)?;
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

        if is_cancelled(&cancellation) {
            Self::handle_cancel(local_path, sidecar_root, book_relative_path, 0, total_bytes)
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

        let reader = op.reader(&remote_path).await.map_err(|e| {
            AppError::Config(format!("REMOTE_BOOK_FILE_OPEN_FAILED: {e} ({remote_path})"))
        })?;

        if is_cancelled(&cancellation) {
            Self::handle_cancel(local_path, sidecar_root, book_relative_path, 0, total_bytes)
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

        if is_cancelled(&cancellation) {
            Self::handle_cancel(local_path, sidecar_root, book_relative_path, 0, total_bytes)
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
            if is_cancelled(&cancellation) {
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

        myreader_core::api::content::finalize_downloaded_file(
            sidecar_root,
            book_relative_path,
            local_path,
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

    async fn reset_failed_download(
        local_path: &Path,
        sidecar_root: &Path,
        book_relative_path: &str,
    ) -> Result<(), AppError> {
        if tokio::fs::try_exists(local_path).await.unwrap_or(false) {
            if let Err(e) = tokio::fs::remove_file(local_path).await {
                warn!(
                    "Failed to remove partial downloaded file after error. path: \"{}\", error: {e}",
                    local_path.display()
                );
            }
        }
        myreader_core::api::content::mark_file_remote_only(sidecar_root, book_relative_path)
            .await?;
        Ok(())
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
        myreader_core::api::content::mark_file_remote_only(sidecar_root, book_relative_path)
            .await?;
        Ok(())
    }
}

impl Default for DownloadService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_format_should_convert_to_uppercase() {
        assert_eq!(DownloadService::normalize_format("epub"), "EPUB");
        assert_eq!(DownloadService::normalize_format("Epub"), "EPUB");
        assert_eq!(DownloadService::normalize_format("PDF"), "PDF");
    }
}
