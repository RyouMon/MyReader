use std::path::Path;

use crate::{
    models::{DataSource, RemoteCredential, RemoteDirectoryEntry},
    services, CoreError,
};

pub async fn test_connection(
    source: &DataSource,
    credential: &RemoteCredential,
) -> Result<(), CoreError> {
    services::datasource::test_connection(source, credential).await
}

pub async fn list_directories(
    registry_path: &Path,
    data_source_id: &str,
    path: &str,
    credential: &RemoteCredential,
) -> Result<Vec<RemoteDirectoryEntry>, CoreError> {
    services::datasource::list_directories(registry_path, data_source_id, path, credential).await
}
