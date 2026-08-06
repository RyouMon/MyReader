use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex, Weak},
    time::Duration,
};

use opendal::{ErrorKind, Operator};
use tokio::sync::Mutex as AsyncMutex;

use crate::{
    models::LibraryStorageConfig,
    repositories::content::PendingBookImport,
    sync::{
        document::CatalogBookValue,
        document_engine::DocumentCommand,
        persistence::{
            ensure_database_document, execute_local_database_command, DatabaseIdentity,
            SyncDatabaseCommand,
        },
        transport::{self, RemoteUploadProgress},
    },
    CoreError,
};

static BOOK_UPLOAD_LOCKS: LazyLock<Mutex<HashMap<PathBuf, Weak<AsyncMutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BookUploadProgress {
    pub book_uuid: String,
    pub completed: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BookUploadReport {
    pub completed_book_uuids: Vec<String>,
    pub unavailable_book_uuids: Vec<String>,
}

pub trait BookUploadObserver: Send + Sync {
    fn on_progress(&self, progress: BookUploadProgress);
}

struct NoopObserver;

impl BookUploadObserver for NoopObserver {
    fn on_progress(&self, _progress: BookUploadProgress) {}
}

enum UploadOutcome {
    Completed,
    Cancelled,
    SourceUnavailable,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PendingCatalogState {
    Missing,
    Active { has_cover: bool },
    Deleted,
}

pub struct BookTransferService;

impl BookTransferService {
    pub async fn has_local_only_books(sidecar_root: &Path) -> Result<bool, CoreError> {
        super::content::ContentService::list_file_states(sidecar_root)
            .await
            .map(|states| {
                states
                    .iter()
                    .any(|state| matches!(state.local_state.as_str(), "local_only" | "dirty_push"))
            })
    }

    pub async fn pending_book_uuids(sidecar_root: &Path) -> Result<Vec<String>, CoreError> {
        super::content::ContentService::list_pending_book_imports(sidecar_root)
            .await
            .map(|pending| pending.into_iter().map(|book| book.book_uuid).collect())
    }

    pub async fn has_pending_books(sidecar_root: &Path) -> Result<bool, CoreError> {
        Self::pending_book_uuids(sidecar_root)
            .await
            .map(|pending| !pending.is_empty())
    }

    pub async fn upload_pending_books(
        sidecar_root: &Path,
        content_root: &Path,
        storage: &LibraryStorageConfig,
    ) -> Result<BookUploadReport, CoreError> {
        Self::upload_pending_books_observed(sidecar_root, content_root, storage, &NoopObserver)
            .await
    }

    pub async fn upload_pending_books_observed(
        sidecar_root: &Path,
        content_root: &Path,
        storage: &LibraryStorageConfig,
        observer: &dyn BookUploadObserver,
    ) -> Result<BookUploadReport, CoreError> {
        if !Self::has_pending_books(sidecar_root).await? {
            return Ok(BookUploadReport::default());
        }
        if matches!(storage, LibraryStorageConfig::LocalDirect { .. }) {
            return Err(CoreError::Config("REMOTE_LIBRARY_STORAGE_REQUIRED".into()));
        }
        let (operator, upload_progress) =
            transport::build_storage_operator_with_upload_progress(storage)?;
        let book_upload_operator =
            transport::build_book_upload_operator(storage, upload_progress.clone())?;
        Self::upload_pending_books_with_operator_observed(
            sidecar_root,
            content_root,
            &operator,
            book_upload_operator.as_ref().unwrap_or(&operator),
            upload_progress.as_ref(),
            observer,
        )
        .await
    }

    #[cfg(test)]
    pub(crate) async fn upload_pending_books_with_operator(
        sidecar_root: &Path,
        content_root: &Path,
        operator: &Operator,
    ) -> Result<BookUploadReport, CoreError> {
        Self::upload_pending_books_with_operator_observed(
            sidecar_root,
            content_root,
            operator,
            operator,
            None,
            &NoopObserver,
        )
        .await
    }

    async fn upload_pending_books_with_operator_observed(
        sidecar_root: &Path,
        content_root: &Path,
        operator: &Operator,
        book_upload_operator: &Operator,
        upload_progress: Option<&RemoteUploadProgress>,
        observer: &dyn BookUploadObserver,
    ) -> Result<BookUploadReport, CoreError> {
        let lock = book_upload_lock(sidecar_root);
        let _guard = lock.lock().await;
        let pending_imports =
            super::content::ContentService::list_pending_book_imports(sidecar_root).await?;
        if pending_imports.is_empty() {
            return Ok(BookUploadReport::default());
        }

        let marker = super::library::LibraryService::read_myreader_marker(content_root)?;
        let database_path = crate::database::library_db_path(&sidecar_root.to_string_lossy())?;
        let database_path = database_path
            .to_str()
            .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
        let identity = crate::sync::persistence::ensure_database_identity(
            database_path,
            &marker.library_uuid,
        )?;
        let mut report = BookUploadReport {
            completed_book_uuids: Vec::with_capacity(pending_imports.len()),
            unavailable_book_uuids: Vec::new(),
        };

        for pending in pending_imports {
            match Self::upload_pending_book(
                sidecar_root,
                content_root,
                database_path,
                &identity,
                &pending,
                operator,
                book_upload_operator,
                upload_progress,
                observer,
            )
            .await
            {
                Ok(UploadOutcome::Completed) => report.completed_book_uuids.push(pending.book_uuid),
                Ok(UploadOutcome::Cancelled) => {}
                Ok(UploadOutcome::SourceUnavailable) => {
                    report.unavailable_book_uuids.push(pending.book_uuid)
                }
                Err(error) => {
                    super::content::ContentService::record_pending_book_import_failure(
                        sidecar_root,
                        &pending.book_uuid,
                        &error.to_string(),
                    )
                    .await?;
                    return Err(error);
                }
            }
        }
        Ok(report)
    }

    #[allow(clippy::too_many_arguments)]
    async fn upload_pending_book(
        sidecar_root: &Path,
        content_root: &Path,
        database_path: &str,
        identity: &DatabaseIdentity,
        pending: &PendingBookImport,
        operator: &Operator,
        book_upload_operator: &Operator,
        upload_progress: Option<&RemoteUploadProgress>,
        observer: &dyn BookUploadObserver,
    ) -> Result<UploadOutcome, CoreError> {
        if !super::content::ContentService::pending_book_import_exists(
            sidecar_root,
            &pending.book_uuid,
        )
        .await?
        {
            return Ok(UploadOutcome::Cancelled);
        }
        let catalog_state = pending_catalog_state(database_path, identity, pending)?;
        if catalog_state == PendingCatalogState::Deleted {
            super::content::ContentService::delete_pending_book_import(
                sidecar_root,
                &pending.book_uuid,
            )
            .await?;
            return Ok(UploadOutcome::Cancelled);
        }
        let cover_relative_path =
            crate::models::catalog::myreader_cover_relative_path(&pending_book_path(pending)?);
        let cover_path = content_root.join(&cover_relative_path);
        let has_cover = match catalog_state {
            PendingCatalogState::Active { has_cover } => has_cover,
            PendingCatalogState::Missing => cover_path.is_file(),
            PendingCatalogState::Deleted => false,
        };
        observer.on_progress(BookUploadProgress {
            book_uuid: pending.book_uuid.clone(),
            completed: 0,
            total: u64::try_from(pending.size).unwrap_or(u64::MAX),
        });
        let final_path = content_root.join(&pending.relative_path);
        if remote_file_has_expected_size(operator, pending).await? {
            if !ensure_remote_cover(
                sidecar_root,
                operator,
                pending,
                &cover_relative_path,
                &cover_path,
                has_cover,
            )
            .await?
            {
                remove_cancelled_remote_book(operator, pending).await;
                return Ok(UploadOutcome::Cancelled);
            }
            return finalize_pending_upload(
                sidecar_root,
                database_path,
                identity,
                pending,
                matches!(catalog_state, PendingCatalogState::Active { .. }),
                has_cover,
                &final_path,
                operator,
                observer,
            )
            .await;
        }

        if !final_path.is_file() {
            mark_pending_source_unavailable(sidecar_root, pending, "PENDING_BOOK_FILE_UNAVAILABLE")
                .await?;
            return Ok(UploadOutcome::SourceUnavailable);
        }
        let digest = super::content::ContentService::sha256_file(&final_path).await?;
        if digest.size != pending.size || digest.sha256 != pending.sha256 {
            mark_pending_source_unavailable(
                sidecar_root,
                pending,
                "PENDING_BOOK_FILE_DIGEST_MISMATCH",
            )
            .await?;
            return Ok(UploadOutcome::SourceUnavailable);
        }

        let bytes = tokio::fs::read(&final_path).await?;
        if !upload_remote_book(
            sidecar_root,
            operator,
            book_upload_operator,
            pending,
            bytes,
            upload_progress,
            observer,
        )
        .await?
        {
            remove_cancelled_remote_book(operator, pending).await;
            return Ok(UploadOutcome::Cancelled);
        }
        let metadata = operator
            .stat(&pending.relative_path)
            .await
            .map_err(crate::infrastructure::storage::storage_error)?;
        if i64::try_from(metadata.content_length()).ok() != Some(pending.size) {
            return Err(CoreError::DataIntegrity(
                "REMOTE_BOOK_FILE_SIZE_MISMATCH".into(),
            ));
        }
        if !ensure_remote_cover(
            sidecar_root,
            operator,
            pending,
            &cover_relative_path,
            &cover_path,
            has_cover,
        )
        .await?
        {
            remove_cancelled_remote_book(operator, pending).await;
            return Ok(UploadOutcome::Cancelled);
        }

        finalize_pending_upload(
            sidecar_root,
            database_path,
            identity,
            pending,
            matches!(catalog_state, PendingCatalogState::Active { .. }),
            has_cover,
            &final_path,
            operator,
            observer,
        )
        .await
    }
}

fn book_upload_lock(sidecar_root: &Path) -> Arc<AsyncMutex<()>> {
    let key = sidecar_root.to_path_buf();
    let mut locks = BOOK_UPLOAD_LOCKS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
        return lock;
    }
    let lock = Arc::new(AsyncMutex::new(()));
    locks.insert(key, Arc::downgrade(&lock));
    lock
}

fn pending_catalog_state(
    database_path: &str,
    identity: &DatabaseIdentity,
    pending: &PendingBookImport,
) -> Result<PendingCatalogState, CoreError> {
    let document = ensure_database_document(database_path, identity, pending.recorded_at_ms)?;
    let existing = document
        .projection
        .catalog_books
        .iter()
        .find(|book| book.uuid == pending.book_uuid || book.book_id == pending.book_id);
    if let Some(existing) = existing {
        let pending_path = pending_book_path(pending)?;
        let pending_name = pending_file_name(pending)?;
        if existing.uuid != pending.book_uuid
            || existing.book_id != pending.book_id
            || existing.path != pending_path
            || existing.name != pending_name
            || existing.format != pending.format
            || existing.size != pending.size
            || existing.sha256 != pending.sha256
        {
            return Err(CoreError::DataIntegrity(
                "PENDING_BOOK_CATALOG_IDENTITY_CONFLICT".into(),
            ));
        }
        return Ok(if existing.deleted {
            PendingCatalogState::Deleted
        } else {
            PendingCatalogState::Active {
                has_cover: existing.has_cover,
            }
        });
    }
    Ok(PendingCatalogState::Missing)
}

#[allow(clippy::too_many_arguments)]
async fn finalize_pending_upload(
    sidecar_root: &Path,
    database_path: &str,
    identity: &DatabaseIdentity,
    pending: &PendingBookImport,
    catalog_exists: bool,
    has_cover: bool,
    final_path: &Path,
    operator: &Operator,
    observer: &dyn BookUploadObserver,
) -> Result<UploadOutcome, CoreError> {
    let pending_exists = super::content::ContentService::pending_book_import_exists(
        sidecar_root,
        &pending.book_uuid,
    )
    .await?;
    let catalog_state = pending_catalog_state(database_path, identity, pending)?;
    if !pending_exists || catalog_state == PendingCatalogState::Deleted {
        if catalog_state == PendingCatalogState::Deleted {
            super::content::ContentService::delete_pending_book_import(
                sidecar_root,
                &pending.book_uuid,
            )
            .await?;
        }
        remove_cancelled_remote_book(operator, pending).await;
        return Ok(UploadOutcome::Cancelled);
    }

    complete_pending_upload(
        sidecar_root,
        database_path,
        identity,
        pending,
        catalog_exists,
        has_cover,
        final_path,
    )
    .await?;

    if pending_catalog_state(database_path, identity, pending)? == PendingCatalogState::Deleted {
        super::content::ContentService::mark_file_remote_delete_pending(
            sidecar_root,
            &pending.relative_path,
        )
        .await?;
        remove_cancelled_remote_book(operator, pending).await;
        return Ok(UploadOutcome::Cancelled);
    }

    observer.on_progress(BookUploadProgress {
        book_uuid: pending.book_uuid.clone(),
        completed: pending.size as u64,
        total: pending.size as u64,
    });
    Ok(UploadOutcome::Completed)
}

async fn remove_cancelled_remote_book(operator: &Operator, pending: &PendingBookImport) {
    let _ = operator.delete(&pending.relative_path).await;
    if let Ok(path) = pending_book_path(pending) {
        let _ = operator
            .delete(&crate::models::catalog::myreader_cover_relative_path(&path))
            .await;
    }
}

async fn remote_file_has_expected_size(
    operator: &Operator,
    pending: &PendingBookImport,
) -> Result<bool, CoreError> {
    match operator.stat(&pending.relative_path).await {
        Ok(metadata) => Ok(metadata.is_file()
            && i64::try_from(metadata.content_length()).ok() == Some(pending.size)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(crate::infrastructure::storage::storage_error(error)),
    }
}

fn pending_file_name(pending: &PendingBookImport) -> Result<String, CoreError> {
    let file_name = pending
        .relative_path
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| CoreError::DataIntegrity("PENDING_BOOK_FILE_NAME_INVALID".into()))?;
    let extension = format!(".{}", pending.format.to_ascii_lowercase());
    if !file_name.to_ascii_lowercase().ends_with(extension.as_str())
        || file_name.len() <= extension.len()
    {
        return Err(CoreError::DataIntegrity(
            "PENDING_BOOK_FILE_NAME_INVALID".into(),
        ));
    }
    Ok(file_name[..file_name.len() - extension.len()].to_owned())
}

fn pending_book_path(pending: &PendingBookImport) -> Result<String, CoreError> {
    pending
        .relative_path
        .rsplit_once('/')
        .map(|(path, _)| path.to_owned())
        .filter(|path| !path.is_empty())
        .ok_or_else(|| CoreError::DataIntegrity("PENDING_BOOK_PATH_INVALID".into()))
}

async fn ensure_remote_cover(
    sidecar_root: &Path,
    operator: &Operator,
    pending: &PendingBookImport,
    relative_path: &str,
    local_path: &Path,
    has_cover: bool,
) -> Result<bool, CoreError> {
    if !has_cover {
        return Ok(true);
    }
    if !super::content::ContentService::pending_book_import_exists(sidecar_root, &pending.book_uuid)
        .await?
    {
        return Ok(false);
    }
    let metadata = tokio::fs::metadata(local_path).await.map_err(|error| {
        CoreError::DataIntegrity(format!("PENDING_BOOK_COVER_UNAVAILABLE: {error}"))
    })?;
    let expected_size = i64::try_from(metadata.len())
        .map_err(|error| CoreError::DataIntegrity(format!("BOOK_COVER_TOO_LARGE: {error}")))?;
    if !metadata.is_file() || expected_size < 1 {
        return Err(CoreError::DataIntegrity(
            "PENDING_BOOK_COVER_UNAVAILABLE".into(),
        ));
    }
    match operator.stat(relative_path).await {
        Ok(remote)
            if remote.is_file()
                && i64::try_from(remote.content_length()).ok() == Some(expected_size) =>
        {
            return Ok(true);
        }
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(crate::infrastructure::storage::storage_error(error)),
    }

    let bytes = tokio::fs::read(local_path).await?;
    operator
        .write(relative_path, bytes)
        .await
        .map_err(crate::infrastructure::storage::storage_error)?;
    if !super::content::ContentService::pending_book_import_exists(sidecar_root, &pending.book_uuid)
        .await?
    {
        let _ = operator.delete(relative_path).await;
        return Ok(false);
    }
    let remote = operator
        .stat(relative_path)
        .await
        .map_err(crate::infrastructure::storage::storage_error)?;
    if !remote.is_file() || i64::try_from(remote.content_length()).ok() != Some(expected_size) {
        return Err(CoreError::DataIntegrity(
            "REMOTE_BOOK_COVER_SIZE_MISMATCH".into(),
        ));
    }
    Ok(true)
}

async fn mark_pending_source_unavailable(
    sidecar_root: &Path,
    pending: &PendingBookImport,
    error: &str,
) -> Result<(), CoreError> {
    super::content::ContentService::mark_file_source_missing(sidecar_root, &pending.relative_path)
        .await?;
    super::content::ContentService::record_pending_book_import_failure(
        sidecar_root,
        &pending.book_uuid,
        error,
    )
    .await
}

async fn complete_pending_upload(
    sidecar_root: &Path,
    database_path: &str,
    identity: &DatabaseIdentity,
    pending: &PendingBookImport,
    catalog_exists: bool,
    has_cover: bool,
    final_path: &Path,
) -> Result<(), CoreError> {
    if !catalog_exists {
        let timestamp = super::catalog::catalog_timestamp(pending.recorded_at_ms)?;
        execute_local_database_command(
            database_path,
            identity,
            pending.recorded_at_ms,
            SyncDatabaseCommand {
                command: DocumentCommand::CreateCatalogBook {
                    value: CatalogBookValue {
                        uuid: pending.book_uuid.clone(),
                        book_id: pending.book_id,
                        title: pending.title.clone(),
                        authors: pending.authors.clone(),
                        path: pending_book_path(pending)?,
                        name: pending_file_name(pending)?,
                        format: pending.format.clone(),
                        size: pending.size,
                        sha256: pending.sha256.clone(),
                        has_cover,
                        timestamp: timestamp.clone(),
                        last_modified: timestamp,
                        deleted: false,
                    },
                    recorded_at: pending.recorded_at_ms,
                },
            },
        )?;
    }

    if final_path.is_file() {
        match super::content::ContentService::finalize_verified_downloaded_file(
            sidecar_root,
            &pending.relative_path,
            final_path,
            pending.size,
            &pending.sha256,
        )
        .await
        {
            Ok(_) => {}
            Err(CoreError::Io(_) | CoreError::Storage(_) | CoreError::DataIntegrity(_)) => {
                match tokio::fs::remove_file(final_path).await {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error.into()),
                }
                super::content::ContentService::mark_file_remote_only(
                    sidecar_root,
                    &pending.relative_path,
                )
                .await?;
            }
            Err(error) => return Err(error),
        }
    } else {
        super::content::ContentService::mark_file_remote_only(sidecar_root, &pending.relative_path)
            .await?;
    }
    super::content::ContentService::delete_pending_book_import(sidecar_root, &pending.book_uuid)
        .await
}

async fn upload_remote_book(
    sidecar_root: &Path,
    operator: &Operator,
    book_upload_operator: &Operator,
    pending: &PendingBookImport,
    bytes: Vec<u8>,
    upload_progress: Option<&RemoteUploadProgress>,
    observer: &dyn BookUploadObserver,
) -> Result<bool, CoreError> {
    let bytes_total = u64::try_from(pending.size).unwrap_or(u64::MAX);
    if let Some(upload_progress) = upload_progress {
        upload_progress.reset();
    }
    let upload = transport::upload_book_file(
        operator,
        book_upload_operator,
        &pending.relative_path,
        pending.size,
        bytes,
        upload_progress,
    );
    tokio::pin!(upload);
    let mut last_reported = 0;
    let mut tick_count = 0_u8;
    loop {
        tokio::select! {
            result = &mut upload => {
                result.map_err(crate::infrastructure::storage::storage_error)?;
                return Ok(true);
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {
                tick_count = tick_count.wrapping_add(1);
                if tick_count % 5 == 0
                    && !super::content::ContentService::pending_book_import_exists(
                        sidecar_root,
                        &pending.book_uuid,
                    )
                    .await?
                {
                    return Ok(false);
                }
                let Some(progress) = upload_progress.and_then(RemoteUploadProgress::snapshot) else {
                    continue;
                };
                let completed = progress.completed.min(bytes_total.saturating_sub(1));
                if completed <= last_reported {
                    continue;
                }
                last_reported = completed;
                observer.on_progress(BookUploadProgress {
                    book_uuid: pending.book_uuid.clone(),
                    completed,
                    total: bytes_total,
                });
            }
        }
    }
}
