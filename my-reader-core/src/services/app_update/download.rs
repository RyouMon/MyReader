use std::path::Path;

use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use super::{release::Release, update_error};
use crate::CoreError;

pub(super) async fn download(
    client: &reqwest::Client,
    directory: &Path,
    release: &Release,
    progress: impl Fn(u64),
) -> Result<(), CoreError> {
    let partial = directory.join(format!("{}.part", release.asset_name));
    let result = transfer(client, &partial, release, progress).await;
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(error);
    }
    let destination = directory.join(&release.asset_name);
    if destination.exists() {
        tokio::fs::remove_file(&destination).await?;
    }
    tokio::fs::rename(&partial, destination).await?;
    Ok(())
}

async fn transfer(
    client: &reqwest::Client,
    partial: &Path,
    release: &Release,
    progress: impl Fn(u64),
) -> Result<(), CoreError> {
    let mut response = client
        .get(&release.asset_url)
        .send()
        .await?
        .error_for_status()?;
    let mut file = tokio::fs::File::create(partial).await?;
    let mut hash = Sha256::new();
    let mut received = 0_u64;
    while let Some(chunk) = response.chunk().await? {
        received += chunk.len() as u64;
        if received > release.size {
            return Err(update_error("UPDATE_INTEGRITY_FAILED"));
        }
        file.write_all(&chunk).await?;
        hash.update(&chunk);
        progress(received);
    }
    file.sync_all().await?;
    if received != release.size
        || !format!("{:x}", hash.finalize()).eq_ignore_ascii_case(&release.sha256)
    {
        return Err(update_error("UPDATE_INTEGRITY_FAILED"));
    }
    Ok(())
}
