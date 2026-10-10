//! Mobile FFI aggregation root for MyReader Core.

mod book_transfer;
mod catalog;
mod config;
mod content;
mod data_source;
mod download;
mod library;
mod reading;
mod sync;
mod tts;
mod types;

#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum CoreFfiError {
    #[error("CORE_ERROR: {0}")]
    Core(String),

    #[error("SYNC_ERROR: {0}")]
    Sync(String),

    #[error("DATA_INTEGRITY_ERROR: {0}")]
    DataIntegrity(String),

    #[error("IO_ERROR: {0}")]
    Io(String),

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

    #[error("TTS_ERROR: {0}")]
    Tts(String),

    #[error("CREDENTIAL_ERROR: {0}")]
    Credential(String),

    #[error("REQUEST_ERROR: {0}")]
    Request(String),
}

impl CoreFfiError {
    pub(crate) fn core(message: impl Into<String>) -> Self {
        Self::Core(message.into())
    }

    pub(crate) fn sync(message: impl Into<String>) -> Self {
        Self::Sync(message.into())
    }

    pub(crate) fn from_core(error: my_reader_core::CoreError) -> Self {
        use my_reader_core::{api::sync::SyncService, models::SyncFailureKind, CoreError};

        match error {
            CoreError::Io(error) => Self::Io(error.to_string()),
            CoreError::Database(message) => Self::Database(message),
            CoreError::Config(message) => Self::Config(message),
            CoreError::NotFound(message) => Self::NotFound(message),
            CoreError::Serialize(message) => Self::Serialize(message),
            CoreError::Storage(message) => Self::Storage(message),
            CoreError::Sync(message) => Self::Sync(message),
            CoreError::Tts(message) => Self::Tts(message),
            CoreError::DataIntegrity(message) => Self::DataIntegrity(message),
            error @ CoreError::StorageBackend(_) => match SyncService::failure_kind(&error) {
                SyncFailureKind::Connectivity => Self::Request(error.to_string()),
                SyncFailureKind::Configuration => Self::Config(error.to_string()),
                SyncFailureKind::Credential => Self::Credential(error.to_string()),
                SyncFailureKind::DataIntegrity => Self::DataIntegrity(error.to_string()),
                SyncFailureKind::Unexpected => Self::Sync(error.to_string()),
            },
        }
    }
}

uniffi::setup_scaffolding!();

#[cfg(test)]
mod tests {
    use super::CoreFfiError;
    use my_reader_core::CoreError;

    #[test]
    fn should_preserve_data_integrity_variant_when_core_error_crosses_ffi() {
        let error = CoreFfiError::from_core(my_reader_core::CoreError::DataIntegrity(
            "missing change abc".to_owned(),
        ));

        assert!(matches!(
            error,
            CoreFfiError::DataIntegrity(message) if message == "missing change abc"
        ));
    }

    #[test]
    fn should_preserve_core_categories_without_parsing_diagnostics() {
        let diagnostic = "network credential 503 diagnostic";
        assert!(matches!(
            CoreFfiError::from_core(CoreError::Io(std::io::Error::other(diagnostic))),
            CoreFfiError::Io(message) if message == diagnostic
        ));
        assert!(matches!(
            CoreFfiError::from_core(CoreError::Database(diagnostic.into())),
            CoreFfiError::Database(message) if message == diagnostic
        ));
        assert!(matches!(
            CoreFfiError::from_core(CoreError::Config(diagnostic.into())),
            CoreFfiError::Config(message) if message == diagnostic
        ));
        assert!(matches!(
            CoreFfiError::from_core(CoreError::NotFound(diagnostic.into())),
            CoreFfiError::NotFound(message) if message == diagnostic
        ));
        assert!(matches!(
            CoreFfiError::from_core(CoreError::Serialize(diagnostic.into())),
            CoreFfiError::Serialize(message) if message == diagnostic
        ));
        assert!(matches!(
            CoreFfiError::from_core(CoreError::Storage(diagnostic.into())),
            CoreFfiError::Storage(message) if message == diagnostic
        ));
        assert!(matches!(
            CoreFfiError::from_core(CoreError::Sync(diagnostic.into())),
            CoreFfiError::Sync(message) if message == diagnostic
        ));
        assert!(matches!(
            CoreFfiError::from_core(CoreError::Tts(diagnostic.into())),
            CoreFfiError::Tts(message) if message == diagnostic
        ));
    }

    #[test]
    fn should_preserve_storage_recovery_categories_across_ffi() {
        use opendal::{Error, ErrorKind};

        let diagnostic = "network credential 503 diagnostic";
        let error = CoreError::from(Error::new(ErrorKind::Unexpected, diagnostic).set_temporary());
        assert!(matches!(
            CoreFfiError::from_core(error),
            CoreFfiError::Request(message) if message.contains(diagnostic)
        ));
        let error = CoreError::from(Error::new(ErrorKind::Unexpected, diagnostic).set_persistent());
        assert!(matches!(
            CoreFfiError::from_core(error),
            CoreFfiError::Request(_)
        ));
        let error = CoreError::from(Error::new(ErrorKind::PermissionDenied, diagnostic));
        assert!(matches!(
            CoreFfiError::from_core(error),
            CoreFfiError::Credential(_)
        ));
        let error = CoreError::from(Error::new(ErrorKind::ConfigInvalid, diagnostic));
        assert!(matches!(
            CoreFfiError::from_core(error),
            CoreFfiError::Config(_)
        ));
        let error = CoreError::from(Error::new(ErrorKind::Unexpected, diagnostic));
        assert!(matches!(
            CoreFfiError::from_core(error),
            CoreFfiError::Sync(_)
        ));
    }
}
