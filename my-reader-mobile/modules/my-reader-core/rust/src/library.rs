use std::path::Path;

use my_reader_core::api::library::LibraryService;

use crate::{
    types::{
        required_i64, AppConfig, Library, LibraryResult, LocalLibraryRequest, RemoteCredential,
        RemoteLibraryRequest,
    },
    CoreFfiError,
};

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_replace(
    config_path: String,
    library: Library,
) -> Result<AppConfig, CoreFfiError> {
    Ok(
        LibraryService::replace(Path::new(&config_path), library.try_into()?)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_create_local_myreader(
    config_path: String,
    request: LocalLibraryRequest,
    recorded_at_ms: f64,
) -> Result<LibraryResult, CoreFfiError> {
    let (config, library) = LibraryService::create_local_myreader(
        Path::new(&config_path),
        request.try_into()?,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        config: config.into(),
        library: library.into(),
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_open_local_myreader(
    config_path: String,
    request: LocalLibraryRequest,
    recorded_at_ms: f64,
) -> Result<LibraryResult, CoreFfiError> {
    let (config, library) = LibraryService::open_local_myreader(
        Path::new(&config_path),
        request.try_into()?,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        config: config.into(),
        library: library.into(),
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_create_remote_myreader(
    config_path: String,
    request: RemoteLibraryRequest,
    credential: RemoteCredential,
    recorded_at_ms: f64,
) -> Result<LibraryResult, CoreFfiError> {
    let credential = credential.try_into()?;
    let (config, library) = LibraryService::create_remote_myreader(
        Path::new(&config_path),
        request.into(),
        &credential,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        config: config.into(),
        library: library.into(),
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_open_remote_myreader(
    config_path: String,
    request: RemoteLibraryRequest,
    credential: RemoteCredential,
    recorded_at_ms: f64,
) -> Result<LibraryResult, CoreFfiError> {
    let credential = credential.try_into()?;
    let (config, library) = LibraryService::open_remote_myreader(
        Path::new(&config_path),
        request.into(),
        &credential,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        config: config.into(),
        library: library.into(),
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_remove(
    config_path: String,
    library_id: String,
) -> Result<AppConfig, CoreFfiError> {
    Ok(LibraryService::remove(Path::new(&config_path), &library_id)
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_switch(
    config_path: String,
    library_id: String,
) -> Result<AppConfig, CoreFfiError> {
    Ok(LibraryService::switch(Path::new(&config_path), &library_id)
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_add_local(
    config_path: String,
    request: LocalLibraryRequest,
) -> Result<LibraryResult, CoreFfiError> {
    let (config, library) = LibraryService::add_local(Path::new(&config_path), request.try_into()?)
        .await
        .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        config: config.into(),
        library: library.into(),
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_add_remote(
    config_path: String,
    request: RemoteLibraryRequest,
    credential: RemoteCredential,
) -> Result<LibraryResult, CoreFfiError> {
    let credential = credential.try_into()?;
    let (config, library) =
        LibraryService::add_remote(Path::new(&config_path), request.into(), &credential)
            .await
            .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        config: config.into(),
        library: library.into(),
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_refresh_remote(
    config_path: String,
    library_id: String,
    local_root_path: String,
    credential: RemoteCredential,
) -> Result<LibraryResult, CoreFfiError> {
    let credential = credential.try_into()?;
    let (config, library) = LibraryService::refresh_remote(
        Path::new(&config_path),
        &library_id,
        Path::new(&local_root_path),
        &credential,
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        config: config.into(),
        library: library.into(),
    })
}
