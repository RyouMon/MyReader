use std::path::{Path, PathBuf};

use futures::stream::{self, StreamExt};
use opendal::Operator;
use tracing::{info, warn};

use crate::error::AppError;
use crate::models::DataSourceConfig;
use crate::repositories::calibre_repo::CoverSummary;
use crate::sync::backend::build_operator_for_data_source;

/// Local cache directory for a remote library's metadata.db and covers.
pub fn remote_library_cache_dir(app_data_dir: &Path, library_id: &str) -> Result<PathBuf, AppError> {
    let dir = app_data_dir.join("remote-cache").join(library_id);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[deprecated(note = "use remote_library_cache_dir instead")]
pub fn webdav_cache_dir(app_data_dir: &Path, library_id: &str) -> Result<PathBuf, AppError> {
    remote_library_cache_dir(app_data_dir, library_id)
}

/// Download a single remote file via OpenDAL operator.
async fn download_file(op: &Operator, remote_path: &str, dest: &Path) -> Result<(), AppError> {
    let bytes: Vec<u8> = op.read(remote_path).await
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
    let op = build_operator_for_data_source(source).await?;

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

    info!("Downloading metadata.db via OpenDAL. source_kind: {:?}, remote_path: \"{metadata_rel}\"", source.detail);

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

/// Bulk-download all book covers from a remote data source to the local cache directory.
/// Covers are stored at `{cache_dir}/{book_path}/cover.jpg`, mirroring the
/// Calibre directory layout so the bookcover_handler can serve them directly.
/// Downloads up to 8 covers concurrently for speed.
pub async fn download_all_covers(
    source: &DataSourceConfig,
    remote_path: &str,
    cache_dir: &Path,
    summaries: &[CoverSummary],
) {
    let op = match build_operator_for_data_source(source).await {
        Ok(o) => o,
        Err(e) => {
            warn!("Skipping cover download: cannot build operator: {e}");
            return;
        }
    };

    let normalized_remote = remote_path.trim().trim_start_matches('/');
    let trimmed_remote = if normalized_remote.is_empty() {
        ""
    } else {
        normalized_remote.trim_end_matches('/')
    };

    // Pre-filter: only books with covers, and skip already-cached ones
    let to_download: Vec<(String, PathBuf)> = summaries
        .iter()
        .filter(|s| s.has_cover && !s.path.is_empty())
        .filter_map(|s| {
            let cover_rel = if trimmed_remote.is_empty() {
                format!("{}/cover.jpg", s.path)
            } else {
                format!("{}/{}/cover.jpg", trimmed_remote, s.path)
            };
            let local_dir = cache_dir.join(&s.path);
            let local_path = local_dir.join("cover.jpg");

            // Skip if already cached (exists and non-empty)
            if local_path.exists()
                && std::fs::metadata(&local_path)
                    .map(|m| m.len() > 0)
                    .unwrap_or(false)
            {
                return None;
            }

            Some((cover_rel, local_path))
        })
        .collect();

    let total = to_download.len();
    if total == 0 {
        info!("All covers already cached, nothing to download");
        return;
    }

    info!("Starting bulk cover download. covers to fetch: {total}");

    let results: Vec<bool> = stream::iter(to_download)
        .map(|(cover_rel, local_path)| {
            let op = op.clone();
            async move {
                if let Some(parent) = local_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }

                match download_file(&op, &cover_rel, &local_path).await {
                    Ok(()) => true,
                    Err(e) => {
                        warn!("Failed to download cover: {e}");
                        false
                    }
                }
            }
        })
        .buffer_unordered(8)
        .collect()
        .await;

    let downloaded = results.iter().filter(|&&ok| ok).count();
    let failed = total - downloaded;

    info!("Bulk cover download complete. downloaded: {downloaded}, failed: {failed}, total: {total}");
}

// Legacy WebDAV-specific helpers kept for compatibility with callers that still
// need direct HTTP access (none currently).
#[allow(dead_code)]
fn _legacy_placeholder() {}
