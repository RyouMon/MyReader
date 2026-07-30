use std::collections::BTreeSet;

use my_reader_core::models;

use crate::CoreFfiError;

const JS_SAFE_INTEGER_MAX: f64 = 9_007_199_254_740_991.0;

#[derive(Debug, Clone)]
pub struct ReaderLocatorJson(pub String);

uniffi::custom_newtype!(ReaderLocatorJson, String);

#[derive(Debug, Clone)]
pub struct DownloadTaskStatus(pub String);

uniffi::custom_newtype!(DownloadTaskStatus, String);

#[derive(Debug, Clone)]
pub struct FileLocalState(pub String);

uniffi::custom_newtype!(FileLocalState, String);

#[derive(Debug, Clone)]
pub struct SidecarSyncMode(pub String);

uniffi::custom_newtype!(SidecarSyncMode, String);

#[derive(Debug, Clone)]
pub struct LibrarySyncScope(pub String);

uniffi::custom_newtype!(LibrarySyncScope, String);

#[derive(Debug, Clone)]
pub struct SyncTiming(pub String);

uniffi::custom_newtype!(SyncTiming, String);

#[derive(Debug, Clone)]
pub struct SyncFailureKind(pub String);

uniffi::custom_newtype!(SyncFailureKind, String);

#[derive(Debug, Clone, uniffi::Record)]
pub struct PaginatedBooks {
    pub items: Vec<BookEntry>,
    pub total: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct BookEntry {
    pub id: f64,
    pub title: String,
    pub title_sort: String,
    pub author_sort: String,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub formats: Vec<String>,
    pub readable_formats: Vec<String>,
    pub preferred_format: Option<String>,
    pub has_cover: bool,
    pub path: String,
    pub timestamp: Option<String>,
    pub pubdate: Option<String>,
    pub last_modified: Option<String>,
    pub comment: Option<String>,
    pub publisher: Option<String>,
    pub languages: Vec<String>,
    pub rating: Option<i32>,
    pub uuid: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct BookDetail {
    pub id: f64,
    pub title: String,
    pub title_sort: String,
    pub author_sort: String,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub formats: Vec<String>,
    pub readable_formats: Vec<String>,
    pub preferred_format: Option<String>,
    pub has_cover: bool,
    pub path: String,
    pub timestamp: Option<String>,
    pub pubdate: Option<String>,
    pub last_modified: Option<String>,
    pub comment: Option<String>,
    pub publisher: Option<String>,
    pub languages: Vec<String>,
    pub rating: Option<i32>,
    pub uuid: Option<String>,
    pub format_sizes: Vec<FormatSize>,
    pub identifiers: Vec<BookIdentifier>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct FormatSize {
    pub format: String,
    pub size_bytes: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct BookIdentifier {
    pub id_type: String,
    pub value: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct BookSummary {
    pub id: f64,
    pub path: String,
    pub has_cover: bool,
    pub formats: Vec<String>,
    pub readable_formats: Vec<String>,
    pub preferred_format: Option<String>,
    pub format_paths: Vec<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct BookFormat {
    pub format: String,
    pub name: String,
    pub size_bytes: f64,
    pub relative_path: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ReadingFormat {
    pub book_id: String,
    pub format: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct FileState {
    pub id: String,
    pub path: String,
    pub local_state: FileLocalState,
    pub is_locally_available: bool,
    pub local_blake3: Option<String>,
    pub local_size: Option<f64>,
    pub local_mtime: Option<f64>,
    pub updated_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct FileStateUpdate {
    pub local_state: FileLocalState,
    pub local_blake3: Option<String>,
    pub local_size: Option<f64>,
    pub local_mtime: Option<f64>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct DownloadedFile {
    pub size: f64,
    pub mtime_ms: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct BookCoverThumbnailCache {
    pub id: String,
    pub book_id: f64,
    pub cover_identity: String,
    pub thumbnail_version: String,
    pub width_px: f64,
    pub height_px: f64,
    pub file_name: String,
    pub file_size_bytes: f64,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct BookCoverThumbnailCachePatch {
    pub book_id: f64,
    pub cover_identity: String,
    pub thumbnail_version: String,
    pub width_px: f64,
    pub height_px: f64,
    pub file_name: String,
    pub file_size_bytes: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct DownloadTask {
    pub id: String,
    pub library_id: String,
    pub book_id: Option<String>,
    pub format: Option<String>,
    pub relative_path: String,
    pub label: String,
    pub status: DownloadTaskStatus,
    pub progress: f64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct EnqueuedDownloadTask {
    pub task: DownloadTask,
    pub inserted: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ReadingPosition {
    pub book_id: f64,
    pub format: String,
    pub locator: ReaderLocatorJson,
    pub display_progression: Option<f64>,
    pub updated_at: f64,
    pub conflict_count: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ReadingPositionCandidate {
    pub operation_id: String,
    pub locator: ReaderLocatorJson,
    pub display_progression: Option<f64>,
    pub recorded_at: f64,
    pub replica_id: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ReaderBookmark {
    pub id: String,
    pub book_id: f64,
    pub format: String,
    pub locator_key: String,
    pub locator: ReaderLocatorJson,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ReaderAnnotation {
    pub id: String,
    pub book_id: f64,
    pub format: String,
    pub kind: String,
    pub locator: ReaderLocatorJson,
    pub color: String,
    pub note: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ReadingDay {
    pub day: String,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ReadingStatistics {
    pub days: Vec<ReadingDay>,
    pub total_duration_seconds: f64,
    pub longest_streak_days: u32,
    pub completed_books: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct AppConfig {
    pub schema_version: u32,
    pub device_id: Option<String>,
    pub preferences: AppPreferences,
    pub data_sources: Vec<DataSource>,
    pub libraries: Vec<Library>,
    pub active_library_id: Option<String>,
    pub mobile_json: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct AppPreferences {
    pub theme: String,
    pub language: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct DataSource {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub root_path: Option<String>,
    pub readonly: Option<bool>,
    pub created_at: Option<f64>,
    pub endpoint: Option<String>,
    pub username: Option<String>,
    pub has_password: Option<bool>,
    pub credential_reference: Option<String>,
    pub client_id: Option<String>,
    pub tenant_id: Option<String>,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub has_refresh_token: Option<bool>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct Library {
    pub id: String,
    pub name: String,
    pub path: String,
    pub book_count: f64,
    pub metadata_uri: Option<String>,
    pub added_at: Option<f64>,
    pub data_source_id: Option<String>,
    pub source_type: Option<String>,
    pub source_path: Option<String>,
    pub metadata_etag: Option<String>,
    pub security_scoped_bookmark: Option<SecurityScopedBookmark>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SecurityScopedBookmark {
    pub bookmark_base64: String,
    pub resolved_uri: String,
    pub stale: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct LibraryResult {
    pub config: AppConfig,
    pub library: Library,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct LocalLibraryRequest {
    pub library_root_path: String,
    pub path: String,
    pub sidecar_container_parent_path: Option<String>,
    pub name: Option<String>,
    pub metadata_uri: Option<String>,
    pub added_at: Option<f64>,
    pub security_scoped_bookmark: Option<SecurityScopedBookmark>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct RemoteLibraryRequest {
    pub data_source_id: String,
    pub source_path: String,
    pub libraries_root_path: String,
    pub libraries_root_uri: Option<String>,
    pub name: Option<String>,
    pub added_at: Option<f64>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct RemoteCredential {
    pub kind: String,
    pub password: Option<String>,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct RemoteDirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct LibraryStorageConfig {
    pub kind: String,
    pub root: Option<String>,
    pub endpoint: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SidecarSyncReport {
    pub pushed: f64,
    pub pulled: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct MyReaderSyncReport {
    pub skipped: bool,
    pub skip_reason: Option<String>,
    pub mode: SidecarSyncMode,
    pub pushed: f64,
    pub pulled: f64,
    pub error: Option<String>,
    pub failure_kind: Option<SyncFailureKind>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CalibreSyncReport {
    pub skipped: bool,
    pub skip_reason: Option<String>,
    pub changed: bool,
    pub library: Library,
    pub error: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct LibrarySyncReport {
    pub library_id: String,
    pub library_name: String,
    pub calibre: CalibreSyncReport,
    pub myreader: MyReaderSyncReport,
    pub duration_ms: f64,
    pub error: Option<String>,
    pub failure_kind: Option<SyncFailureKind>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncExecution {
    pub library_id: String,
    pub mode: SidecarSyncMode,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ScheduledSync {
    pub library_id: String,
    pub generation: f64,
    pub deadline: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct RetrySchedule {
    pub retry_count: u32,
    pub next_retry_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SchedulerTransition {
    pub schedules: Vec<ScheduledSync>,
    pub cancel_timers_for: Vec<String>,
    pub execution: Option<SyncExecution>,
    pub retry: Option<RetrySchedule>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncTaskProgress {
    pub task_id: String,
    pub stage: String,
    pub completed: u32,
    pub total: u32,
}

impl From<models::PaginatedBooks> for PaginatedBooks {
    fn from(value: models::PaginatedBooks) -> Self {
        Self {
            items: value.items.into_iter().map(Into::into).collect(),
            total: value.total as f64,
        }
    }
}

impl From<models::BookEntry> for BookEntry {
    fn from(value: models::BookEntry) -> Self {
        let policy = models::ReadingFormatPolicy::from_formats(&value.formats);
        Self {
            id: value.id as f64,
            title: value.title,
            title_sort: value.title_sort,
            author_sort: value.author_sort,
            authors: value.authors,
            tags: value.tags,
            series: value.series,
            series_index: value.series_index,
            formats: value.formats,
            readable_formats: policy.readable_formats,
            preferred_format: policy.preferred_format,
            has_cover: value.has_cover,
            path: value.path,
            timestamp: value.timestamp,
            pubdate: value.pubdate,
            last_modified: value.last_modified,
            comment: value.comment,
            publisher: value.publisher,
            languages: value.languages,
            rating: value.rating,
            uuid: value.uuid,
        }
    }
}

impl From<models::BookDetail> for BookDetail {
    fn from(value: models::BookDetail) -> Self {
        let book = value.book;
        let policy = models::ReadingFormatPolicy::from_formats(&book.formats);
        Self {
            id: book.id as f64,
            title: book.title,
            title_sort: book.title_sort,
            author_sort: book.author_sort,
            authors: book.authors,
            tags: book.tags,
            series: book.series,
            series_index: book.series_index,
            formats: book.formats,
            readable_formats: policy.readable_formats,
            preferred_format: policy.preferred_format,
            has_cover: book.has_cover,
            path: book.path,
            timestamp: book.timestamp,
            pubdate: book.pubdate,
            last_modified: book.last_modified,
            comment: book.comment,
            publisher: book.publisher,
            languages: book.languages,
            rating: book.rating,
            uuid: book.uuid,
            format_sizes: value.format_sizes.into_iter().map(Into::into).collect(),
            identifiers: value.identifiers.into_iter().map(Into::into).collect(),
        }
    }
}

impl From<models::FormatSize> for FormatSize {
    fn from(value: models::FormatSize) -> Self {
        Self {
            format: value.format,
            size_bytes: value.size_bytes as f64,
        }
    }
}

impl From<models::BookIdentifier> for BookIdentifier {
    fn from(value: models::BookIdentifier) -> Self {
        Self {
            id_type: value.id_type,
            value: value.value,
        }
    }
}

impl From<models::BookSummary> for BookSummary {
    fn from(value: models::BookSummary) -> Self {
        let policy = models::ReadingFormatPolicy::from_formats(&value.formats);
        Self {
            id: value.id as f64,
            path: value.path,
            has_cover: value.has_cover,
            formats: value.formats,
            readable_formats: policy.readable_formats,
            preferred_format: policy.preferred_format,
            format_paths: value.format_paths,
        }
    }
}

impl From<models::BookFormat> for BookFormat {
    fn from(value: models::BookFormat) -> Self {
        Self {
            format: value.format,
            name: value.name,
            size_bytes: value.size_bytes as f64,
            relative_path: value.relative_path,
        }
    }
}

impl From<models::FileState> for FileState {
    fn from(value: models::FileState) -> Self {
        let is_locally_available = value.is_locally_available();
        Self {
            id: value.id,
            path: value.path,
            local_state: FileLocalState(value.local_state),
            is_locally_available,
            local_blake3: value.local_blake3,
            local_size: value.local_size.map(|value| value as f64),
            local_mtime: value.local_mtime.map(|value| value as f64),
            updated_at: value.updated_at,
        }
    }
}

impl TryFrom<FileStateUpdate> for models::FileStateUpdate {
    type Error = CoreFfiError;

    fn try_from(value: FileStateUpdate) -> Result<Self, Self::Error> {
        Ok(Self {
            local_state: value.local_state.0,
            local_blake3: value.local_blake3,
            local_size: optional_i64(value.local_size, "localSize")?,
            local_mtime: optional_i64(value.local_mtime, "localMtime")?,
        })
    }
}

impl From<models::DownloadedFile> for DownloadedFile {
    fn from(value: models::DownloadedFile) -> Self {
        Self {
            size: value.size as f64,
            mtime_ms: value.mtime_ms as f64,
        }
    }
}

impl From<models::BookCoverThumbnailCache> for BookCoverThumbnailCache {
    fn from(value: models::BookCoverThumbnailCache) -> Self {
        Self {
            id: value.id,
            book_id: value.book_id as f64,
            cover_identity: value.cover_identity,
            thumbnail_version: value.thumbnail_version,
            width_px: value.width_px as f64,
            height_px: value.height_px as f64,
            file_name: value.file_name,
            file_size_bytes: value.file_size_bytes as f64,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl TryFrom<BookCoverThumbnailCachePatch> for models::BookCoverThumbnailCachePatch {
    type Error = CoreFfiError;

    fn try_from(value: BookCoverThumbnailCachePatch) -> Result<Self, Self::Error> {
        Ok(Self {
            book_id: required_i64(value.book_id, "bookId")?,
            cover_identity: value.cover_identity,
            thumbnail_version: value.thumbnail_version,
            width_px: required_i64(value.width_px, "widthPx")?,
            height_px: required_i64(value.height_px, "heightPx")?,
            file_name: value.file_name,
            file_size_bytes: required_i64(value.file_size_bytes, "fileSizeBytes")?,
        })
    }
}

impl From<models::DownloadTask> for DownloadTask {
    fn from(value: models::DownloadTask) -> Self {
        Self {
            id: value.id,
            library_id: value.library_id,
            book_id: value.book_id,
            format: value.format,
            relative_path: value.relative_path,
            label: value.label,
            status: DownloadTaskStatus(value.status.as_str().to_owned()),
            progress: value.progress,
            error: value.error,
        }
    }
}

impl From<models::EnqueuedDownloadTask> for EnqueuedDownloadTask {
    fn from(value: models::EnqueuedDownloadTask) -> Self {
        Self {
            task: value.task.into(),
            inserted: value.inserted,
        }
    }
}

impl From<models::ReadingPosition> for ReadingPosition {
    fn from(value: models::ReadingPosition) -> Self {
        Self {
            book_id: value.book_id as f64,
            format: value.format,
            locator: ReaderLocatorJson(value.locator.to_string()),
            display_progression: value.display_progression,
            updated_at: value.updated_at,
            conflict_count: value.conflict_count as f64,
        }
    }
}

impl From<models::ReadingPositionCandidate> for ReadingPositionCandidate {
    fn from(value: models::ReadingPositionCandidate) -> Self {
        Self {
            operation_id: value.operation_id,
            locator: ReaderLocatorJson(value.locator.to_string()),
            display_progression: value.display_progression,
            recorded_at: value.recorded_at as f64,
            replica_id: value.replica_id,
        }
    }
}

impl From<models::ReaderBookmark> for ReaderBookmark {
    fn from(value: models::ReaderBookmark) -> Self {
        Self {
            id: value.id,
            book_id: value.book_id as f64,
            format: value.format,
            locator_key: value.locator_key,
            locator: ReaderLocatorJson(value.locator.to_string()),
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl From<models::ReaderAnnotation> for ReaderAnnotation {
    fn from(value: models::ReaderAnnotation) -> Self {
        Self {
            id: value.id,
            book_id: value.book_id as f64,
            format: value.format,
            kind: value.kind,
            locator: ReaderLocatorJson(value.locator.to_string()),
            color: value.color,
            note: value.note,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

impl From<models::ReadingStatistics> for ReadingStatistics {
    fn from(value: models::ReadingStatistics) -> Self {
        Self {
            days: value
                .days
                .into_iter()
                .map(|(day, duration_seconds)| ReadingDay {
                    day,
                    duration_seconds: duration_seconds as f64,
                })
                .collect(),
            total_duration_seconds: value.total_duration_seconds as f64,
            longest_streak_days: value.longest_streak_days,
            completed_books: value.completed_books as f64,
        }
    }
}

impl From<models::AppConfig> for AppConfig {
    fn from(value: models::AppConfig) -> Self {
        Self {
            schema_version: value.schema_version,
            device_id: value.device_id,
            preferences: value.preferences.into(),
            data_sources: value.data_sources.into_iter().map(Into::into).collect(),
            libraries: value.libraries.into_iter().map(Into::into).collect(),
            active_library_id: value.active_library_id,
            mobile_json: value
                .mobile
                .map(|mobile| serde_json::to_string(&mobile).expect("JSON value is serializable")),
        }
    }
}

impl TryFrom<AppConfig> for models::AppConfig {
    type Error = CoreFfiError;

    fn try_from(value: AppConfig) -> Result<Self, Self::Error> {
        Ok(Self {
            schema_version: value.schema_version,
            device_id: value.device_id,
            preferences: value.preferences.into(),
            data_sources: value
                .data_sources
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            libraries: value
                .libraries
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            active_library_id: value.active_library_id,
            desktop: None,
            mobile: value
                .mobile_json
                .map(|mobile| {
                    serde_json::from_str(&mobile).map_err(|error| {
                        CoreFfiError::core(format!("INVALID_MOBILE_CONFIG: {error}"))
                    })
                })
                .transpose()?,
            extensions: Default::default(),
        })
    }
}

impl From<models::AppPreferences> for AppPreferences {
    fn from(value: models::AppPreferences) -> Self {
        Self {
            theme: value.theme,
            language: value.language,
        }
    }
}

impl From<AppPreferences> for models::AppPreferences {
    fn from(value: AppPreferences) -> Self {
        Self {
            theme: value.theme,
            language: value.language,
        }
    }
}

impl From<models::DataSource> for DataSource {
    fn from(value: models::DataSource) -> Self {
        match value {
            models::DataSource::Local {
                id,
                name,
                enabled,
                root_path,
                readonly,
                created_at,
            } => Self {
                kind: "local".to_owned(),
                id,
                name,
                enabled,
                root_path: Some(root_path),
                readonly,
                created_at,
                endpoint: None,
                username: None,
                has_password: None,
                credential_reference: None,
                client_id: None,
                tenant_id: None,
                display_name: None,
                email: None,
                has_refresh_token: None,
            },
            models::DataSource::Webdav {
                id,
                name,
                enabled,
                endpoint,
                username,
                root_path,
                has_password,
                credential_reference,
                readonly,
                created_at,
            } => Self {
                kind: "webdav".to_owned(),
                id,
                name,
                enabled,
                root_path,
                readonly,
                created_at,
                endpoint: Some(endpoint),
                username: Some(username),
                has_password: Some(has_password),
                credential_reference,
                client_id: None,
                tenant_id: None,
                display_name: None,
                email: None,
                has_refresh_token: None,
            },
            models::DataSource::Onedrive {
                id,
                name,
                enabled,
                client_id,
                tenant_id,
                display_name,
                email,
                root_path,
                has_refresh_token,
                credential_reference,
                readonly,
                created_at,
            } => Self {
                kind: "onedrive".to_owned(),
                id,
                name,
                enabled,
                root_path,
                readonly,
                created_at,
                endpoint: None,
                username: None,
                has_password: None,
                credential_reference,
                client_id: Some(client_id),
                tenant_id,
                display_name,
                email,
                has_refresh_token: Some(has_refresh_token),
            },
        }
    }
}

impl TryFrom<DataSource> for models::DataSource {
    type Error = CoreFfiError;

    fn try_from(value: DataSource) -> Result<Self, Self::Error> {
        match value.kind.as_str() {
            "local" => Ok(Self::Local {
                id: value.id,
                name: value.name,
                enabled: value.enabled,
                root_path: required_string(value.root_path, "rootPath")?,
                readonly: value.readonly,
                created_at: value.created_at,
            }),
            "webdav" => Ok(Self::Webdav {
                id: value.id,
                name: value.name,
                enabled: value.enabled,
                endpoint: required_string(value.endpoint, "endpoint")?,
                username: required_string(value.username, "username")?,
                root_path: value.root_path,
                has_password: value.has_password.unwrap_or(false),
                credential_reference: value.credential_reference,
                readonly: value.readonly,
                created_at: value.created_at,
            }),
            "onedrive" => Ok(Self::Onedrive {
                id: value.id,
                name: value.name,
                enabled: value.enabled,
                client_id: required_string(value.client_id, "clientId")?,
                tenant_id: value.tenant_id,
                display_name: value.display_name,
                email: value.email,
                root_path: value.root_path,
                has_refresh_token: value.has_refresh_token.unwrap_or(false),
                credential_reference: value.credential_reference,
                readonly: value.readonly,
                created_at: value.created_at,
            }),
            kind => Err(CoreFfiError::core(format!(
                "Unsupported data source type: {kind}"
            ))),
        }
    }
}

impl From<models::Library> for Library {
    fn from(value: models::Library) -> Self {
        Self {
            id: value.id,
            name: value.name,
            path: value.path,
            book_count: value.book_count as f64,
            metadata_uri: value.metadata_uri,
            added_at: value.added_at,
            data_source_id: value.data_source_id,
            source_type: value.source_type,
            source_path: value.source_path,
            metadata_etag: value.metadata_etag,
            security_scoped_bookmark: value.security_scoped_bookmark.map(Into::into),
        }
    }
}

impl TryFrom<Library> for models::Library {
    type Error = CoreFfiError;

    fn try_from(value: Library) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            name: value.name,
            path: value.path,
            book_count: required_u64(value.book_count, "bookCount")?,
            metadata_uri: value.metadata_uri,
            added_at: value.added_at,
            data_source_id: value.data_source_id,
            source_type: value.source_type,
            source_path: value.source_path,
            metadata_etag: value.metadata_etag,
            security_scoped_bookmark: value.security_scoped_bookmark.map(Into::into),
        })
    }
}

impl From<models::SecurityScopedBookmark> for SecurityScopedBookmark {
    fn from(value: models::SecurityScopedBookmark) -> Self {
        Self {
            bookmark_base64: value.bookmark_base64,
            resolved_uri: value.resolved_uri,
            stale: value.stale,
        }
    }
}

impl From<SecurityScopedBookmark> for models::SecurityScopedBookmark {
    fn from(value: SecurityScopedBookmark) -> Self {
        Self {
            bookmark_base64: value.bookmark_base64,
            resolved_uri: value.resolved_uri,
            stale: value.stale,
        }
    }
}

impl TryFrom<LocalLibraryRequest> for models::LocalLibraryRequest {
    type Error = CoreFfiError;

    fn try_from(value: LocalLibraryRequest) -> Result<Self, Self::Error> {
        Ok(Self {
            library_root_path: value.library_root_path,
            path: value.path,
            sidecar_container_parent_path: value.sidecar_container_parent_path,
            name: value.name,
            metadata_uri: value.metadata_uri,
            added_at: value.added_at,
            security_scoped_bookmark: value.security_scoped_bookmark.map(Into::into),
        })
    }
}

impl From<RemoteLibraryRequest> for models::RemoteLibraryRequest {
    fn from(value: RemoteLibraryRequest) -> Self {
        Self {
            data_source_id: value.data_source_id,
            source_path: value.source_path,
            libraries_root_path: value.libraries_root_path,
            libraries_root_uri: value.libraries_root_uri,
            name: value.name,
            added_at: value.added_at,
        }
    }
}

impl TryFrom<RemoteCredential> for models::RemoteCredential {
    type Error = CoreFfiError;

    fn try_from(value: RemoteCredential) -> Result<Self, Self::Error> {
        match value.kind.as_str() {
            "webdav" => Ok(Self::Webdav {
                password: required_string(value.password, "password")?,
            }),
            "onedrive" => Ok(Self::Onedrive {
                access_token: required_string(value.access_token, "accessToken")?,
            }),
            kind => Err(CoreFfiError::core(format!(
                "Unsupported credential type: {kind}"
            ))),
        }
    }
}

impl From<models::RemoteDirectoryEntry> for RemoteDirectoryEntry {
    fn from(value: models::RemoteDirectoryEntry) -> Self {
        Self {
            name: value.name,
            path: value.path,
            is_directory: value.is_directory,
        }
    }
}

impl TryFrom<LibraryStorageConfig> for models::LibraryStorageConfig {
    type Error = CoreFfiError;

    fn try_from(value: LibraryStorageConfig) -> Result<Self, Self::Error> {
        match value.kind.as_str() {
            "local-direct" => Ok(Self::LocalDirect {
                root: required_string(value.root, "root")?,
            }),
            "webdav" => Ok(Self::Webdav {
                endpoint: required_string(value.endpoint, "endpoint")?,
                username: required_string(value.username, "username")?,
                password: required_string(value.password, "password")?,
                root: value.root,
            }),
            "onedrive" => Ok(Self::Onedrive {
                access_token: required_string(value.access_token, "accessToken")?,
                root: value.root,
            }),
            kind => Err(CoreFfiError::sync(format!(
                "Unsupported sidecar storage type: {kind}"
            ))),
        }
    }
}

impl From<models::LibraryStorageConfig> for LibraryStorageConfig {
    fn from(value: models::LibraryStorageConfig) -> Self {
        match value {
            models::LibraryStorageConfig::LocalDirect { root } => Self {
                kind: "local-direct".into(),
                root: Some(root),
                endpoint: None,
                username: None,
                password: None,
                access_token: None,
            },
            models::LibraryStorageConfig::Webdav {
                endpoint,
                username,
                password,
                root,
            } => Self {
                kind: "webdav".into(),
                root,
                endpoint: Some(endpoint),
                username: Some(username),
                password: Some(password),
                access_token: None,
            },
            models::LibraryStorageConfig::Onedrive { access_token, root } => Self {
                kind: "onedrive".into(),
                root,
                endpoint: None,
                username: None,
                password: None,
                access_token: Some(access_token),
            },
        }
    }
}

impl From<models::SidecarSyncReport> for SidecarSyncReport {
    fn from(value: models::SidecarSyncReport) -> Self {
        Self {
            pushed: value.pushed as f64,
            pulled: value.pulled as f64,
        }
    }
}

impl TryFrom<LibrarySyncScope> for models::LibrarySyncScope {
    type Error = CoreFfiError;

    fn try_from(value: LibrarySyncScope) -> Result<Self, Self::Error> {
        match value.0.as_str() {
            "all" => Ok(Self::All),
            "calibre" => Ok(Self::Calibre),
            "myreader" => Ok(Self::Myreader),
            scope => Err(CoreFfiError::sync(format!(
                "Unsupported library sync scope: {scope}"
            ))),
        }
    }
}

impl From<models::SyncFailureKind> for SyncFailureKind {
    fn from(value: models::SyncFailureKind) -> Self {
        Self(
            match value {
                models::SyncFailureKind::Connectivity => "connectivity",
                models::SyncFailureKind::Configuration => "configuration",
                models::SyncFailureKind::Credential => "credential",
                models::SyncFailureKind::DataIntegrity => "data_integrity",
                models::SyncFailureKind::Unexpected => "unexpected",
            }
            .to_owned(),
        )
    }
}

impl From<models::MyReaderSyncReport> for MyReaderSyncReport {
    fn from(value: models::MyReaderSyncReport) -> Self {
        Self {
            skipped: value.skipped,
            skip_reason: value.skip_reason,
            mode: value.mode.into(),
            pushed: value.pushed as f64,
            pulled: value.pulled as f64,
            error: value.error,
            failure_kind: value.failure_kind.map(Into::into),
        }
    }
}

impl From<models::CalibreSyncReport> for CalibreSyncReport {
    fn from(value: models::CalibreSyncReport) -> Self {
        Self {
            skipped: value.skipped,
            skip_reason: value.skip_reason,
            changed: value.changed,
            library: value.library.into(),
            error: value.error,
        }
    }
}

impl From<models::LibrarySyncReport> for LibrarySyncReport {
    fn from(value: models::LibrarySyncReport) -> Self {
        Self {
            library_id: value.library_id,
            library_name: value.library_name,
            calibre: value.calibre.into(),
            myreader: value.myreader.into(),
            duration_ms: value.duration_ms as f64,
            error: value.error,
            failure_kind: value.failure_kind.map(Into::into),
        }
    }
}

impl From<models::SidecarSyncMode> for SidecarSyncMode {
    fn from(value: models::SidecarSyncMode) -> Self {
        Self(
            match value {
                models::SidecarSyncMode::PushOnly => "push_only",
                models::SidecarSyncMode::Full => "full",
            }
            .to_owned(),
        )
    }
}

impl TryFrom<SidecarSyncMode> for models::SidecarSyncMode {
    type Error = CoreFfiError;

    fn try_from(value: SidecarSyncMode) -> Result<Self, Self::Error> {
        match value.0.as_str() {
            "push_only" => Ok(Self::PushOnly),
            "full" => Ok(Self::Full),
            mode => Err(CoreFfiError::sync(format!(
                "Unsupported sidecar sync mode: {mode}"
            ))),
        }
    }
}

impl From<my_reader_core::api::sync::SyncMode> for SidecarSyncMode {
    fn from(value: my_reader_core::api::sync::SyncMode) -> Self {
        Self(
            match value {
                my_reader_core::api::sync::SyncMode::PushOnly => "push_only",
                my_reader_core::api::sync::SyncMode::Full => "full",
            }
            .to_owned(),
        )
    }
}

impl TryFrom<SidecarSyncMode> for my_reader_core::api::sync::SyncMode {
    type Error = CoreFfiError;

    fn try_from(value: SidecarSyncMode) -> Result<Self, Self::Error> {
        match value.0.as_str() {
            "push_only" => Ok(Self::PushOnly),
            "full" => Ok(Self::Full),
            mode => Err(CoreFfiError::sync(format!("Unsupported sync mode: {mode}"))),
        }
    }
}

impl TryFrom<SyncTiming> for my_reader_core::api::sync::SyncTiming {
    type Error = CoreFfiError;

    fn try_from(value: SyncTiming) -> Result<Self, Self::Error> {
        match value.0.as_str() {
            "debounced" => Ok(Self::Debounced),
            "immediate" => Ok(Self::Immediate),
            timing => Err(CoreFfiError::sync(format!(
                "Unsupported sync timing: {timing}"
            ))),
        }
    }
}

impl TryFrom<SyncFailureKind> for models::SyncFailureKind {
    type Error = CoreFfiError;

    fn try_from(value: SyncFailureKind) -> Result<Self, Self::Error> {
        match value.0.as_str() {
            "connectivity" => Ok(Self::Connectivity),
            "configuration" => Ok(Self::Configuration),
            "credential" => Ok(Self::Credential),
            "data_integrity" => Ok(Self::DataIntegrity),
            "unexpected" => Ok(Self::Unexpected),
            kind => Err(CoreFfiError::sync(format!(
                "Unsupported sync failure kind: {kind}"
            ))),
        }
    }
}

impl From<my_reader_core::api::sync::SyncExecution> for SyncExecution {
    fn from(value: my_reader_core::api::sync::SyncExecution) -> Self {
        Self {
            library_id: value.library_id,
            mode: value.mode.into(),
            reasons: value.reasons.into_iter().collect(),
        }
    }
}

impl TryFrom<SyncExecution> for my_reader_core::api::sync::SyncExecution {
    type Error = CoreFfiError;

    fn try_from(value: SyncExecution) -> Result<Self, Self::Error> {
        Ok(Self {
            library_id: value.library_id,
            mode: value.mode.try_into()?,
            reasons: value.reasons.into_iter().collect::<BTreeSet<_>>(),
        })
    }
}

impl From<my_reader_core::api::sync::SchedulerTransition> for SchedulerTransition {
    fn from(value: my_reader_core::api::sync::SchedulerTransition) -> Self {
        Self {
            schedules: value.schedules.into_iter().map(Into::into).collect(),
            cancel_timers_for: value.cancel_timers_for,
            execution: value.execution.map(Into::into),
            retry: value.retry.map(Into::into),
        }
    }
}

impl From<my_reader_core::api::sync::ScheduledSync> for ScheduledSync {
    fn from(value: my_reader_core::api::sync::ScheduledSync) -> Self {
        Self {
            library_id: value.library_id,
            generation: value.generation as f64,
            deadline: value.deadline as f64,
        }
    }
}

impl From<my_reader_core::api::sync::RetrySchedule> for RetrySchedule {
    fn from(value: my_reader_core::api::sync::RetrySchedule) -> Self {
        Self {
            retry_count: value.retry_count,
            next_retry_at: value.next_retry_at as f64,
        }
    }
}

pub fn required_i64(value: f64, field: &str) -> Result<i64, CoreFfiError> {
    if value.is_finite()
        && value.fract() == 0.0
        && value >= -JS_SAFE_INTEGER_MAX
        && value <= JS_SAFE_INTEGER_MAX
    {
        Ok(value as i64)
    } else {
        Err(CoreFfiError::core(format!(
            "{field} must be a safe integer number"
        )))
    }
}

pub fn required_u64(value: f64, field: &str) -> Result<u64, CoreFfiError> {
    if value.is_finite() && value.fract() == 0.0 && value >= 0.0 && value <= JS_SAFE_INTEGER_MAX {
        Ok(value as u64)
    } else {
        Err(CoreFfiError::core(format!(
            "{field} must be a non-negative safe integer number"
        )))
    }
}

pub fn required_usize(value: f64, field: &str) -> Result<usize, CoreFfiError> {
    let value = required_u64(value, field)?;
    usize::try_from(value)
        .map_err(|_| CoreFfiError::core(format!("{field} is outside the supported range")))
}

pub fn optional_i64(value: Option<f64>, field: &str) -> Result<Option<i64>, CoreFfiError> {
    value.map(|value| required_i64(value, field)).transpose()
}

pub fn required_string(value: Option<String>, field: &str) -> Result<String, CoreFfiError> {
    value.ok_or_else(|| CoreFfiError::core(format!("{field} is required")))
}

#[cfg(test)]
mod tests {
    use super::{required_i64, required_u64, JS_SAFE_INTEGER_MAX};
    use crate::CoreFfiError;

    #[test]
    fn should_accept_boundary_when_number_is_a_javascript_safe_integer() {
        assert_eq!(
            required_i64(JS_SAFE_INTEGER_MAX, "value").expect("safe integer"),
            9_007_199_254_740_991
        );
        assert_eq!(
            required_u64(JS_SAFE_INTEGER_MAX, "value").expect("safe integer"),
            9_007_199_254_740_991
        );
    }

    #[test]
    fn should_reject_fraction_when_number_is_not_an_integer() {
        let error = required_i64(1.5, "bookId").expect_err("fraction must fail");

        assert!(matches!(
            error,
            CoreFfiError::Core(message) if message == "bookId must be a safe integer number"
        ));
    }

    #[test]
    fn should_reject_value_when_number_exceeds_javascript_safe_integer_range() {
        let error =
            required_u64(JS_SAFE_INTEGER_MAX + 1.0, "nowMs").expect_err("unsafe integer must fail");

        assert!(matches!(
            error,
            CoreFfiError::Core(message)
                if message == "nowMs must be a non-negative safe integer number"
        ));
    }
}
