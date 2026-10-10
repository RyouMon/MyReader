#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("REQUEST_ERROR: {0}")]
    Request(#[from] reqwest::Error),

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

    #[error("TTS_ERROR: {kind}:{message}")]
    Tts { kind: TtsErrorKind, message: String },

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum TtsErrorKind {
    #[error("configuration")]
    Configuration,
    #[error("invalid_request")]
    InvalidRequest,
    #[error("unauthorized")]
    Unauthorized,
    #[error("rate_limited")]
    RateLimited,
    #[error("timeout")]
    Timeout,
    #[error("network")]
    Network,
    #[error("unavailable")]
    Unavailable,
    #[error("invalid_response")]
    InvalidResponse,
    #[error("cache")]
    Cache,
    #[error("unsupported")]
    Unsupported,
    #[error("invalid_audio")]
    InvalidAudio,
    #[error("payload_too_large")]
    PayloadTooLarge,
}

impl TtsErrorKind {
    pub fn failure_kind(self) -> crate::models::SyncFailureKind {
        use crate::models::SyncFailureKind;
        match self {
            Self::Configuration
            | Self::InvalidRequest
            | Self::Unsupported
            | Self::PayloadTooLarge => SyncFailureKind::Configuration,
            Self::Unauthorized => SyncFailureKind::Credential,
            Self::Network | Self::Timeout | Self::Unavailable | Self::RateLimited => {
                SyncFailureKind::Connectivity
            }
            Self::InvalidResponse | Self::Cache | Self::InvalidAudio => SyncFailureKind::Unexpected,
        }
    }
}
