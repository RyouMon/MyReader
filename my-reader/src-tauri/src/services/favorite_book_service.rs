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

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use crate::models::{AppConfig, LibraryConfig};

    use super::FavoriteBookService;

    fn library_config(id: &str) -> LibraryConfig {
        LibraryConfig {
            id: id.into(),
            name: id.into(),
            path: "/unused".into(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }
    }

    #[tokio::test]
    async fn list_favorite_book_ids_should_return_empty_when_no_favorites_exist() {
        let temp = tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();

        let ids = FavoriteBookService::list_favorite_book_ids(&sidecar_root)
            .await
            .expect("list should succeed");

        assert!(ids.is_empty());
    }

    #[tokio::test]
    async fn add_and_list_favorite_books_should_round_trip_book_ids() {
        let temp = tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();

        FavoriteBookService::add_favorite_book(&sidecar_root, 7)
            .await
            .expect("add should succeed");
        FavoriteBookService::add_favorite_book(&sidecar_root, 42)
            .await
            .expect("add should succeed");

        let ids = FavoriteBookService::list_favorite_book_ids(&sidecar_root)
            .await
            .expect("list should succeed");

        assert_eq!(ids, vec![7, 42]);
    }

    #[tokio::test]
    async fn add_favorite_book_should_be_idempotent_when_book_already_favorited() {
        let temp = tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();

        FavoriteBookService::add_favorite_book(&sidecar_root, 7)
            .await
            .expect("first add should succeed");
        FavoriteBookService::add_favorite_book(&sidecar_root, 7)
            .await
            .expect("second add should succeed");

        let ids = FavoriteBookService::list_favorite_book_ids(&sidecar_root)
            .await
            .expect("list should succeed");

        assert_eq!(ids, vec![7]);
    }

    #[tokio::test]
    async fn remove_favorite_book_should_delete_record_and_be_idempotent() {
        let temp = tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();

        FavoriteBookService::add_favorite_book(&sidecar_root, 7)
            .await
            .expect("add should succeed");
        FavoriteBookService::remove_favorite_book(&sidecar_root, 7)
            .await
            .expect("remove should succeed");
        FavoriteBookService::remove_favorite_book(&sidecar_root, 7)
            .await
            .expect("second remove should succeed");

        let ids = FavoriteBookService::list_favorite_book_ids(&sidecar_root)
            .await
            .expect("list should succeed");

        assert!(ids.is_empty());
    }

    #[tokio::test]
    async fn list_favorite_book_ids_for_library_should_return_empty_when_no_favorites_exist() {
        let temp = tempdir().unwrap();
        let lib = library_config("lib-fav-1");
        let config = AppConfig {
            libraries: vec![lib.clone()],
            active_library_id: Some(lib.id.clone()),
            ..Default::default()
        };

        let ids = FavoriteBookService::list_favorite_book_ids_for_library(
            temp.path(),
            &config,
            Some(&lib.id),
        )
        .await
        .expect("list should succeed");

        assert!(ids.is_empty());
    }

    #[tokio::test]
    async fn add_and_list_favorite_books_for_library_should_round_trip_book_ids() {
        let temp = tempdir().unwrap();
        let lib = library_config("lib-fav-2");
        let config = AppConfig {
            libraries: vec![lib.clone()],
            active_library_id: Some(lib.id.clone()),
            ..Default::default()
        };

        FavoriteBookService::add_favorite_book_for_library(temp.path(), &config, Some(&lib.id), 7)
            .await
            .expect("add should succeed");
        FavoriteBookService::add_favorite_book_for_library(temp.path(), &config, Some(&lib.id), 42)
            .await
            .expect("add should succeed");

        let ids = FavoriteBookService::list_favorite_book_ids_for_library(
            temp.path(),
            &config,
            Some(&lib.id),
        )
        .await
        .expect("list should succeed");

        assert_eq!(ids, vec![7, 42]);
    }

    #[tokio::test]
    async fn remove_favorite_book_for_library_should_delete_record() {
        let temp = tempdir().unwrap();
        let lib = library_config("lib-fav-3");
        let config = AppConfig {
            libraries: vec![lib.clone()],
            active_library_id: Some(lib.id.clone()),
            ..Default::default()
        };

        FavoriteBookService::add_favorite_book_for_library(temp.path(), &config, Some(&lib.id), 7)
            .await
            .expect("add should succeed");
        FavoriteBookService::remove_favorite_book_for_library(
            temp.path(),
            &config,
            Some(&lib.id),
            7,
        )
        .await
        .expect("remove should succeed");

        let ids = FavoriteBookService::list_favorite_book_ids_for_library(
            temp.path(),
            &config,
            Some(&lib.id),
        )
        .await
        .expect("list should succeed");

        assert!(ids.is_empty());
    }

    #[tokio::test]
    async fn favorite_book_operations_for_library_should_resolve_active_library_when_id_is_none() {
        let temp = tempdir().unwrap();
        let lib = library_config("lib-fav-4");
        let config = AppConfig {
            libraries: vec![lib.clone()],
            active_library_id: Some(lib.id.clone()),
            ..Default::default()
        };

        FavoriteBookService::add_favorite_book_for_library(temp.path(), &config, None, 7)
            .await
            .expect("add should succeed");
        let ids = FavoriteBookService::list_favorite_book_ids_for_library(temp.path(), &config, None)
            .await
            .expect("list should succeed");
        FavoriteBookService::remove_favorite_book_for_library(temp.path(), &config, None, 7)
            .await
            .expect("remove should succeed");

        assert_eq!(ids, vec![7]);
    }

    #[tokio::test]
    async fn favorite_book_operations_for_library_should_return_not_found_when_no_active_library() {
        let temp = tempdir().unwrap();
        let config = AppConfig::default();

        let err = FavoriteBookService::list_favorite_book_ids_for_library(temp.path(), &config, None)
            .await
            .expect_err("should fail without active library");
        assert!(format!("{err}").contains("NO_ACTIVE_LIBRARY"));

        let err = FavoriteBookService::add_favorite_book_for_library(temp.path(), &config, None, 7)
            .await
            .expect_err("should fail without active library");
        assert!(format!("{err}").contains("NO_ACTIVE_LIBRARY"));

        let err = FavoriteBookService::remove_favorite_book_for_library(temp.path(), &config, None, 7)
            .await
            .expect_err("should fail without active library");
        assert!(format!("{err}").contains("NO_ACTIVE_LIBRARY"));
    }

    #[tokio::test]
    async fn favorite_book_operations_for_library_should_return_not_found_when_library_id_unknown() {
        let temp = tempdir().unwrap();
        let lib = library_config("lib-fav-5");
        let config = AppConfig {
            libraries: vec![lib.clone()],
            active_library_id: Some(lib.id.clone()),
            ..Default::default()
        };

        let err = FavoriteBookService::list_favorite_book_ids_for_library(
            temp.path(),
            &config,
            Some("ghost"),
        )
        .await
        .expect_err("should fail for unknown library");
        assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));

        let err = FavoriteBookService::add_favorite_book_for_library(
            temp.path(),
            &config,
            Some("ghost"),
            7,
        )
        .await
        .expect_err("should fail for unknown library");
        assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));

        let err = FavoriteBookService::remove_favorite_book_for_library(
            temp.path(),
            &config,
            Some("ghost"),
            7,
        )
        .await
        .expect_err("should fail for unknown library");
        assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));
    }

    #[test]
    fn library_sidecar_path_should_reside_under_app_data_dir() {
        use std::path::Path;
        let app_data = Path::new("/app-data");
        let lib = library_config("lib-fav-6");
        let sidecar = crate::utils::paths::library_sidecar_path(&lib, app_data);
        assert_eq!(sidecar, app_data.join("libraries").join("lib-fav-6"));
    }
}
