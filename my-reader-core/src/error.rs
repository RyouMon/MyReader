#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("LIBRARY_ALREADY_EXISTS")]
    LibraryAlreadyExists,

    #[error("LIBRARY_NOT_FOUND: {0}")]
    LibraryNotFound(String),

    #[error("NO_ACTIVE_LIBRARY")]
    NoActiveLibrary,

    #[error("METADATA_DB_NOT_FOUND: {0}")]
    MetadataDbNotFound(String),

    #[error("MYREADER_LIBRARY_MARKER_NOT_FOUND: {0}")]
    LibraryMarkerNotFound(String),

    #[error("MYREADER_LIBRARY_CONTAINS_METADATA_DB")]
    LibraryContainsMetadataDb,

    #[error("LIBRARY_ROOT_NOT_EMPTY")]
    LibraryRootNotEmpty,

    #[error("LIBRARY_FOLDER_ALREADY_EXISTS")]
    LibraryFolderAlreadyExists,

    #[error("DATA_SOURCE_IN_USE: {0:?}")]
    DataSourceInUse(Vec<String>),

    #[error("IO_ERROR: {0}")]
    Io(#[from] std::io::Error),

    #[error("DATABASE_ERROR: {0}")]
    Database(String),

    #[error("CONFIG_ERROR: {0}")]
    Config(String),

    #[error("NOT_FOUND: {0}")]
    NotFound(String),

    #[error("SERIALIZE_ERROR: {0}")]
    Serialize(String),

    #[error("STORAGE_ERROR: {0}")]
    Storage(String),

    #[error("STORAGE_ERROR: {0}")]
    StorageBackend(#[from] opendal::Error),

    #[error("SYNC_ERROR: {0}")]
    Sync(String),

    #[error("TTS_ERROR: {0}")]
    Tts(String),

    #[error("DATA_INTEGRITY_ERROR: {0}")]
    DataIntegrity(String),
}

impl From<sea_orm::DbErr> for CoreError {
    fn from(error: sea_orm::DbErr) -> Self {
        Self::Database(error.to_string())
    }
}

impl From<serde_json::Error> for CoreError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialize(error.to_string())
    }
}

impl From<crate::sync::SyncError> for CoreError {
    fn from(error: crate::sync::SyncError) -> Self {
        match error {
            crate::sync::SyncError::Storage(error) => Self::StorageBackend(error),
            crate::sync::SyncError::Sync(message) => Self::Sync(message),
            crate::sync::SyncError::InvalidRemoteObject { .. }
            | crate::sync::SyncError::MissingDependencies { .. } => {
                Self::DataIntegrity(error.to_string())
            }
        }
    }
}
