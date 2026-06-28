use std::path::Path;

use tracing::info;

use crate::error::AppError;
use crate::models::DataSourceConfig;
use crate::storage::from_data_source;

/// Download a single remote file via OpenDAL operator.
async fn download_file(
    op: &opendal::Operator,
    remote_path: &str,
    dest: &Path,
) -> Result<(), AppError> {
    let bytes: Vec<u8> = op
        .read(remote_path)
        .await
        .map_err(|e| AppError::Config(format!("REMOTE_READ_FAILED: {e} ({remote_path})")))?
        .to_vec();

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, bytes)?;

    Ok(())
}

/// Download metadata.db from a remote data source via OpenDAL.
pub async fn download_metadata_db(
    source: &DataSourceConfig,
    remote_path: &str,
    dest: &Path,
) -> Result<(), AppError> {
    let op = from_data_source(source).await?;

    let normalized_remote = remote_path.trim().trim_start_matches('/');
    let trimmed_remote = if normalized_remote.is_empty() {
        ""
    } else {
        normalized_remote.trim_end_matches('/')
    };

    let metadata_rel = if trimmed_remote.is_empty() {
        "metadata.db".to_string()
    } else {
        format!("{trimmed_remote}/metadata.db")
    };

    info!(
        "Downloading metadata.db via OpenDAL. source_kind: {:?}, remote_path: \"{metadata_rel}\"",
        source.detail
    );

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }

    download_file(&op, &metadata_rel, dest).await?;

    let size = std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
    info!(
        "Downloaded metadata.db. bytes: {}, dest: \"{}\"",
        size,
        dest.display()
    );

    Ok(())
}
