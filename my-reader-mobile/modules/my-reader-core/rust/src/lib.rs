//! Mobile FFI aggregation root for MyReader Core.

mod catalog;
mod config;
mod content;
mod data_source;
mod download;
mod library;
mod reading;
mod sync;
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
}

impl CoreFfiError {
    pub(crate) fn core(message: impl Into<String>) -> Self {
        Self::Core(message.into())
    }

    pub(crate) fn sync(message: impl Into<String>) -> Self {
        Self::Sync(message.into())
    }

    pub(crate) fn from_core(error: my_reader_core::CoreError) -> Self {
        match error {
            my_reader_core::CoreError::DataIntegrity(message) => Self::DataIntegrity(message),
            error => Self::Core(error.to_string()),
        }
    }
}

uniffi::setup_scaffolding!();

#[cfg(test)]
mod tests {
    use super::CoreFfiError;

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
}
