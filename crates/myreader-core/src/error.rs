#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("IO_ERROR: {0}")]
    Io(#[from] std::io::Error),

    #[error("DATABASE_ERROR: {0}")]
    Database(String),
}

impl From<sea_orm::DbErr> for CoreError {
    fn from(error: sea_orm::DbErr) -> Self {
        Self::Database(error.to_string())
    }
}
