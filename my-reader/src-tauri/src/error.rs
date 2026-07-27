use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
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

impl From<myreader_core::CoreError> for AppError {
    fn from(error: myreader_core::CoreError) -> Self {
        match error {
            myreader_core::CoreError::Io(error) => Self::Io(error),
            myreader_core::CoreError::Database(message) => Self::Database(message),
            myreader_core::CoreError::Config(message) => Self::Config(message),
            myreader_core::CoreError::NotFound(message) => Self::NotFound(message),
            myreader_core::CoreError::Serialize(message) => Self::Serialize(message),
            myreader_core::CoreError::Storage(message) => Self::Storage(message),
            myreader_core::CoreError::Sync(message) => Self::Sync(message),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Serialize(err.to_string())
    }
}

impl From<myreader_rust_components::sync::SyncError> for AppError {
    fn from(err: myreader_rust_components::sync::SyncError) -> Self {
        match err {
            myreader_rust_components::sync::SyncError::Sync(message) => AppError::Sync(message),
        }
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        AppError::Config(err.to_string())
    }
}

#[derive(serde::Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum ErrorKind {
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
}

impl specta::Type for AppError {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        ErrorKind::definition(types)
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        let kind = match self {
            Self::Io(_) => ErrorKind::Io(self.to_string()),
            Self::Database(_) => ErrorKind::Database(self.to_string()),
            Self::NotFound(_) => ErrorKind::NotFound(self.to_string()),
            Self::Config(_) => ErrorKind::Config(self.to_string()),
            Self::Serialize(_) => ErrorKind::Serialize(self.to_string()),
            Self::Request(_) => ErrorKind::Request(self.to_string()),
            Self::Zip(_) => ErrorKind::Zip(self.to_string()),
            Self::Task(_) => ErrorKind::Task(self.to_string()),
            Self::Auth(_) => ErrorKind::Auth(self.to_string()),
            Self::Credential(_) => ErrorKind::Credential(self.to_string()),
            Self::Storage(_) => ErrorKind::Storage(self.to_string()),
            Self::Sync(_) => ErrorKind::Sync(self.to_string()),
        };
        kind.serialize(serializer)
    }
}
