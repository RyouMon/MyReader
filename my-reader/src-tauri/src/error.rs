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
        };
        kind.serialize(serializer)
    }
}
