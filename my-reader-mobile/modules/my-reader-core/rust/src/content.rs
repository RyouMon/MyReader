use std::path::Path;

use my_reader_core::api::content::ContentService;

use crate::{
    types::{
        required_i64, BookCoverThumbnailCache, BookCoverThumbnailCachePatch, DownloadedFile,
        FileState, FileStateUpdate, ReadingFormat,
    },
    CoreFfiError,
};

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_list_reading_formats(
    sidecar_root_path: String,
    library_root_path: String,
) -> Result<Vec<ReadingFormat>, CoreFfiError> {
    Ok(ContentService::list_reading_formats(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(|(book_id, format)| ReadingFormat { book_id, format })
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_set_reading_format(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: Option<String>,
) -> Result<(), CoreFfiError> {
    ContentService::set_reading_format(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        format.as_deref(),
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_get_file_state(
    sidecar_root_path: String,
    path: String,
) -> Result<Option<FileState>, CoreFfiError> {
    Ok(
        ContentService::get_file_state(Path::new(&sidecar_root_path), &path)
            .await
            .map_err(CoreFfiError::from_core)?
            .map(Into::into),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_list_file_states(
    sidecar_root_path: String,
) -> Result<Vec<FileState>, CoreFfiError> {
    Ok(
        ContentService::list_file_states(Path::new(&sidecar_root_path))
            .await
            .map_err(CoreFfiError::from_core)?
            .into_iter()
            .map(Into::into)
            .collect(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_upsert_file_state(
    sidecar_root_path: String,
    path: String,
    update: FileStateUpdate,
) -> Result<(), CoreFfiError> {
    ContentService::upsert_file_state(Path::new(&sidecar_root_path), &path, update.try_into()?)
        .await
        .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_delete_file_state(
    sidecar_root_path: String,
    path: String,
) -> Result<(), CoreFfiError> {
    ContentService::delete_file_state(Path::new(&sidecar_root_path), &path)
        .await
        .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_finalize_downloaded_file(
    sidecar_root_path: String,
    relative_path: String,
    local_path: String,
) -> Result<DownloadedFile, CoreFfiError> {
    Ok(ContentService::finalize_downloaded_file(
        Path::new(&sidecar_root_path),
        &relative_path,
        Path::new(&local_path),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_mark_file_remote_only(
    sidecar_root_path: String,
    relative_path: String,
) -> Result<(), CoreFfiError> {
    ContentService::mark_file_remote_only(Path::new(&sidecar_root_path), &relative_path)
        .await
        .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_list_cover_thumbnail_cache(
    sidecar_root_path: String,
    thumbnail_version: String,
    width_px: f64,
    height_px: f64,
) -> Result<Vec<BookCoverThumbnailCache>, CoreFfiError> {
    Ok(ContentService::list_cover_thumbnail_cache(
        Path::new(&sidecar_root_path),
        &thumbnail_version,
        required_i64(width_px, "widthPx")?,
        required_i64(height_px, "heightPx")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_upsert_cover_thumbnail_cache(
    sidecar_root_path: String,
    patch: BookCoverThumbnailCachePatch,
) -> Result<(), CoreFfiError> {
    ContentService::upsert_cover_thumbnail_cache(Path::new(&sidecar_root_path), patch.try_into()?)
        .await
        .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_delete_cover_thumbnail_cache(
    sidecar_root_path: String,
    book_id: f64,
    thumbnail_version: String,
    width_px: f64,
    height_px: f64,
) -> Result<(), CoreFfiError> {
    ContentService::delete_cover_thumbnail_cache(
        Path::new(&sidecar_root_path),
        required_i64(book_id, "bookId")?,
        &thumbnail_version,
        required_i64(width_px, "widthPx")?,
        required_i64(height_px, "heightPx")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn content_clear_cover_thumbnail_cache(
    sidecar_root_path: String,
) -> Result<(), CoreFfiError> {
    ContentService::clear_cover_thumbnail_cache(Path::new(&sidecar_root_path))
        .await
        .map_err(CoreFfiError::from_core)
}
