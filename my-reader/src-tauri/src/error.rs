use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    LibraryAlreadyExists(String),

    #[error("{0}")]
    LibraryNotFound(String),

    #[error("{0}")]
    NoActiveLibrary(String),

    #[error("{0}")]
    MetadataDbNotFound(String),

    #[error("{0}")]
    LibraryMarkerNotFound(String),

    #[error("{0}")]
    LibraryContainsMetadataDb(String),

    #[error("{0}")]
    LibraryRootNotEmpty(String),

    #[error("{0}")]
    LibraryFolderAlreadyExists(String),

    #[error("{0}")]
    DataSourceInUse(String),

    #[error("{0}")]
    BookFormatNotDownloaded(String),

    #[error("IO_ERROR: {0}")]
    Io(#[from] std::io::Error),

    #[error("DATABASE_ERROR: {0}")]
    Database(String),

    #[error("NOT_FOUND: {0}")]
    NotFound(String),

    #[error("CONFIG_ERROR: {0}")]
    Config(String),

    #[error("SERIALIZE_ERROR: {0}")]
    Serialize(String),

    #[error("REQUEST_ERROR: {0}")]
    Request(#[from] reqwest::Error),

    #[error("ZIP_ERROR: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("TASK_ERROR: {0}")]
    Task(String),

    #[error("AUTH_ERROR: {0}")]
    Auth(String),

    #[error("CREDENTIAL_ERROR: {0}")]
    Credential(String),

    #[error("STORAGE_ERROR: {0}")]
    Storage(String),

    #[error("SYNC_ERROR: {0}")]
    Sync(String),

    #[error("TTS_ERROR: {0}")]
    Tts(String),

    #[error("DATA_INTEGRITY_ERROR: {0}")]
    DataIntegrity(String),
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<sea_orm::DbErr> for AppError {
    fn from(err: sea_orm::DbErr) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<my_reader_core::CoreError> for AppError {
    fn from(error: my_reader_core::CoreError) -> Self {
        match error {
            error @ my_reader_core::CoreError::LibraryAlreadyExists => {
                Self::LibraryAlreadyExists(error.to_string())
            }
            error @ my_reader_core::CoreError::LibraryNotFound(_) => {
                Self::LibraryNotFound(error.to_string())
            }
            error @ my_reader_core::CoreError::NoActiveLibrary => {
                Self::NoActiveLibrary(error.to_string())
            }
            error @ my_reader_core::CoreError::MetadataDbNotFound(_) => {
                Self::MetadataDbNotFound(error.to_string())
            }
            error @ my_reader_core::CoreError::LibraryMarkerNotFound(_) => {
                Self::LibraryMarkerNotFound(error.to_string())
            }
            error @ my_reader_core::CoreError::LibraryContainsMetadataDb => {
                Self::LibraryContainsMetadataDb(error.to_string())
            }
            error @ my_reader_core::CoreError::LibraryRootNotEmpty => {
                Self::LibraryRootNotEmpty(error.to_string())
            }
            error @ my_reader_core::CoreError::LibraryFolderAlreadyExists => {
                Self::LibraryFolderAlreadyExists(error.to_string())
            }
            error @ my_reader_core::CoreError::DataSourceInUse(_) => {
                Self::DataSourceInUse(error.to_string())
            }
            my_reader_core::CoreError::Io(error) => Self::Io(error),
            my_reader_core::CoreError::Database(message) => Self::Database(message),
            my_reader_core::CoreError::Config(message) => Self::Config(message),
            my_reader_core::CoreError::NotFound(message) => Self::NotFound(message),
            my_reader_core::CoreError::Serialize(message) => Self::Serialize(message),
            my_reader_core::CoreError::Storage(message) => Self::Storage(message),
            error @ (my_reader_core::CoreError::StorageBackend(_)
            | my_reader_core::CoreError::Request(_)) => {
                use my_reader_core::{api::sync::SyncService, models::SyncFailureKind};

                match SyncService::failure_kind(&error) {
                    SyncFailureKind::Connectivity => Self::Storage(error.to_string()),
                    SyncFailureKind::Configuration => Self::Config(error.to_string()),
                    SyncFailureKind::Credential => Self::Credential(error.to_string()),
                    SyncFailureKind::DataIntegrity => Self::DataIntegrity(error.to_string()),
                    SyncFailureKind::Unexpected => Self::Sync(error.to_string()),
                }
            }
            my_reader_core::CoreError::Sync(message) => Self::Sync(message),
            error @ my_reader_core::CoreError::Tts { .. } => {
                use my_reader_core::{api::sync::SyncService, models::SyncFailureKind};
                match SyncService::failure_kind(&error) {
                    SyncFailureKind::Configuration => Self::Config(error.to_string()),
                    SyncFailureKind::Credential => Self::Credential(error.to_string()),
                    SyncFailureKind::Connectivity => Self::Storage(error.to_string()),
                    _ => Self::Tts(error.to_string()),
                }
            }
            my_reader_core::CoreError::DataIntegrity(message) => Self::DataIntegrity(message),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Serialize(err.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        AppError::Config(err.to_string())
    }
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum ErrorKind {
    LibraryAlreadyExists(String),
    LibraryNotFound(String),
    NoActiveLibrary(String),
    MetadataDbNotFound(String),
    LibraryMarkerNotFound(String),
    LibraryContainsMetadataDb(String),
    LibraryRootNotEmpty(String),
    LibraryFolderAlreadyExists(String),
    DataSourceInUse(String),
    BookFormatNotDownloaded(String),
    Io(String),
    Database(String),
    NotFound(String),
    Config(String),
    Serialize(String),
    Request(String),
    Zip(String),
    Task(String),
    Auth(String),
    Credential(String),
    Storage(String),
    Sync(String),
    Tts(String),
    DataIntegrity(String),
}

impl specta::Type for AppError {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        ErrorKind::definition(types)
    }
}

impl AppError {
    pub(crate) fn as_kind(&self) -> ErrorKind {
        match self {
            Self::LibraryAlreadyExists(_) => ErrorKind::LibraryAlreadyExists(self.to_string()),
            Self::LibraryNotFound(_) => ErrorKind::LibraryNotFound(self.to_string()),
            Self::NoActiveLibrary(_) => ErrorKind::NoActiveLibrary(self.to_string()),
            Self::MetadataDbNotFound(_) => ErrorKind::MetadataDbNotFound(self.to_string()),
            Self::LibraryMarkerNotFound(_) => ErrorKind::LibraryMarkerNotFound(self.to_string()),
            Self::LibraryContainsMetadataDb(_) => {
                ErrorKind::LibraryContainsMetadataDb(self.to_string())
            }
            Self::LibraryRootNotEmpty(_) => ErrorKind::LibraryRootNotEmpty(self.to_string()),
            Self::LibraryFolderAlreadyExists(_) => {
                ErrorKind::LibraryFolderAlreadyExists(self.to_string())
            }
            Self::DataSourceInUse(_) => ErrorKind::DataSourceInUse(self.to_string()),
            Self::BookFormatNotDownloaded(_) => {
                ErrorKind::BookFormatNotDownloaded(self.to_string())
            }
            Self::Io(_) => ErrorKind::Io(self.to_string()),
            Self::Database(_) => ErrorKind::Database(self.to_string()),
            Self::NotFound(_) => ErrorKind::NotFound(self.to_string()),
            Self::Config(_) => ErrorKind::Config(self.to_string()),
            Self::Serialize(_) => ErrorKind::Serialize(self.to_string()),
            Self::Request(error) => match error.status().map(|status| status.as_u16()) {
                Some(401 | 403) => ErrorKind::Credential(self.to_string()),
                Some(404) => ErrorKind::NotFound(self.to_string()),
                Some(400..=499)
                    if !matches!(error.status().map(|s| s.as_u16()), Some(408 | 429)) =>
                {
                    ErrorKind::Config(self.to_string())
                }
                _ => ErrorKind::Request(self.to_string()),
            },
            Self::Zip(_) => ErrorKind::Zip(self.to_string()),
            Self::Task(_) => ErrorKind::Task(self.to_string()),
            Self::Auth(_) => ErrorKind::Auth(self.to_string()),
            Self::Credential(_) => ErrorKind::Credential(self.to_string()),
            Self::Storage(_) => ErrorKind::Storage(self.to_string()),
            Self::Sync(_) => ErrorKind::Sync(self.to_string()),
            Self::Tts(_) => ErrorKind::Tts(self.to_string()),
            Self::DataIntegrity(_) => ErrorKind::DataIntegrity(self.to_string()),
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        self.as_kind().serialize(serializer)
    }
}
