pub(crate) mod catalog;
mod content;
mod download;
mod library;
mod reading;
mod registry;
mod storage;
mod sync;

pub use catalog::{
    BookDetail, BookEntry, BookFormat, BookIdentifier, BookSummary, FormatSize, PaginatedBooks,
};
pub use content::{
    BookCoverThumbnailCache, BookCoverThumbnailCachePatch, DownloadedFile, FileState,
    FileStateUpdate,
};
pub use download::{DownloadTask, DownloadTaskRequest, DownloadTaskStatus, EnqueuedDownloadTask};
pub use library::{LocalLibraryRequest, RemoteLibraryRequest};
pub use reading::{
    LegacyFinishedReading, ReaderAnnotation, ReaderBookmark, ReadingPosition,
    ReadingPositionCandidate, ReadingStatistics,
};
pub use registry::{
    DataSource, DeviceRegistry, Library, SecurityScopedBookmark, DEVICE_REGISTRY_SCHEMA_VERSION,
};
pub use storage::{RemoteCredential, RemoteDirectoryEntry, SidecarStorageConfig};
pub use sync::{SidecarSyncMode, SidecarSyncReport, SyncFailureKind};
pub(crate) use sync::{SyncFailureDisposition, SyncScheduleSnapshot};
