use std::path::Path;

use crate::error::AppError;
use crate::models::AppConfig;
use crate::repositories::favorite_book_repo::SqliteFavoriteBookRepository;
use crate::services::library_service::LibraryService;
use crate::utils::paths::library_sidecar_path;

pub struct FavoriteBookService;

impl FavoriteBookService {
    pub async fn list_favorite_book_ids(sidecar_root: &str) -> Result<Vec<i64>, AppError> {
        let db = SqliteFavoriteBookRepository::open(sidecar_root).await?;
        SqliteFavoriteBookRepository::list_book_ids(&db).await
    }

    pub async fn add_favorite_book(sidecar_root: &str, book_id: i64) -> Result<(), AppError> {
        let db = SqliteFavoriteBookRepository::open(sidecar_root).await?;
        SqliteFavoriteBookRepository::add(&db, book_id).await
    }

    pub async fn remove_favorite_book(sidecar_root: &str, book_id: i64) -> Result<(), AppError> {
        let db = SqliteFavoriteBookRepository::open(sidecar_root).await?;
        SqliteFavoriteBookRepository::remove(&db, book_id).await
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

    pub async fn add_favorite_book_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
    ) -> Result<(), AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::add_favorite_book(&sidecar_root, book_id).await
    }

    pub async fn remove_favorite_book_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: Option<&str>,
        book_id: i64,
    ) -> Result<(), AppError> {
        let lib = LibraryService::resolve_library(library_id, config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir)
            .to_string_lossy()
            .to_string();
        Self::remove_favorite_book(&sidecar_root, book_id).await
    }
}
