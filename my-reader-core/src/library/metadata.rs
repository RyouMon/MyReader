use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, TimeZone, Utc};
use opendal::Operator;

use crate::{infrastructure::storage, CoreError};

pub(crate) async fn download_and_validate_metadata(
    operator: &Operator,
    source_path: &str,
    destination: &Path,
) -> Result<u64, CoreError> {
    let remote_path = storage::join_remote_path(source_path, "metadata.db")?;
    let bytes = operator.read(&remote_path).await.map_err(|error| {
        if error.kind() == opendal::ErrorKind::NotFound {
            CoreError::MetadataDbNotFound(remote_path.clone())
        } else {
            storage::storage_error(error)
        }
    })?;
    if bytes.is_empty() {
        return Err(CoreError::Storage("REMOTE_METADATA_DB_EMPTY".into()));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| CoreError::Config("LIBRARY_CONTAINER_PATH_INVALID".into()))?;
    std::fs::create_dir_all(parent)?;
    let temporary = temporary_download_path(destination);
    tokio::fs::write(&temporary, bytes.to_vec()).await?;
    let result = async {
        let count =
            crate::repositories::calibre::CatalogRepository::validate_calibre_metadata(&temporary)
                .await?;
        tokio::fs::rename(&temporary, destination).await?;
        Ok(count)
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    result
}

fn temporary_download_path(destination: &Path) -> PathBuf {
    destination.with_extension("db.download")
}

pub(crate) fn catalog_timestamp(recorded_at_ms: i64) -> Result<String, CoreError> {
    if recorded_at_ms < 0 {
        return Err(CoreError::Config("RECORDED_AT_INVALID".into()));
    }
    Utc.timestamp_millis_opt(recorded_at_ms)
        .single()
        .map(|timestamp| timestamp.to_rfc3339_opts(SecondsFormat::Millis, true))
        .ok_or_else(|| CoreError::Config("RECORDED_AT_INVALID".into()))
}
