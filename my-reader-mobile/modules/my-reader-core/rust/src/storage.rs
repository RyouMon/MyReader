use std::collections::HashMap;

use crate::{types::LibraryStorageConfig, CoreFfiError};
use my_reader_core::api::storage::StorageService;

#[derive(uniffi::Record)]
pub struct RemoteFileStat {
    pub etag: String,
    pub size: f64,
    pub mtime_ms: f64,
}

#[derive(uniffi::Record)]
pub struct RemoteDownloadRequest {
    pub url: String,
    pub headers: HashMap<String, String>,
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn storage_stat(
    storage: LibraryStorageConfig,
    path: String,
) -> Result<Option<RemoteFileStat>, CoreFfiError> {
    Ok(StorageService::stat(&storage.try_into()?, &path)
        .await
        .map_err(CoreFfiError::from_core)?
        .map(|value| RemoteFileStat {
            etag: value.etag,
            size: value.size as f64,
            mtime_ms: value.mtime_ms as f64,
        }))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn storage_download_request(
    storage: LibraryStorageConfig,
    path: String,
) -> Result<RemoteDownloadRequest, CoreFfiError> {
    let value = StorageService::download_request(&storage.try_into()?, &path)
        .await
        .map_err(CoreFfiError::from_core)?;
    Ok(RemoteDownloadRequest {
        url: value.url,
        headers: value.headers,
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn storage_read(
    storage: LibraryStorageConfig,
    path: String,
) -> Result<Vec<u8>, CoreFfiError> {
    let operator =
        StorageService::operator(&storage.try_into()?).map_err(CoreFfiError::from_core)?;
    Ok(operator
        .read(&path)
        .await
        .map_err(|error| CoreFfiError::from_core(error.into()))?
        .to_vec())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn storage_write(
    storage: LibraryStorageConfig,
    path: String,
    bytes: Vec<u8>,
) -> Result<(), CoreFfiError> {
    let operator =
        StorageService::operator(&storage.try_into()?).map_err(CoreFfiError::from_core)?;
    operator
        .write(&path, bytes)
        .await
        .map_err(|error| CoreFfiError::from_core(error.into()))?;
    Ok(())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn storage_delete(
    storage: LibraryStorageConfig,
    path: String,
) -> Result<(), CoreFfiError> {
    let operator =
        StorageService::operator(&storage.try_into()?).map_err(CoreFfiError::from_core)?;
    operator
        .delete(&path)
        .await
        .map_err(|error| CoreFfiError::from_core(error.into()))?;
    Ok(())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn storage_list(
    storage: LibraryStorageConfig,
    path: String,
) -> Result<Vec<String>, CoreFfiError> {
    let operator =
        StorageService::operator(&storage.try_into()?).map_err(CoreFfiError::from_core)?;
    Ok(operator
        .list(&path)
        .await
        .map_err(|error| CoreFfiError::from_core(error.into()))?
        .into_iter()
        .map(|entry| entry.path().to_owned())
        .collect())
}
