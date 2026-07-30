use std::path::Path;

use myreader_core::models::ReaderBookmark;

use crate::error::AppError;
use crate::models::{AppConfig, ReaderBookmarkDto};
use crate::services::library_service::LibraryService;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct BookmarkService;

fn bookmark_dto(library_id: &str, bookmark: ReaderBookmark) -> ReaderBookmarkDto {
    ReaderBookmarkDto {
        id: bookmark.id,
        library_id: library_id.to_owned(),
        book_id: bookmark.book_id,
        format: bookmark.format,
        locator_key: bookmark.locator_key,
        locator: bookmark.locator,
        created_at: bookmark.created_at,
        updated_at: bookmark.updated_at,
    }
}

impl BookmarkService {
    pub async fn list_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReaderBookmarkDto>, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        Ok(
            myreader_core::api::reading::list_reader_bookmarks(&sidecar_root, book_id, format)
                .await?
                .into_iter()
                .map(|bookmark| bookmark_dto(&library.id, bookmark))
                .collect(),
        )
    }

    pub async fn add_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        locator_key: &str,
        locator: &serde_json::Value,
    ) -> Result<ReaderBookmarkDto, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        let locator_json = serde_json::to_string(locator)?;
        let bookmark = myreader_core::api::reading::add_reader_bookmark(
            &sidecar_root,
            &library_root,
            book_id,
            format,
            locator_key,
            &locator_json,
            unix_epoch_millis(),
        )
        .await?;
        Ok(bookmark_dto(&library.id, bookmark))
    }

    pub async fn delete_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        locator_key: &str,
    ) -> Result<(), AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        myreader_core::api::reading::remove_reader_bookmark(
            &sidecar_root,
            &library_root,
            book_id,
            format,
            locator_key,
            unix_epoch_millis(),
        )
        .await?;
        Ok(())
    }
}

fn unix_epoch_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}
