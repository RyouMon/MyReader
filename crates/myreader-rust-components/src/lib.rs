//! Mobile FFI aggregation root for MyReader Core.

use std::{future::Future, path::Path, sync::OnceLock};

mod content;
mod sync;
mod transport;

pub use content::*;
pub use sync::*;

#[uniffi::export]
pub fn core_contract_version() -> u32 {
    transport::CORE_CONTRACT_VERSION
}

#[uniffi::export]
pub fn invoke_core_async(request_json: String) -> Result<String, RustComponentsError> {
    transport::invoke_async(&request_json)
}

#[uniffi::export]
pub fn invoke_core_sync(request_json: String) -> Result<String, RustComponentsError> {
    transport::invoke_sync(&request_json)
}

#[cfg(feature = "typescript-contract")]
pub fn generate_typescript_contract() -> Result<String, String> {
    transport::generate_typescript_contract()
}

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum RustComponentsError {
    #[error("CORE_ERROR: {0}")]
    Core(String),

    #[error("SYNC_ERROR: {0}")]
    Sync(String),
}

static CORE_RUNTIME: OnceLock<Result<tokio::runtime::Runtime, String>> = OnceLock::new();

#[uniffi::export]
pub fn sync_contract_version() -> u32 {
    11
}

#[uniffi::export]
pub fn migrate_library_database(database_path: String) -> Result<(), RustComponentsError> {
    core_runtime()?
        .block_on(myreader_core::api::migrate_library_database(Path::new(
            &database_path,
        )))
        .map_err(|error| RustComponentsError::Core(error.to_string()))
}

pub(crate) fn parse_core_json<T: serde::de::DeserializeOwned>(
    value: &str,
) -> Result<T, RustComponentsError> {
    serde_json::from_str(value)
        .map_err(|error| RustComponentsError::Core(format!("Invalid core input: {error}")))
}

pub(crate) fn serialize_core_json<T: serde::Serialize>(
    value: &T,
) -> Result<String, RustComponentsError> {
    serde_json::to_string(value)
        .map_err(|error| RustComponentsError::Core(format!("Invalid core output: {error}")))
}

pub(crate) fn run_core_async<T>(
    future: impl Future<Output = Result<T, myreader_core::CoreError>>,
) -> Result<T, RustComponentsError> {
    core_runtime()?
        .block_on(future)
        .map_err(|error| RustComponentsError::Core(error.to_string()))
}

pub(crate) fn core_runtime() -> Result<&'static tokio::runtime::Runtime, RustComponentsError> {
    CORE_RUNTIME
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .map_err(|error| format!("Failed to start core runtime: {error}"))
        })
        .as_ref()
        .map_err(|error| RustComponentsError::Core(error.clone()))
}

uniffi::setup_scaffolding!();
