use std::path::Path;

use crate::{
    types::{
        DataSource, DeviceRegistry, Library, LibraryResult, LocalLibraryRequest, RemoteCredential,
        RemoteDirectoryEntry, RemoteLibraryRequest,
    },
    CoreFfiError,
};

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_initialize(
    registry_path: String,
    legacy_registry: Option<DeviceRegistry>,
) -> Result<DeviceRegistry, CoreFfiError> {
    Ok(my_reader_core::api::registry::load_or_initialize(
        Path::new(&registry_path),
        legacy_registry.map(TryInto::try_into).transpose()?,
    )
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_upsert_data_source(
    registry_path: String,
    source: DataSource,
) -> Result<DeviceRegistry, CoreFfiError> {
    Ok(my_reader_core::api::registry::upsert_data_source(
        Path::new(&registry_path),
        source.try_into()?,
    )
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_prepare_data_source(source: DataSource) -> Result<DataSource, CoreFfiError> {
    Ok(
        my_reader_core::api::registry::prepare_data_source(source.try_into()?)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_validate_data_source(
    registry_path: String,
    source: DataSource,
) -> Result<(), CoreFfiError> {
    my_reader_core::api::registry::ensure_data_source_can_upsert(
        Path::new(&registry_path),
        &source.try_into()?,
    )
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_remove_data_source(
    registry_path: String,
    data_source_id: String,
) -> Result<DeviceRegistry, CoreFfiError> {
    Ok(my_reader_core::api::registry::remove_data_source(
        Path::new(&registry_path),
        &data_source_id,
    )
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_register_library(
    registry_path: String,
    library: Library,
) -> Result<DeviceRegistry, CoreFfiError> {
    Ok(my_reader_core::api::registry::register_library(
        Path::new(&registry_path),
        library.try_into()?,
    )
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_replace_library(
    registry_path: String,
    library: Library,
) -> Result<DeviceRegistry, CoreFfiError> {
    Ok(my_reader_core::api::registry::replace_library(
        Path::new(&registry_path),
        library.try_into()?,
    )
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_remove_library(
    registry_path: String,
    library_id: String,
) -> Result<DeviceRegistry, CoreFfiError> {
    Ok(
        my_reader_core::api::registry::remove_library(Path::new(&registry_path), &library_id)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_switch_library(
    registry_path: String,
    library_id: String,
) -> Result<DeviceRegistry, CoreFfiError> {
    Ok(
        my_reader_core::api::registry::switch_library(Path::new(&registry_path), &library_id)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_add_local_library(
    registry_path: String,
    request: LocalLibraryRequest,
) -> Result<LibraryResult, CoreFfiError> {
    let (registry, library) =
        my_reader_core::api::library::add_local(Path::new(&registry_path), request.try_into()?)
            .await
            .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        registry: registry.into(),
        library: library.into(),
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_test_remote_data_source(
    source: DataSource,
    credential: RemoteCredential,
) -> Result<(), CoreFfiError> {
    let source = source.try_into()?;
    let credential = credential.try_into()?;
    my_reader_core::api::datasource::test_connection(&source, &credential)
        .await
        .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_list_remote_directories(
    registry_path: String,
    data_source_id: String,
    path: String,
    credential: RemoteCredential,
) -> Result<Vec<RemoteDirectoryEntry>, CoreFfiError> {
    Ok(my_reader_core::api::datasource::list_directories(
        Path::new(&registry_path),
        &data_source_id,
        &path,
        &credential.try_into()?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_add_remote_library(
    registry_path: String,
    request: RemoteLibraryRequest,
    credential: RemoteCredential,
) -> Result<LibraryResult, CoreFfiError> {
    let credential = credential.try_into()?;
    let (registry, library) = my_reader_core::api::library::add_remote(
        Path::new(&registry_path),
        request.into(),
        &credential,
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        registry: registry.into(),
        library: library.into(),
    })
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn registry_refresh_remote_library(
    registry_path: String,
    library_id: String,
    local_root_path: String,
    credential: RemoteCredential,
) -> Result<LibraryResult, CoreFfiError> {
    let credential = credential.try_into()?;
    let (registry, library) = my_reader_core::api::library::refresh_remote(
        Path::new(&registry_path),
        &library_id,
        Path::new(&local_root_path),
        &credential,
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(LibraryResult {
        registry: registry.into(),
        library: library.into(),
    })
}
