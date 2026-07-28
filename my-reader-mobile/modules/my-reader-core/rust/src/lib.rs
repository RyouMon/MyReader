//! Mobile FFI aggregation root for MyReader Core.

use std::{future::Future, sync::OnceLock};

mod transport;

#[uniffi::export]
pub fn core_contract_version() -> u32 {
    transport::CORE_CONTRACT_VERSION
}

#[uniffi::export]
pub fn invoke_core_async(request_json: String) -> Result<String, CoreFfiError> {
    transport::invoke_async(&request_json)
}

#[uniffi::export]
pub fn invoke_core_sync(request_json: String) -> Result<String, CoreFfiError> {
    transport::invoke_sync(&request_json)
}

#[cfg(feature = "typescript-contract")]
pub fn generate_typescript_contract() -> Result<String, String> {
    transport::generate_typescript_contract()
}

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreFfiError {
    #[error("CORE_ERROR: {0}")]
    Core(String),

    #[error("SYNC_ERROR: {0}")]
    Sync(String),
}

static CORE_RUNTIME: OnceLock<Result<tokio::runtime::Runtime, String>> = OnceLock::new();

fn parse_core_json<T: serde::de::DeserializeOwned>(value: &str) -> Result<T, CoreFfiError> {
    serde_json::from_str(value)
        .map_err(|error| CoreFfiError::Core(format!("Invalid core input: {error}")))
}

fn serialize_core_json<T: serde::Serialize>(value: &T) -> Result<String, CoreFfiError> {
    serde_json::to_string(value)
        .map_err(|error| CoreFfiError::Core(format!("Invalid core output: {error}")))
}

pub(crate) fn run_core_async<T>(
    future: impl Future<Output = Result<T, my_reader_core::CoreError>>,
) -> Result<T, CoreFfiError> {
    core_runtime()?
        .block_on(future)
        .map_err(|error| CoreFfiError::Core(error.to_string()))
}

pub(crate) fn core_runtime() -> Result<&'static tokio::runtime::Runtime, CoreFfiError> {
    CORE_RUNTIME
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .map_err(|error| format!("Failed to start core runtime: {error}"))
        })
        .as_ref()
        .map_err(|error| CoreFfiError::Core(error.clone()))
}

uniffi::setup_scaffolding!();
