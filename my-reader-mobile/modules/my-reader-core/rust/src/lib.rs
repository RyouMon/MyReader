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
}

impl CoreFfiError {
    pub(crate) fn core(message: impl Into<String>) -> Self {
        Self::Core(message.into())
    }

    pub(crate) fn sync(message: impl Into<String>) -> Self {
        Self::Sync(message.into())
    }

    pub(crate) fn from_core(error: my_reader_core::CoreError) -> Self {
        Self::Core(error.to_string())
    }
}

uniffi::setup_scaffolding!();
