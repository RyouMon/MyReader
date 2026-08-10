mod app_config;
pub(crate) mod catalog;
mod content;
mod download;
mod library;
mod reading;
mod storage;
mod sync;

pub use app_config::{
    is_remote_library_source_type, AppConfig, AppPreferences, DataSource, Library, LibraryType,
    SecurityScopedBookmark, APP_CONFIG_SCHEMA_VERSION,
};
pub use catalog::{
    BookContent, BookDetail, BookEntry, BookFormat, BookIdentifier, BookSummary, FormatSize,
    ImportBookRequest, PaginatedBooks, ReadingFormatPolicy, UpdateBookMetadataRequest,
};
pub use content::{
    BookCoverThumbnailCache, BookCoverThumbnailCachePatch, DownloadedFile, FileDigest, FileState,
    FileStateUpdate,
};
pub use download::{DownloadTask, DownloadTaskRequest, DownloadTaskStatus, EnqueuedDownloadTask};
pub use library::{
    LocalLibraryRequest, ManagedLocalLibraryRequest, MyReaderLibraryMarker, RemoteLibraryRequest,
    MYREADER_LIBRARY_MARKER_RELATIVE_PATH, MYREADER_LIBRARY_MARKER_TYPE,
    MYREADER_LIBRARY_MARKER_VERSION,
};
pub use reading::{
    LegacyFinishedReading, ReaderAnnotation, ReaderBookmark, ReadingPosition,
    ReadingPositionCandidate, ReadingStatistics,
};
pub use storage::{LibraryStorageConfig, RemoteCredential, RemoteDirectoryEntry};
pub use sync::{
    CalibreSyncReport, LibrarySyncOptions, LibrarySyncReport, LibrarySyncScope, MyReaderSyncReport,
    SidecarSyncMode, SidecarSyncReport, SyncFailureKind,
};
pub(crate) use sync::{SyncFailureDisposition, SyncScheduleSnapshot};
