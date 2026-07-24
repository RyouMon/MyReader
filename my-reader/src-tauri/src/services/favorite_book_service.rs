use std::path::Path;

use crate::error::AppError;
use crate::models::AppConfig;
use crate::repositories::{
    calibre_repo::CalibreBookRepository, favorite_book_repo::SqliteFavoriteBookRepository,
};
use crate::services::library_service::LibraryService;
use crate::sync::{favorite::write_local_favorite, replica_identity::read_replica_identity};
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct FavoriteBookService;

impl FavoriteBookService {
    fn unix_epoch_millis() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_millis() as u64)
    }

    pub async fn list_favorite_book_ids(sidecar_root: &str) -> Result<Vec<i64>, AppError> {
        let db = SqliteFavoriteBookRepository::open(sidecar_root).await?;
        SqliteFavoriteBookRepository::list_book_ids(&db).await
    }

    pub async fn list_favorite_book_ids_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
    ) -> Result<Vec<i64>, AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::list_favorite_book_ids(&sidecar_root).await
    }

    async fn write_favorite_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
        is_favorite: bool,
    ) -> Result<(), AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        let db = SqliteFavoriteBookRepository::open(&sidecar_root).await?;
        let library_uuid = match read_replica_identity(&db).await? {
            Some(identity) => identity.library_uuid,
            None => {
                let library_root = library_root_path(&lib, app_data_dir)
                    .to_string_lossy()
                    .to_string();
                CalibreBookRepository::open(&library_root)
                    .await?
                    .get_library_uuid()
                    .await?
            }
        };
        write_local_favorite(
            &db,
            &library_uuid,
            book_id,
            is_favorite,
            Self::unix_epoch_millis(),
        )
        .await
    }

    pub async fn add_favorite_book_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
    ) -> Result<(), AppError> {
        Self::write_favorite_for_library(app_data_dir, config, library_id, book_id, true).await
    }

    pub async fn remove_favorite_book_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
    ) -> Result<(), AppError> {
        Self::write_favorite_for_library(app_data_dir, config, library_id, book_id, false).await
    }
}
