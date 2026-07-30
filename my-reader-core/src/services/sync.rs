use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, LazyLock, Mutex, Weak},
    time::Instant,
};

use opendal::Operator;
use tokio::sync::Mutex as AsyncMutex;

use crate::{
    database,
    models::{
        BookSummary, CalibreSyncReport, Library, LibraryStorageConfig, LibrarySyncOptions,
        LibrarySyncReport, LibrarySyncScope, MyReaderSyncReport, SidecarSyncMode,
        SidecarSyncReport, SyncFailureDisposition, SyncFailureKind, SyncScheduleSnapshot,
    },
    sync::{
        exchange::{self, SyncMode, SyncObserver},
        persistence::{self, SyncScheduleState},
        scheduler::{
            SchedulerEvent, SchedulerPolicy, SchedulerState, SchedulerTransition, SyncExecution,
            SyncTiming,
        },
        transport,
    },
    CoreError,
};

static SYNC_LOCKS: LazyLock<Mutex<HashMap<String, Weak<AsyncMutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub struct SyncCoordinator {
    state: Mutex<SchedulerState>,
}

impl Default for SyncCoordinator {
    fn default() -> Self {
        Self::new(SchedulerPolicy::default())
    }
}

impl SyncCoordinator {
    pub fn new(policy: SchedulerPolicy) -> Self {
        Self {
            state: Mutex::new(SchedulerState::new(policy)),
        }
    }

    pub fn request(
        &self,
        library_id: &str,
        mode: SidecarSyncMode,
        reason: &str,
        timing: SyncTiming,
        now_ms: u64,
    ) -> SchedulerTransition {
        self.apply(SchedulerEvent::Request {
            library_id: library_id.to_owned(),
            mode: engine_mode(mode),
            reason: reason.to_owned(),
            timing,
            now_ms,
        })
    }

    pub fn flush(&self, library_id: &str, reason: &str, now_ms: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::Flush {
            library_id: library_id.to_owned(),
            reason: reason.to_owned(),
            now_ms,
        })
    }

    pub async fn request_contextual_pull(
        &self,
        sidecar_root: &Path,
        library_id: &str,
        reason: &str,
        now_ms: u64,
        freshness_ms: u64,
    ) -> Result<SchedulerTransition, CoreError> {
        let Some(mode) = SyncService::effective_mode(
            sidecar_root,
            SidecarSyncMode::Full,
            sqlite_timestamp(now_ms)?,
            sqlite_timestamp(freshness_ms)?,
        )
        .await?
        else {
            return Ok(SchedulerTransition::default());
        };
        Ok(self.request(library_id, mode, reason, SyncTiming::Immediate, now_ms))
    }

    pub async fn recover_library(
        &self,
        sidecar_root: &Path,
        library_id: &str,
        now_ms: u64,
    ) -> Result<SchedulerTransition, CoreError> {
        let snapshot = SyncService::schedule_snapshot(sidecar_root).await?;
        self.apply(SchedulerEvent::Restore {
            library_id: library_id.to_owned(),
            next_retry_at: snapshot
                .next_retry_at
                .map(|value| u64::try_from(value.max(0)).unwrap_or_default()),
            retry_count: snapshot.transient_failure_count,
            suspended: snapshot.suspended_reason.is_some(),
        });
        if snapshot.suspended_reason.is_some()
            || !SyncService::has_pending_work(sidecar_root).await?
        {
            return Ok(SchedulerTransition::default());
        }
        Ok(self.request(
            library_id,
            SidecarSyncMode::PushOnly,
            "startup_recovery",
            SyncTiming::Immediate,
            now_ms,
        ))
    }

    pub fn begin(&self, library_id: &str, generation: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::Begin {
            library_id: library_id.to_owned(),
            generation,
        })
    }

    pub async fn effective_execution(
        &self,
        sidecar_root: &Path,
        mut execution: SyncExecution,
        now_ms: u64,
        freshness_ms: u64,
    ) -> Result<Option<SyncExecution>, CoreError> {
        let requested_mode = sidecar_mode(execution.mode);
        match SyncService::effective_mode(
            sidecar_root,
            requested_mode,
            sqlite_timestamp(now_ms)?,
            sqlite_timestamp(freshness_ms)?,
        )
        .await?
        {
            Some(mode) => {
                execution.mode = engine_mode(mode);
                Ok(Some(execution))
            }
            None => Ok(None),
        }
    }

    pub fn complete(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::Complete {
            library_id: library_id.to_owned(),
            now_ms,
        })
    }

    pub async fn fail(
        &self,
        sidecar_root: &Path,
        execution: SyncExecution,
        kind: SyncFailureKind,
        reason: &str,
        now_ms: u64,
        random_fraction: f64,
    ) -> Result<SchedulerTransition, CoreError> {
        match SyncService::classify_failure(kind) {
            SyncFailureDisposition::Retry => {
                let transition = self.apply(SchedulerEvent::Retry {
                    execution,
                    now_ms,
                    random_fraction,
                });
                if let Some(retry) = transition.retry.as_ref() {
                    SyncService::record_retry(
                        sidecar_root,
                        sqlite_timestamp(retry.next_retry_at)?,
                        retry.retry_count,
                    )
                    .await?;
                }
                Ok(transition)
            }
            SyncFailureDisposition::Suspend => {
                let transition = self.apply(SchedulerEvent::Suspend { execution });
                SyncService::record_suspension(sidecar_root, reason).await?;
                Ok(transition)
            }
        }
    }

    pub fn resume(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::Resume {
            library_id: library_id.to_owned(),
            now_ms,
        })
    }

    pub fn wake_retry(&self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.apply(SchedulerEvent::WakeRetry {
            library_id: library_id.to_owned(),
            now_ms,
        })
    }

    pub fn set_library_online(
        &self,
        library_id: &str,
        online: bool,
        now_ms: u64,
    ) -> SchedulerTransition {
        let transition = self.apply(SchedulerEvent::SetLibraryOnline {
            library_id: library_id.to_owned(),
            online,
            now_ms,
        });
        if online {
            self.wake_retry(library_id, now_ms)
        } else {
            transition
        }
    }

    pub fn dispose(&self) -> SchedulerTransition {
        self.apply(SchedulerEvent::Dispose)
    }

    fn apply(&self, event: SchedulerEvent) -> SchedulerTransition {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .apply(event)
    }
}

struct NoopObserver;

impl SyncObserver for NoopObserver {
    fn is_cancelled(&self) -> bool {
        false
    }

    fn on_progress(&self, _progress: exchange::SyncProgress) {}
}

fn sync_lock(database_path: &str) -> Arc<AsyncMutex<()>> {
    let mut locks = SYNC_LOCKS.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(lock) = locks.get(database_path).and_then(Weak::upgrade) {
        return lock;
    }
    let lock = Arc::new(AsyncMutex::new(()));
    locks.insert(database_path.to_owned(), Arc::downgrade(&lock));
    lock
}

fn database_path(sidecar_root: &Path) -> Result<String, CoreError> {
    database::library_db_path(&sidecar_root.to_string_lossy())
        .map(|path| path.to_string_lossy().into_owned())
}

fn engine_mode(mode: SidecarSyncMode) -> SyncMode {
    match mode {
        SidecarSyncMode::PushOnly => SyncMode::PushOnly,
        SidecarSyncMode::Full => SyncMode::Full,
    }
}

fn sidecar_mode(mode: SyncMode) -> SidecarSyncMode {
    match mode {
        SyncMode::PushOnly => SidecarSyncMode::PushOnly,
        SyncMode::Full => SidecarSyncMode::Full,
    }
}

fn sqlite_timestamp(timestamp: u64) -> Result<i64, CoreError> {
    i64::try_from(timestamp)
        .map_err(|_| CoreError::Sync("Timestamp exceeds SQLite INTEGER range".into()))
}

pub struct SyncService;

impl SyncService {
    pub async fn sync_sidecar(
        sidecar_root: &Path,
        library_root: &Path,
        now_ms: i64,
        mode: SidecarSyncMode,
        storage: &LibraryStorageConfig,
    ) -> Result<SidecarSyncReport, CoreError> {
        Self::sync_sidecar_observed(
            sidecar_root,
            library_root,
            now_ms,
            mode,
            storage,
            &NoopObserver,
        )
        .await
    }

    pub async fn sync_sidecar_observed(
        sidecar_root: &Path,
        library_root: &Path,
        now_ms: i64,
        mode: SidecarSyncMode,
        storage: &LibraryStorageConfig,
        observer: &dyn SyncObserver,
    ) -> Result<SidecarSyncReport, CoreError> {
        let operator = transport::build_storage_operator(storage)?;
        Self::sync_sidecar_with_operator_observed(
            sidecar_root,
            library_root,
            now_ms,
            mode,
            &operator,
            observer,
        )
        .await
    }

    async fn sync_sidecar_with_operator_observed(
        sidecar_root: &Path,
        library_root: &Path,
        now_ms: i64,
        mode: SidecarSyncMode,
        operator: &Operator,
        observer: &dyn SyncObserver,
    ) -> Result<SidecarSyncReport, CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let database_path = database_path(sidecar_root)?;
        let lock = sync_lock(&database_path);
        let _guard = lock.lock().await;
        let library_uuid = super::catalog::CatalogService::get_library_uuid(library_root).await?;
        let identity = persistence::ensure_database_identity(&database_path, &library_uuid)?;
        let report = exchange::sync_database_with_operator_observed(
            &database_path,
            operator,
            &identity,
            now_ms,
            engine_mode(mode),
            observer,
        )
        .await?;
        persistence::mark_schedule_succeeded(
            &database_path,
            (mode == SidecarSyncMode::Full).then_some(now_ms),
        )?;
        Ok(SidecarSyncReport {
            pushed: report.pushed,
            pulled: report.pulled,
        })
    }

    pub async fn sync_library(
        config_path: &Path,
        sidecar_root: &Path,
        library_root: &Path,
        library_id: &str,
        now_ms: i64,
        options: LibrarySyncOptions,
        storage: &LibraryStorageConfig,
    ) -> Result<LibrarySyncReport, CoreError> {
        Self::sync_library_observed(
            config_path,
            sidecar_root,
            library_root,
            library_id,
            now_ms,
            options,
            storage,
            &NoopObserver,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn sync_library_observed(
        config_path: &Path,
        sidecar_root: &Path,
        library_root: &Path,
        library_id: &str,
        now_ms: i64,
        options: LibrarySyncOptions,
        storage: &LibraryStorageConfig,
        observer: &dyn SyncObserver,
    ) -> Result<LibrarySyncReport, CoreError> {
        let started_at = Instant::now();
        let config = super::config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        let library = config
            .libraries
            .iter()
            .find(|library| library.id == library_id)
            .cloned()
            .ok_or_else(|| CoreError::NotFound(format!("LIBRARY_NOT_FOUND: {library_id}")))?;
        let operator = transport::build_storage_operator(storage)?;

        let myreader = if scope_has_myreader(options.scope) {
            match Self::sync_sidecar_with_operator_observed(
                sidecar_root,
                library_root,
                now_ms,
                options.sidecar_mode,
                &operator,
                observer,
            )
            .await
            {
                Ok(report) => {
                    observer.on_sidecar_complete(&exchange::SyncReport {
                        pushed: report.pushed,
                        pulled: report.pulled,
                    });
                    observer.on_progress(exchange::SyncProgress {
                        stage: exchange::SyncStage::SidecarComplete,
                        completed: 1,
                        total: 2,
                    });
                    MyReaderSyncReport {
                        skipped: false,
                        skip_reason: None,
                        mode: options.sidecar_mode,
                        pushed: report.pushed,
                        pulled: report.pulled,
                        error: None,
                        failure_kind: None,
                    }
                }
                Err(error) => MyReaderSyncReport {
                    skipped: true,
                    skip_reason: Some("error".into()),
                    mode: options.sidecar_mode,
                    pushed: 0,
                    pulled: 0,
                    failure_kind: failure_kind(&error),
                    error: Some(error.to_string()),
                },
            }
        } else {
            MyReaderSyncReport {
                skipped: true,
                skip_reason: Some("not_applicable".into()),
                mode: options.sidecar_mode,
                pushed: 0,
                pulled: 0,
                error: None,
                failure_kind: None,
            }
        };

        let (calibre, calibre_failure_kind) = if scope_has_calibre(options.scope) {
            observer.on_progress(exchange::SyncProgress {
                stage: exchange::SyncStage::Calibre,
                completed: 1,
                total: 2,
            });
            match sync_calibre(
                config_path,
                library.clone(),
                sidecar_root,
                library_root,
                options.force_calibre,
                &operator,
            )
            .await
            {
                Ok(report) => (report, None),
                Err(error) => {
                    let failure_kind = failure_kind(&error);
                    (
                        CalibreSyncReport {
                            skipped: true,
                            skip_reason: Some("error".into()),
                            changed: false,
                            library,
                            error: Some(error.to_string()),
                        },
                        failure_kind,
                    )
                }
            }
        } else {
            (
                CalibreSyncReport {
                    skipped: true,
                    skip_reason: Some("not_applicable".into()),
                    changed: false,
                    library,
                    error: None,
                },
                None,
            )
        };

        observer.on_progress(exchange::SyncProgress {
            stage: exchange::SyncStage::Complete,
            completed: 2,
            total: 2,
        });
        let (error, failure_kind) = if let Some(error) = myreader.error.clone() {
            (Some(error), myreader.failure_kind)
        } else {
            (calibre.error.clone(), calibre_failure_kind)
        };
        Ok(LibrarySyncReport {
            library_id: library_id.to_owned(),
            library_name: calibre.library.name.clone(),
            calibre,
            myreader,
            duration_ms: u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX),
            error,
            failure_kind,
        })
    }

    pub async fn has_pending_work(sidecar_root: &Path) -> Result<bool, CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        Ok(exchange::has_pending_database_work(&database_path(
            sidecar_root,
        )?)?)
    }

    pub async fn effective_mode(
        sidecar_root: &Path,
        requested_mode: SidecarSyncMode,
        now_ms: i64,
        freshness_ms: i64,
    ) -> Result<Option<SidecarSyncMode>, CoreError> {
        if requested_mode == SidecarSyncMode::PushOnly {
            return Ok(Some(SidecarSyncMode::PushOnly));
        }
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let path = database_path(sidecar_root)?;
        let last_pull = persistence::read_schedule_state(&path)?
            .and_then(|state| state.last_successful_pull_at);
        let is_fresh = last_pull.is_some_and(|last_pull| {
            last_pull <= now_ms && now_ms.saturating_sub(last_pull) < freshness_ms
        });
        if !is_fresh {
            return Ok(Some(SidecarSyncMode::Full));
        }
        if exchange::has_pending_database_work(&path)? {
            return Ok(Some(SidecarSyncMode::PushOnly));
        }
        Ok(None)
    }

    pub async fn schedule_snapshot(sidecar_root: &Path) -> Result<SyncScheduleSnapshot, CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let state = persistence::read_schedule_state(&database_path(sidecar_root)?)?;
        Ok(SyncScheduleSnapshot {
            last_successful_pull_at: state
                .as_ref()
                .and_then(|state| state.last_successful_pull_at),
            next_retry_at: state.as_ref().and_then(|state| state.next_retry_at),
            transient_failure_count: state
                .as_ref()
                .map_or(0, |state| state.transient_failure_count),
            suspended_reason: state.and_then(|state| state.suspended_reason),
        })
    }

    pub async fn record_retry(
        sidecar_root: &Path,
        next_retry_at: i64,
        failure_count: u32,
    ) -> Result<(), CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let path = database_path(sidecar_root)?;
        let last_successful_pull_at = persistence::read_schedule_state(&path)?
            .and_then(|state| state.last_successful_pull_at);
        Ok(persistence::write_schedule_state(
            &path,
            &SyncScheduleState {
                last_successful_pull_at,
                next_retry_at: Some(next_retry_at),
                transient_failure_count: failure_count,
                suspended_reason: None,
            },
        )?)
    }

    pub async fn record_suspension(sidecar_root: &Path, reason: &str) -> Result<(), CoreError> {
        database::open_db(&sidecar_root.to_string_lossy()).await?;
        let path = database_path(sidecar_root)?;
        let last_successful_pull_at = persistence::read_schedule_state(&path)?
            .and_then(|state| state.last_successful_pull_at);
        Ok(persistence::write_schedule_state(
            &path,
            &SyncScheduleState {
                last_successful_pull_at,
                next_retry_at: None,
                transient_failure_count: 0,
                suspended_reason: Some(reason.to_owned()),
            },
        )?)
    }

    pub fn classify_failure(kind: SyncFailureKind) -> SyncFailureDisposition {
        match kind {
            SyncFailureKind::Connectivity => SyncFailureDisposition::Retry,
            SyncFailureKind::Configuration
            | SyncFailureKind::Credential
            | SyncFailureKind::DataIntegrity
            | SyncFailureKind::Unexpected => SyncFailureDisposition::Suspend,
        }
    }
}

fn scope_has_calibre(scope: LibrarySyncScope) -> bool {
    matches!(scope, LibrarySyncScope::All | LibrarySyncScope::Calibre)
}

fn scope_has_myreader(scope: LibrarySyncScope) -> bool {
    matches!(scope, LibrarySyncScope::All | LibrarySyncScope::Myreader)
}

fn failure_kind(error: &CoreError) -> Option<SyncFailureKind> {
    Some(match error {
        CoreError::Storage(_) => SyncFailureKind::Connectivity,
        CoreError::Config(_) | CoreError::NotFound(_) => SyncFailureKind::Configuration,
        CoreError::DataIntegrity(_) => SyncFailureKind::DataIntegrity,
        CoreError::Io(_)
        | CoreError::Database(_)
        | CoreError::Serialize(_)
        | CoreError::Sync(_) => SyncFailureKind::Unexpected,
    })
}

async fn sync_calibre(
    config_path: &Path,
    mut library: Library,
    sidecar_root: &Path,
    library_root: &Path,
    force: bool,
    operator: &Operator,
) -> Result<CalibreSyncReport, CoreError> {
    let metadata = match operator.stat("metadata.db").await {
        Ok(metadata) => Some(metadata),
        Err(error) if error.kind() == opendal::ErrorKind::NotFound => None,
        Err(error) => return Err(CoreError::Storage(error.to_string())),
    };
    let version = metadata.as_ref().map(metadata_version);
    if version.is_none() && !force {
        return Ok(CalibreSyncReport {
            skipped: true,
            skip_reason: Some("unchanged".into()),
            changed: false,
            library,
            error: None,
        });
    }
    if !force && version.is_some() && library.metadata_etag == version {
        return Ok(CalibreSyncReport {
            skipped: true,
            skip_reason: Some("unchanged".into()),
            changed: false,
            library,
            error: None,
        });
    }

    let old_books = if library_root.join("metadata.db").is_file() {
        super::catalog::CatalogService::list_book_summaries(library_root).await?
    } else {
        Vec::new()
    };
    if is_remote_library(&library) {
        super::library::download_and_validate_metadata(
            operator,
            "",
            &library_root.join("metadata.db"),
        )
        .await?;
    }
    let new_books = super::catalog::CatalogService::list_book_summaries(library_root).await?;
    if is_remote_library(&library) {
        evict_stale_book_files(sidecar_root, library_root, &old_books, &new_books).await;
    }
    let book_count = super::catalog::CatalogService::count_books(library_root).await?;
    library.book_count = u64::try_from(book_count).unwrap_or(u64::MAX);
    library.metadata_etag = version;
    super::config::ConfigService::replace_library(config_path, library.clone())?;

    Ok(CalibreSyncReport {
        skipped: false,
        skip_reason: None,
        changed: true,
        library,
        error: None,
    })
}

fn metadata_version(metadata: &opendal::Metadata) -> String {
    metadata.etag().map(ToOwned::to_owned).unwrap_or_else(|| {
        format!(
            "{:?}-{}",
            metadata.last_modified(),
            metadata.content_length()
        )
    })
}

fn is_remote_library(library: &Library) -> bool {
    matches!(
        library.source_type.as_deref(),
        Some("webdav") | Some("onedrive")
    )
}

async fn evict_stale_book_files(
    sidecar_root: &Path,
    library_root: &Path,
    old_books: &[BookSummary],
    new_books: &[BookSummary],
) {
    let new_by_id = new_books
        .iter()
        .map(|book| (book.id, book))
        .collect::<HashMap<_, _>>();
    for old_book in old_books {
        match new_by_id.get(&old_book.id) {
            None => {
                evict_cached_file(
                    sidecar_root,
                    library_root,
                    &Path::new(&old_book.path)
                        .join("cover.jpg")
                        .to_string_lossy(),
                )
                .await;
                for path in &old_book.format_paths {
                    evict_cached_file(sidecar_root, library_root, path).await;
                }
            }
            Some(new_book) if old_book.path != new_book.path => {
                evict_cached_file(
                    sidecar_root,
                    library_root,
                    &Path::new(&old_book.path)
                        .join("cover.jpg")
                        .to_string_lossy(),
                )
                .await;
            }
            Some(_) => {}
        }
    }
}

async fn evict_cached_file(sidecar_root: &Path, library_root: &Path, relative_path: &str) {
    let Ok(relative_path) = crate::infrastructure::storage::normalize_remote_path(relative_path)
    else {
        return;
    };
    if relative_path.is_empty() {
        return;
    }
    match tokio::fs::remove_file(library_root.join(&relative_path)).await {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return,
    }
    let _ =
        super::content::ContentService::mark_file_remote_only(sidecar_root, &relative_path).await;
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use crate::models::{
        AppConfig, Library, LibraryStorageConfig, LibrarySyncOptions, LibrarySyncScope,
    };
    use crate::sync::exchange::{SyncProgress, SyncReport};

    use super::*;

    const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";

    fn seed_calibre_database(root: &Path, book_ids: &[i64]) {
        std::fs::create_dir_all(root).unwrap();
        let connection = rusqlite::Connection::open(root.join("metadata.db")).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE books (
                    id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    sort TEXT NOT NULL,
                    timestamp TEXT,
                    pubdate TEXT,
                    series_index REAL NOT NULL DEFAULT 1,
                    author_sort TEXT,
                    isbn TEXT,
                    lccn TEXT,
                    path TEXT,
                    flags INTEGER NOT NULL DEFAULT 1,
                    uuid TEXT,
                    has_cover INTEGER,
                    last_modified TEXT NOT NULL
                );
                CREATE TABLE data (
                    id INTEGER PRIMARY KEY,
                    book INTEGER NOT NULL,
                    format TEXT NOT NULL,
                    uncompressed_size INTEGER NOT NULL,
                    name TEXT NOT NULL
                );
                CREATE TABLE library_id (
                    id INTEGER PRIMARY KEY,
                    uuid TEXT NOT NULL UNIQUE
                );",
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO library_id (id, uuid) VALUES (1, ?1)",
                [LIBRARY_UUID],
            )
            .unwrap();
        for (index, book_id) in book_ids.iter().copied().enumerate() {
            connection
                .execute(
                    "INSERT INTO books (
                        id, title, sort, path, has_cover, last_modified
                    ) VALUES (?1, ?2, ?2, ?3, 0, '2026-01-01')",
                    rusqlite::params![
                        book_id,
                        format!("Book {book_id}"),
                        format!("Author/Book {book_id}")
                    ],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO data (
                        id, book, format, uncompressed_size, name
                    ) VALUES (?1, ?2, 'EPUB', 100, ?3)",
                    rusqlite::params![index as i64 + 1, book_id, format!("Book {book_id}")],
                )
                .unwrap();
        }
    }

    fn count_calibre_books(root: &Path) -> usize {
        let connection = rusqlite::Connection::open(root.join("metadata.db")).unwrap();
        connection
            .query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))
            .unwrap()
    }

    fn seed_config(path: &Path) {
        let mut config = AppConfig::empty();
        config.libraries.push(Library {
            id: "library-1".into(),
            name: "Library".into(),
            path: "remote://library".into(),
            book_count: 1,
            metadata_uri: Some("file:///cache/metadata.db".into()),
            added_at: None,
            data_source_id: Some("source-1".into()),
            source_type: Some("webdav".into()),
            source_path: Some("/Library".into()),
            metadata_etag: None,
            security_scoped_bookmark: None,
        });
        crate::services::config::ConfigService::load_or_initialize(path, Some(config)).unwrap();
    }

    fn all_sync_options() -> LibrarySyncOptions {
        LibrarySyncOptions {
            scope: LibrarySyncScope::All,
            force_calibre: false,
            sidecar_mode: SidecarSyncMode::Full,
        }
    }

    struct OrderObserver {
        library_root: std::path::PathBuf,
        count_at_sidecar_completion: Mutex<Option<usize>>,
    }

    impl SyncObserver for OrderObserver {
        fn is_cancelled(&self) -> bool {
            false
        }

        fn on_progress(&self, _progress: SyncProgress) {}

        fn on_sidecar_complete(&self, _report: &SyncReport) {
            *self.count_at_sidecar_completion.lock().unwrap() =
                Some(count_calibre_books(&self.library_root));
        }
    }

    #[tokio::test]
    async fn should_sync_sidecar_before_calibre_when_scope_is_all() {
        let app = tempfile::tempdir().unwrap();
        let sidecar = tempfile::tempdir().unwrap();
        let local_library = tempfile::tempdir().unwrap();
        let remote_library = tempfile::tempdir().unwrap();
        seed_calibre_database(local_library.path(), &[1]);
        seed_calibre_database(remote_library.path(), &[1, 2]);
        let config_path = app.path().join("config.json");
        seed_config(&config_path);
        let observer = OrderObserver {
            library_root: local_library.path().to_owned(),
            count_at_sidecar_completion: Mutex::new(None),
        };

        let report = SyncService::sync_library_observed(
            &config_path,
            sidecar.path(),
            local_library.path(),
            "library-1",
            1_000,
            all_sync_options(),
            &LibraryStorageConfig::LocalDirect {
                root: remote_library.path().to_string_lossy().into_owned(),
            },
            &observer,
        )
        .await
        .unwrap();

        assert_eq!(
            *observer.count_at_sidecar_completion.lock().unwrap(),
            Some(1)
        );
        assert_eq!(count_calibre_books(local_library.path()), 2);
        assert!(report.calibre.changed);
        assert_eq!(report.myreader.error, None);
    }

    #[tokio::test]
    async fn should_continue_calibre_when_sidecar_data_is_damaged() {
        let app = tempfile::tempdir().unwrap();
        let sidecar = tempfile::tempdir().unwrap();
        let local_library = tempfile::tempdir().unwrap();
        let remote_library = tempfile::tempdir().unwrap();
        seed_calibre_database(local_library.path(), &[1]);
        seed_calibre_database(remote_library.path(), &[1, 2]);
        let invalid_object = remote_library
            .path()
            .join(".myreader")
            .join("automerge")
            .join(LIBRARY_UUID)
            .join("incremental")
            .join("not-a-content-hash");
        std::fs::create_dir_all(invalid_object.parent().unwrap()).unwrap();
        std::fs::write(invalid_object, b"damaged").unwrap();
        let config_path = app.path().join("config.json");
        seed_config(&config_path);

        let report = SyncService::sync_library(
            &config_path,
            sidecar.path(),
            local_library.path(),
            "library-1",
            1_000,
            all_sync_options(),
            &LibraryStorageConfig::LocalDirect {
                root: remote_library.path().to_string_lossy().into_owned(),
            },
        )
        .await
        .unwrap();

        assert_eq!(count_calibre_books(local_library.path()), 2);
        assert!(report.calibre.changed);
        assert!(report.myreader.error.is_some());
        assert_eq!(
            report.myreader.failure_kind,
            Some(SyncFailureKind::DataIntegrity)
        );
        assert_eq!(report.failure_kind, Some(SyncFailureKind::DataIntegrity));
    }

    #[tokio::test]
    async fn should_evict_removed_book_files_when_remote_calibre_changes() {
        let app = tempfile::tempdir().unwrap();
        let sidecar = tempfile::tempdir().unwrap();
        let local_library = tempfile::tempdir().unwrap();
        let remote_library = tempfile::tempdir().unwrap();
        seed_calibre_database(local_library.path(), &[1]);
        seed_calibre_database(remote_library.path(), &[2]);
        let removed_book_root = local_library.path().join("Author/Book 1");
        std::fs::create_dir_all(&removed_book_root).unwrap();
        let cover = removed_book_root.join("cover.jpg");
        let format = removed_book_root.join("Book 1.epub");
        std::fs::write(&cover, b"cover").unwrap();
        std::fs::write(&format, b"book").unwrap();
        let config_path = app.path().join("config.json");
        seed_config(&config_path);

        SyncService::sync_library(
            &config_path,
            sidecar.path(),
            local_library.path(),
            "library-1",
            1_000,
            all_sync_options(),
            &LibraryStorageConfig::LocalDirect {
                root: remote_library.path().to_string_lossy().into_owned(),
            },
        )
        .await
        .unwrap();

        assert!(!cover.exists());
        assert!(!format.exists());
        let state = crate::services::content::ContentService::get_file_state(
            sidecar.path(),
            "Author/Book 1/Book 1.epub",
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(state.local_state, "remote_only");
    }

    fn begin_execution(coordinator: &SyncCoordinator) -> crate::sync::scheduler::SyncExecution {
        let scheduled = coordinator.request(
            "library-1",
            SidecarSyncMode::Full,
            "app_foregrounded",
            crate::sync::scheduler::SyncTiming::Immediate,
            1_000,
        );
        coordinator
            .begin("library-1", scheduled.schedules[0].generation)
            .execution
            .expect("execution should begin")
    }

    #[tokio::test]
    async fn should_pull_when_no_successful_pull_exists() {
        let directory = tempfile::tempdir().unwrap();

        let mode =
            SyncService::effective_mode(directory.path(), SidecarSyncMode::Full, 1_000, 30_000)
                .await
                .unwrap();

        assert_eq!(mode, Some(SidecarSyncMode::Full));
    }

    #[tokio::test]
    async fn should_skip_when_pull_is_fresh_and_no_work_is_pending() {
        let directory = tempfile::tempdir().unwrap();
        database::open_db(directory.path().to_str().unwrap())
            .await
            .unwrap();
        let path = database_path(directory.path()).unwrap();
        persistence::mark_schedule_succeeded(&path, Some(1_000)).unwrap();

        let mode =
            SyncService::effective_mode(directory.path(), SidecarSyncMode::Full, 2_000, 30_000)
                .await
                .unwrap();

        assert_eq!(mode, None);
    }

    #[test]
    fn should_retry_when_failure_can_recover_automatically() {
        assert_eq!(
            SyncService::classify_failure(SyncFailureKind::Connectivity),
            SyncFailureDisposition::Retry
        );
        assert_eq!(
            SyncService::classify_failure(SyncFailureKind::Credential),
            SyncFailureDisposition::Suspend
        );
        assert_eq!(
            SyncService::classify_failure(SyncFailureKind::Unexpected),
            SyncFailureDisposition::Suspend
        );
    }

    #[test]
    fn should_classify_core_errors_when_a_sync_phase_fails() {
        assert_eq!(
            failure_kind(&CoreError::Storage("network unavailable".into())),
            Some(SyncFailureKind::Connectivity)
        );
        assert_eq!(
            failure_kind(&CoreError::Config("invalid endpoint".into())),
            Some(SyncFailureKind::Configuration)
        );
        assert_eq!(
            failure_kind(&CoreError::DataIntegrity("missing change".into())),
            Some(SyncFailureKind::DataIntegrity)
        );
    }

    #[tokio::test]
    async fn should_persist_retry_when_connectivity_failure_occurs() {
        let directory = tempfile::tempdir().unwrap();
        let coordinator = SyncCoordinator::default();
        let execution = begin_execution(&coordinator);

        let transition = coordinator
            .fail(
                directory.path(),
                execution,
                SyncFailureKind::Connectivity,
                "network unavailable",
                2_000,
                0.5,
            )
            .await
            .unwrap();
        let snapshot = SyncService::schedule_snapshot(directory.path())
            .await
            .unwrap();

        assert_eq!(transition.retry.unwrap().next_retry_at, 3_000);
        assert_eq!(snapshot.next_retry_at, Some(3_000));
        assert_eq!(snapshot.transient_failure_count, 1);
        assert_eq!(snapshot.suspended_reason, None);
    }

    #[tokio::test]
    async fn should_persist_suspension_when_configuration_failure_occurs() {
        let directory = tempfile::tempdir().unwrap();
        let coordinator = SyncCoordinator::default();
        let execution = begin_execution(&coordinator);

        let transition = coordinator
            .fail(
                directory.path(),
                execution,
                SyncFailureKind::Configuration,
                "missing WebDAV URL",
                2_000,
                0.5,
            )
            .await
            .unwrap();
        let snapshot = SyncService::schedule_snapshot(directory.path())
            .await
            .unwrap();

        assert!(transition.retry.is_none());
        assert_eq!(
            snapshot.suspended_reason.as_deref(),
            Some("missing WebDAV URL")
        );
    }

    #[tokio::test]
    async fn should_skip_contextual_pull_when_recent_pull_is_fresh() {
        let directory = tempfile::tempdir().unwrap();
        database::open_db(directory.path().to_str().unwrap())
            .await
            .unwrap();
        let path = database_path(directory.path()).unwrap();
        persistence::mark_schedule_succeeded(&path, Some(1_000)).unwrap();
        let coordinator = SyncCoordinator::default();

        let transition = coordinator
            .request_contextual_pull(
                directory.path(),
                "library-1",
                "app_foregrounded",
                2_000,
                30_000,
            )
            .await
            .unwrap();

        assert!(transition.schedules.is_empty());
    }

    #[tokio::test]
    async fn should_wake_retry_when_library_reconnects() {
        let directory = tempfile::tempdir().unwrap();
        let coordinator = SyncCoordinator::default();
        let execution = begin_execution(&coordinator);
        coordinator
            .fail(
                directory.path(),
                execution,
                SyncFailureKind::Connectivity,
                "network unavailable",
                2_000,
                1.0,
            )
            .await
            .unwrap();
        coordinator.set_library_online("library-1", false, 2_100);

        let transition = coordinator.set_library_online("library-1", true, 2_200);

        assert_eq!(transition.schedules[0].deadline, 2_200);
    }
}
