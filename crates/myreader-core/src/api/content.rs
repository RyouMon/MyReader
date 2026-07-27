use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use crate::models::{FileState, FileStateUpdate};
use crate::{services, CoreError};

pub async fn list_reading_formats(
    sidecar_root: &Path,
    library_root: &Path,
) -> Result<BTreeMap<String, String>, CoreError> {
    services::content::list_reading_formats(sidecar_root, library_root).await
}

pub async fn set_reading_format(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: Option<&str>,
) -> Result<(), CoreError> {
    services::content::set_reading_format(sidecar_root, library_root, book_id, format).await
}

pub async fn get_file_state(
    sidecar_root: &Path,
    path: &str,
) -> Result<Option<FileState>, CoreError> {
    services::content::get_file_state(sidecar_root, path).await
}

pub async fn get_file_states(
    sidecar_root: &Path,
    paths: &[String],
) -> Result<HashMap<String, FileState>, CoreError> {
    Ok(services::content::get_file_states(sidecar_root, paths)
        .await?
        .into_iter()
        .collect())
}

pub async fn list_file_states(sidecar_root: &Path) -> Result<Vec<FileState>, CoreError> {
    services::content::list_file_states(sidecar_root).await
}

pub async fn upsert_file_state(
    sidecar_root: &Path,
    path: &str,
    update: FileStateUpdate,
) -> Result<(), CoreError> {
    services::content::upsert_file_state(sidecar_root, path, update).await
}

pub async fn delete_file_state(sidecar_root: &Path, path: &str) -> Result<(), CoreError> {
    services::content::delete_file_state(sidecar_root, path).await
}
