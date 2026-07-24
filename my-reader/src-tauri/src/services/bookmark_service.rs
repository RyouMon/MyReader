use std::path::Path;

use sea_orm::DatabaseConnection;

use crate::entities::app::bookmarks;
use crate::error::AppError;
use crate::models::{is_valid_reader_locator, AppConfig, LibraryConfig, ReaderBookmarkDto};
use crate::repositories::{
    bookmark_repo::SqliteBookmarkRepository, calibre_repo::CalibreBookRepository,
};
use crate::services::library_service::LibraryService;
use crate::sync::{
    bookmark::{add_local_bookmark, remove_local_bookmark},
    contract::ReaderLocator,
    kernel::read_replica_identity,
};
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct BookmarkService;

fn unix_epoch_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64)
}

fn normalize_format(format: &str) -> Result<String, AppError> {
    let normalized = format.trim().to_ascii_uppercase();
    if normalized.is_empty() {
        return Err(AppError::Config("INVALID_BOOKMARK_FORMAT".into()));
    }
    Ok(normalized)
}

fn validate_locator(locator: &serde_json::Value) -> Result<(), AppError> {
    if !is_valid_reader_locator(locator) {
        return Err(AppError::Config("INVALID_BOOKMARK_LOCATOR".into()));
    }
    Ok(())
}

fn validate_locator_key(locator_key: &str) -> Result<&str, AppError> {
    let locator_key = locator_key.trim();
    if locator_key.is_empty() || locator_key.len() > 2048 {
        return Err(AppError::Config("INVALID_BOOKMARK_LOCATOR_KEY".into()));
    }
    Ok(locator_key)
}

fn bookmark_dto(library_id: &str, model: bookmarks::Model) -> Result<ReaderBookmarkDto, AppError> {
    let locator = serde_json::from_str(&model.locator_json)
        .map_err(|e| AppError::Serialize(e.to_string()))?;
    Ok(ReaderBookmarkDto {
        id: model.id,
        library_id: library_id.to_string(),
        book_id: model.book_id,
        format: model.format,
        locator_key: model.locator_key,
        locator,
        created_at: model.created_at,
        updated_at: model.updated_at,
    })
}

impl BookmarkService {
    async fn sync_context(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
    ) -> Result<(LibraryConfig, DatabaseConnection, String), AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir)
            .to_string_lossy()
            .to_string();
        let db = SqliteBookmarkRepository::open(&sidecar_root).await?;
        let library_uuid = match read_replica_identity(&db).await? {
            Some(identity) => identity.library_uuid,
            None => {
                let library_root = library_root_path(&library, app_data_dir)
                    .to_string_lossy()
                    .to_string();
                CalibreBookRepository::open(&library_root)
                    .await?
                    .get_library_uuid()
                    .await?
            }
        };
        Ok((library, db, library_uuid))
    }

    pub async fn list(
        sidecar_root: &str,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReaderBookmarkDto>, AppError> {
        let format = normalize_format(format)?;
        let db = SqliteBookmarkRepository::open(sidecar_root).await?;
        SqliteBookmarkRepository::list(&db, book_id, &format)
            .await?
            .into_iter()
            .map(|model| bookmark_dto(library_id, model))
            .collect()
    }

    pub async fn add(
        sidecar_root: &str,
        library_id: &str,
        book_id: i64,
        format: &str,
        locator_key: &str,
        locator: &serde_json::Value,
    ) -> Result<ReaderBookmarkDto, AppError> {
        let format = normalize_format(format)?;
        let locator_key = validate_locator_key(locator_key)?;
        validate_locator(locator)?;
        let locator_json =
            serde_json::to_string(locator).map_err(|e| AppError::Serialize(e.to_string()))?;
        let db = SqliteBookmarkRepository::open(sidecar_root).await?;
        let model = SqliteBookmarkRepository::upsert(
            &db,
            book_id,
            &format,
            locator_key,
            &locator_json,
            unix_epoch_millis() as f64,
        )
        .await?;
        bookmark_dto(library_id, model)
    }

    pub async fn delete(
        sidecar_root: &str,
        book_id: i64,
        format: &str,
        locator_key: &str,
    ) -> Result<(), AppError> {
        let format = normalize_format(format)?;
        let locator_key = validate_locator_key(locator_key)?;
        let db = SqliteBookmarkRepository::open(sidecar_root).await?;
        if SqliteBookmarkRepository::tombstone(
            &db,
            book_id,
            &format,
            locator_key,
            unix_epoch_millis() as f64,
        )
        .await?
        {
            Ok(())
        } else {
            Err(AppError::NotFound("BOOKMARK_NOT_FOUND".into()))
        }
    }

    pub async fn list_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<ReaderBookmarkDto>, AppError> {
        let library = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&library, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::list(&sidecar_root, &library.id, book_id, format).await
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
        let format = normalize_format(format)?;
        let locator_key = validate_locator_key(locator_key)?;
        validate_locator(locator)?;
        let locator: ReaderLocator = serde_json::from_value(locator.clone())
            .map_err(|error| AppError::Serialize(error.to_string()))?;
        let (library, db, library_uuid) =
            Self::sync_context(app_data_dir, config, library_id).await?;
        let model = add_local_bookmark(
            &db,
            &library_uuid,
            book_id,
            &format,
            locator_key,
            locator,
            unix_epoch_millis(),
        )
        .await?;
        bookmark_dto(&library.id, model)
    }

    pub async fn delete_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        format: &str,
        locator_key: &str,
    ) -> Result<(), AppError> {
        let format = normalize_format(format)?;
        let locator_key = validate_locator_key(locator_key)?;
        let (_library, db, library_uuid) =
            Self::sync_context(app_data_dir, config, library_id).await?;
        if remove_local_bookmark(
            &db,
            &library_uuid,
            book_id,
            &format,
            locator_key,
            unix_epoch_millis(),
        )
        .await?
        {
            Ok(())
        } else {
            Err(AppError::NotFound("BOOKMARK_NOT_FOUND".into()))
        }
    }
}
