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
}

#[derive(serde::Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum ErrorKind {
    Io(String),
    Database(String),
    NotFound(String),
    Config(String),
    Serialize(String),
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
        };
        kind.serialize(serializer)
    }
}
