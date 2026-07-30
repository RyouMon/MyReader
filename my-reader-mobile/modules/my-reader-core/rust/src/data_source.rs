use std::path::Path;

use my_reader_core::api::datasource::DataSourceService;

use crate::{
    types::{AppConfig, DataSource, RemoteCredential, RemoteDirectoryEntry},
    CoreFfiError,
};

#[uniffi::export(async_runtime = "tokio")]
pub async fn data_source_upsert(
    config_path: String,
    source: DataSource,
) -> Result<AppConfig, CoreFfiError> {
    Ok(
        DataSourceService::upsert(Path::new(&config_path), source.try_into()?)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn data_source_prepare_for_upsert(
    config_path: String,
    source: DataSource,
) -> Result<DataSource, CoreFfiError> {
    Ok(
        DataSourceService::prepare_for_upsert(Path::new(&config_path), source.try_into()?)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn data_source_remove(
    config_path: String,
    data_source_id: String,
) -> Result<AppConfig, CoreFfiError> {
    Ok(
        DataSourceService::remove(Path::new(&config_path), &data_source_id)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn data_source_test_connection(
    source: DataSource,
    credential: RemoteCredential,
) -> Result<(), CoreFfiError> {
    let source = source.try_into()?;
    let credential = credential.try_into()?;
    DataSourceService::test_connection(&source, &credential)
        .await
        .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn data_source_list_directories(
    config_path: String,
    data_source_id: String,
    path: String,
    credential: RemoteCredential,
) -> Result<Vec<RemoteDirectoryEntry>, CoreFfiError> {
    Ok(DataSourceService::list_directories(
        Path::new(&config_path),
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
