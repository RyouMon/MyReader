use std::path::{Path, PathBuf};

use futures::stream::{self, StreamExt};
use tracing::{info, warn};

use crate::error::AppError;
use crate::models::DataSourceConfig;
use crate::utils::http::{build_client, build_list_url, extract_credentials, send_get};

/// Local cache directory for a WebDAV library's metadata.db.
pub fn webdav_cache_dir(app_data_dir: &Path, library_id: &str) -> Result<PathBuf, AppError> {
    let dir = app_data_dir.join("webdav-cache").join(library_id);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Download metadata.db from WebDAV via direct HTTP GET.
pub async fn download_metadata_db(
    source: &DataSourceConfig,
    remote_path: &str,
    dest: &Path,
) -> Result<(), AppError> {
    let creds = extract_credentials(source)?;

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

    let target_url = build_list_url(&creds.endpoint, creds.root_path.as_deref(), &metadata_rel)?;

    info!("Downloading metadata.db via HTTP GET. url: \"{target_url}\"");

    let client = build_client(30)?;
    let response = send_get(&client, &target_url, &creds.username, &creds.password).await?;

    let status = response.status();
    if status != reqwest::StatusCode::OK {
        return Err(AppError::Config(format!(
            "WEBDAV_METADATA_DOWNLOAD_FAILED: HTTP {} for {target_url}",
            status.as_u16()
        )));
    }

    let bytes = response.bytes().await.map_err(|err| {
        AppError::Config(format!("WEBDAV_READ_BODY_FAILED: {err}"))
    })?;

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, &bytes)?;

    info!(
        "Downloaded metadata.db. bytes: {}, dest: \"{}\"",
        bytes.len(),
        dest.display()
    );

    Ok(())
}

/// Bulk-download all book covers from WebDAV to the local cache directory.
/// Covers are stored at `{cache_dir}/{book_path}/cover.jpg`, mirroring the
/// Calibre directory layout so the bookcover_handler can serve them directly.
/// Downloads up to 8 covers concurrently for speed.
pub async fn download_all_covers(
    source: &DataSourceConfig,
    remote_path: &str,
    cache_dir: &Path,
    summaries: &[crate::repositories::calibre_repo::CoverSummary],
) {
    let creds = match extract_credentials(source) {
        Ok(c) => c,
        Err(_) => {
            warn!("Skipping cover download: cannot extract WebDAV credentials");
            return;
        }
    };

    let client = build_client(15).unwrap_or_default();

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
            let url = build_list_url(
                &creds.endpoint,
                creds.root_path.as_deref(),
                &cover_rel,
            )
            .ok()?;
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

            Some((url.to_string(), local_path))
        })
        .collect();

    let total = to_download.len();
    if total == 0 {
        info!("All covers already cached, nothing to download");
        return;
    }

    info!("Starting bulk cover download. covers to fetch: {total}");

    let username = creds.username.clone();
    let password = creds.password.clone();

    let results: Vec<bool> = stream::iter(to_download)
        .map(|(url, local_path)| {
            let username = username.clone();
            let password = password.clone();
            let client = &client;
            async move {
                // Create parent dir
                if let Some(parent) = local_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }

                let result = client
                    .get(&url)
                    .basic_auth(&username, Some(&password))
                    .send()
                    .await;

                match result {
                    Ok(response) => {
                        if response.status() == reqwest::StatusCode::OK {
                            match response.bytes().await {
                                Ok(bytes) => std::fs::write(&local_path, &bytes).is_ok(),
                                Err(_) => false,
                            }
                        } else {
                            false
                        }
                    }
                    Err(_) => false,
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