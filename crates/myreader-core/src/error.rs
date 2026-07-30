#[derive(Debug, thiserror::Error)]
pub enum CoreError {
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
