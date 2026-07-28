use std::path::Path;

use crate::{
    models::{
        DeviceRegistry, Library, LocalLibraryRequest, RemoteCredential, RemoteLibraryRequest,
    },
    services, CoreError,
};

pub async fn add_local(
    registry_path: &Path,
    request: LocalLibraryRequest,
) -> Result<(DeviceRegistry, Library), CoreError> {
    services::library::add_local_library(registry_path, request).await
}

pub async fn add_remote(
    registry_path: &Path,
    request: RemoteLibraryRequest,
    credential: &RemoteCredential,
) -> Result<(DeviceRegistry, Library), CoreError> {
    services::library::add_remote_library(registry_path, request, credential).await
}

pub async fn refresh_remote(
    registry_path: &Path,
    library_id: &str,
    local_root_path: &Path,
    credential: &RemoteCredential,
) -> Result<(DeviceRegistry, Library), CoreError> {
    services::library::refresh_remote_library(
        registry_path,
        library_id,
        local_root_path,
        credential,
    )
    .await
}
