use std::path::Path;

use tauri::AppHandle;

use crate::asset_scope;
use crate::error::AppError;
use crate::models::{AppConfig, LibraryConfig, LibraryInfo};
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};
use crate::utils::io::download_metadata_db;
use crate::utils::paths::{library_container_dir, library_metadata_db_path, library_root_path};
use crate::{cache, db};

pub struct LibraryService;

impl LibraryService {
    pub async fn list_libraries(config: &AppConfig) -> Result<Vec<LibraryInfo>, AppError> {
        let mut infos = Vec::new();
        for lib in &config.libraries {
            let book_count = match CalibreBookRepository::open(&lib.path).await {
                Ok(repo) => repo.get_book_count().await.unwrap_or(0),
                Err(_) => 0,
            };
            infos.push(LibraryInfo {
                id: lib.id.clone(),
                name: lib.name.clone(),
                path: lib.path.clone(),
                book_count,
                source_type: lib.source_type.clone(),
                data_source_id: lib.data_source_id.clone(),
                source_path: lib.source_path.clone(),
            });
        }
        Ok(infos)
    }

    pub async fn add_library(
        app_data_dir: &Path,
        path: &str,
        name: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let canon_path = dunce::canonicalize(path)
            .map_err(|e| AppError::Config(format!("INVALID_LIBRARY_PATH: {e}")))?;
        let canon_str = canon_path.to_string_lossy().to_string();

        if !CalibreBookRepository::validate_library(&canon_str) {
            return Err(AppError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                canon_str
            )));
        }

        let lib_name = name.map(ToString::to_string).unwrap_or_else(|| {
            canon_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unnamed Library")
                .to_string()
        });

        if config.libraries.iter().any(|l| l.path == canon_str) {
            return Err(AppError::Config("LIBRARY_ALREADY_EXISTS".into()));
        }

        let id = uuid::Uuid::new_v4().to_string();

        // Sidecar lives in the app container for all library types.
        let sidecar_root = library_container_dir(app_data_dir, &id);
        std::fs::create_dir_all(&sidecar_root)?;
        db::ensure_library_data_dir(sidecar_root.to_str().unwrap_or(&id))?;

        let book_count = match CalibreBookRepository::open(&canon_str).await {
            Ok(repo) => repo.get_book_count().await.unwrap_or(0),
            Err(_) => 0,
        };

        config.libraries.push(LibraryConfig {
            id: id.clone(),
            name: lib_name.clone(),
            path: canon_str.clone(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        });
        if config.active_library_id.is_none() {
            config.active_library_id = Some(id.clone());
        }

        Ok(LibraryInfo {
            id,
            name: lib_name,
            path: canon_str,
            book_count,
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        })
    }

    /// Add a local library and refresh the asset protocol scope so the reader can fetch files.
    pub async fn add_library_with_scope_sync<R: tauri::Runtime>(
        app: &AppHandle<R>,
        app_data_dir: &Path,
        path: &str,
        name: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let info = Self::add_library(app_data_dir, path, name, config).await?;
        if let Err(e) = asset_scope::sync_for_reader_libraries(app, &config.libraries) {
            tracing::error!("Failed to extend asset protocol scope after adding library. error: {e}");
        }
        Ok(info)
    }

    /// Add a WebDAV library: download metadata.db into the app container.
    pub async fn add_webdav_library(
        app_data_dir: &Path,
        data_source_id: &str,
        remote_path: &str,
        name: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let source = config
            .data_sources
            .iter()
            .find(|s| s.id == data_source_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", data_source_id))
            })?;

        let id = uuid::Uuid::new_v4().to_string();
        let cache_dir = library_container_dir(app_data_dir, &id);
        std::fs::create_dir_all(&cache_dir)?;
        let db_path = cache_dir.join("metadata.db");

        download_metadata_db(source, remote_path, &db_path).await?;

        let cache_str = cache_dir.to_string_lossy().to_string();

        let lib_name = name.map(ToString::to_string).unwrap_or_else(|| {
            remote_path
                .trim_end_matches('/')
                .split('/')
                .filter(|s| !s.is_empty())
                .next_back()
                .unwrap_or("WebDAV Library")
                .to_string()
        });

        if config.libraries.iter().any(|l| l.path == cache_str) {
            return Err(AppError::Config("LIBRARY_ALREADY_EXISTS".into()));
        }

        db::ensure_library_data_dir(&cache_str)?;

        let book_count = match CalibreBookRepository::open(&cache_str).await {
            Ok(repo) => repo.get_book_count().await.unwrap_or(0),
            Err(_) => 0,
        };

        config.libraries.push(LibraryConfig {
            id: id.clone(),
            name: lib_name.clone(),
            path: cache_str.clone(),
            source_type: Some("webdav".into()),
            data_source_id: Some(data_source_id.to_string()),
            source_path: Some(remote_path.to_string()),
        });
        if config.active_library_id.is_none() {
            config.active_library_id = Some(id.clone());
        }

        Ok(LibraryInfo {
            id,
            name: lib_name,
            path: cache_str,
            book_count,
            source_type: Some("webdav".into()),
            data_source_id: Some(data_source_id.to_string()),
            source_path: Some(remote_path.to_string()),
        })
    }

    /// Add a WebDAV library and refresh the asset protocol scope.
    pub async fn add_webdav_library_with_scope_sync<R: tauri::Runtime>(
        app: &AppHandle<R>,
        app_data_dir: &Path,
        data_source_id: &str,
        remote_path: &str,
        name: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let info = Self::add_webdav_library(app_data_dir, data_source_id, remote_path, name, config).await?;
        if let Err(e) = asset_scope::sync_for_reader_libraries(app, &config.libraries) {
            tracing::error!("Failed to extend asset protocol scope after adding WebDAV library. error: {e}");
        }
        Ok(info)
    }

    /// Add a OneDrive library: download metadata.db into the app container.
    pub async fn add_onedrive_library(
        app_data_dir: &Path,
        data_source_id: &str,
        remote_path: &str,
        name: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let source = config
            .data_sources
            .iter()
            .find(|s| s.id == data_source_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", data_source_id))
            })?;

        let id = uuid::Uuid::new_v4().to_string();
        let cache_dir = library_container_dir(app_data_dir, &id);
        std::fs::create_dir_all(&cache_dir)?;
        let db_path = cache_dir.join("metadata.db");

        download_metadata_db(source, remote_path, &db_path).await?;

        let cache_str = cache_dir.to_string_lossy().to_string();

        let lib_name = name.map(ToString::to_string).unwrap_or_else(|| {
            remote_path
                .trim_end_matches('/')
                .split('/')
                .filter(|s| !s.is_empty())
                .next_back()
                .unwrap_or("OneDrive Library")
                .to_string()
        });

        if config.libraries.iter().any(|l| l.path == cache_str) {
            return Err(AppError::Config("LIBRARY_ALREADY_EXISTS".into()));
        }

        db::ensure_library_data_dir(&cache_str)?;

        let book_count = match CalibreBookRepository::open(&cache_str).await {
            Ok(repo) => repo.get_book_count().await.unwrap_or(0),
            Err(_) => 0,
        };

        config.libraries.push(LibraryConfig {
            id: id.clone(),
            name: lib_name.clone(),
            path: cache_str.clone(),
            source_type: Some("onedrive".into()),
            data_source_id: Some(data_source_id.to_string()),
            source_path: Some(remote_path.to_string()),
        });
        if config.active_library_id.is_none() {
            config.active_library_id = Some(id.clone());
        }

        Ok(LibraryInfo {
            id,
            name: lib_name,
            path: cache_str,
            book_count,
            source_type: Some("onedrive".into()),
            data_source_id: Some(data_source_id.to_string()),
            source_path: Some(remote_path.to_string()),
        })
    }

    /// Add a OneDrive library and refresh the asset protocol scope.
    pub async fn add_onedrive_library_with_scope_sync<R: tauri::Runtime>(
        app: &AppHandle<R>,
        app_data_dir: &Path,
        data_source_id: &str,
        remote_path: &str,
        name: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let info = Self::add_onedrive_library(app_data_dir, data_source_id, remote_path, name, config).await?;
        if let Err(e) = asset_scope::sync_for_reader_libraries(app, &config.libraries) {
            tracing::error!("Failed to extend asset protocol scope after adding OneDrive library. error: {e}");
        }
        Ok(info)
    }

    /// Refresh a WebDAV library: re-download metadata.db.
    pub async fn refresh_webdav_library(
        app_data_dir: &Path,
        id: &str,
        config: &AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", id)))?;

        let data_source_id = lib.data_source_id.as_deref().ok_or_else(|| {
            AppError::Config("WEBDAV_LIBRARY_MISSING_DATASOURCE".into())
        })?;
        let remote_path = lib.source_path.as_deref().ok_or_else(|| {
            AppError::Config("WEBDAV_LIBRARY_MISSING_SOURCE_PATH".into())
        })?;

        let source = config
            .data_sources
            .iter()
            .find(|s| s.id == data_source_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", data_source_id))
            })?;

        let cache_dir = library_container_dir(app_data_dir, id);
        let db_path = library_metadata_db_path(lib, app_data_dir);

        download_metadata_db(source, remote_path, &db_path).await?;

        let cache_str = cache_dir.to_string_lossy().to_string();
        let repo = CalibreBookRepository::open(&cache_str).await?;
        let book_count = repo.get_book_count().await?;
        let book_ids: Vec<i64> = repo.get_all_books().await?.iter().map(|b| b.id).collect();

        cache::clear_orphaned_library_cache_files(id, &book_ids)?;

        let lib_name = remote_path
            .trim_end_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .next_back()
            .unwrap_or("WebDAV Library")
            .to_string();

        Ok(LibraryInfo {
            id: id.to_string(),
            name: lib_name,
            path: cache_str,
            book_count,
            source_type: lib.source_type.clone(),
            data_source_id: lib.data_source_id.clone(),
            source_path: lib.source_path.clone(),
        })
    }

    /// Refresh a OneDrive library: re-download metadata.db.
    pub async fn refresh_onedrive_library(
        app_data_dir: &Path,
        id: &str,
        config: &AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", id)))?;

        let data_source_id = lib.data_source_id.as_deref().ok_or_else(|| {
            AppError::Config("ONEDRIVE_LIBRARY_MISSING_DATASOURCE".into())
        })?;
        let remote_path = lib.source_path.as_deref().ok_or_else(|| {
            AppError::Config("ONEDRIVE_LIBRARY_MISSING_SOURCE_PATH".into())
        })?;

        let source = config
            .data_sources
            .iter()
            .find(|s| s.id == data_source_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", data_source_id))
            })?;

        let cache_dir = library_container_dir(app_data_dir, id);
        let db_path = library_metadata_db_path(lib, app_data_dir);

        download_metadata_db(source, remote_path, &db_path).await?;

        let cache_str = cache_dir.to_string_lossy().to_string();
        let repo = CalibreBookRepository::open(&cache_str).await?;
        let book_count = repo.get_book_count().await?;
        let book_ids: Vec<i64> = repo.get_all_books().await?.iter().map(|b| b.id).collect();

        cache::clear_orphaned_library_cache_files(id, &book_ids)?;

        let lib_name = remote_path
            .trim_end_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .next_back()
            .unwrap_or("OneDrive Library")
            .to_string();

        Ok(LibraryInfo {
            id: id.to_string(),
            name: lib_name,
            path: cache_str,
            book_count,
            source_type: lib.source_type.clone(),
            data_source_id: lib.data_source_id.clone(),
            source_path: lib.source_path.clone(),
        })
    }

    pub async fn refresh_library(id: &str, config: &AppConfig) -> Result<LibraryInfo, AppError> {
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", id)))?;

        if lib.source_type.as_deref() == Some("webdav") {
            return Err(AppError::Config(
                "WEBDAV_LIBRARY_USE_ASYNC_REFRESH".into(),
            ));
        }

        let lib_path = lib.path.clone();
        let lib_path_canon = dunce::canonicalize(&lib_path)
            .map_err(|e| AppError::Config(format!("INVALID_LIBRARY_PATH: {e}")))?;
        let lib_path_str = lib_path_canon.to_string_lossy().to_string();

        if !CalibreBookRepository::validate_library(&lib_path_str) {
            return Err(AppError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                lib_path_str
            )));
        }

        let repo = CalibreBookRepository::open(&lib_path_str).await?;
        let books = repo.get_all_books().await?;
        let book_count = books.len();
        let book_ids: Vec<i64> = books.iter().map(|book| book.id).collect();

        cache::clear_orphaned_library_cache_files(id, &book_ids)?;

        let lib_name = lib_path_canon
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unnamed Library")
            .to_string();

        Ok(LibraryInfo {
            id: id.to_string(),
            name: lib_name,
            path: lib_path_str,
            book_count,
            source_type: lib.source_type.clone(),
            data_source_id: lib.data_source_id.clone(),
            source_path: lib.source_path.clone(),
        })
    }

    pub fn remove_library(
        app_data_dir: &Path,
        id: &str,
        config: &mut AppConfig,
    ) -> Result<(), AppError> {
        config.libraries.retain(|lib| lib.id != id);
        cache::clear_library_cache_files(id)?;
        let container = library_container_dir(app_data_dir, id);
        if container.exists() {
            std::fs::remove_dir_all(&container)?;
        }

        if config.active_library_id.as_ref() == Some(&id.to_string()) {
            config.active_library_id = config.libraries.first().map(|lib| lib.id.clone());
        }

        Ok(())
    }

    pub fn switch_library(id: &str, config: &mut AppConfig) -> Result<(), AppError> {
        if !config.libraries.iter().any(|lib| lib.id == id) {
            return Err(AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", id)));
        }
        config.active_library_id = Some(id.to_string());
        Ok(())
    }

    pub fn resolve_library_path(
        library_id: Option<&str>,
        app_data_dir: &Path,
        config: &AppConfig,
    ) -> Result<(String, String), AppError> {
        let lib_id = library_id
            .map(ToString::to_string)
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("NO_ACTIVE_LIBRARY".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", lib_id)))?;

        let root = library_root_path(lib, app_data_dir);
        Ok((lib_id, root.to_string_lossy().to_string()))
    }
    pub fn resolve_library(
        library_id: Option<&str>,
        config: &AppConfig,
    ) -> Result<LibraryConfig, AppError> {
        let lib_id = library_id
            .map(ToString::to_string)
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("NO_ACTIVE_LIBRARY".into()))?;

        config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", lib_id)))
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use sea_orm::ConnectionTrait;
    use tempfile::tempdir;

    use super::*;

    fn mock_app_handle() -> tauri::AppHandle<tauri::test::MockRuntime> {
        tauri::test::mock_app().handle().clone()
    }

    async fn create_minimal_calibre_library(root: &std::path::Path) {
        let db_path = root.join("metadata.db");
        let url = format!("sqlite://{}?mode=rwc", db_path.to_str().expect("valid utf8"));
        let db = sea_orm::Database::connect(&url)
            .await
            .expect("connect to setup db");
        let schema = "
            CREATE TABLE books (id INTEGER PRIMARY KEY, path TEXT);
            CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER NOT NULL, format TEXT NOT NULL, uncompressed_size INTEGER NOT NULL, name TEXT NOT NULL);
        ";
        db.execute_unprepared(schema)
            .await
            .expect("create calibre schema");
        db.execute_unprepared("INSERT INTO books (id, path) VALUES (1, 'It');")
            .await
            .expect("insert book");
        db.execute_unprepared("INSERT INTO data (id, book, format, uncompressed_size, name) VALUES (1, 1, 'EPUB', 12, 'It');")
            .await
            .expect("insert data");
    }

    #[tokio::test]
    async fn add_library_with_scope_sync_should_return_same_info_as_add_library() {
        let app = mock_app_handle();
        let app_data = tempdir().unwrap();
        let lib_root = tempdir().unwrap();
        create_minimal_calibre_library(lib_root.path()).await;
        let mut config = AppConfig::default();

        let mut config_without_sync = config.clone();
        let info_direct = LibraryService::add_library(
            app_data.path(),
            &lib_root.path().to_string_lossy(),
            Some("Synced"),
            &mut config_without_sync,
        )
        .await
        .expect("direct add should succeed");

        let info_wrapped = LibraryService::add_library_with_scope_sync(
            &app,
            app_data.path(),
            &lib_root.path().to_string_lossy(),
            Some("Synced"),
            &mut config,
        )
        .await
        .expect("wrapped add should succeed");

        assert_eq!(info_direct.name, info_wrapped.name);
        assert_eq!(info_direct.path, info_wrapped.path);
        assert_eq!(info_direct.book_count, info_wrapped.book_count);
    }

    fn local_library() -> LibraryConfig {
        LibraryConfig {
            id: "lib-local".into(),
            name: "Local".into(),
            path: "/users/wen/books".into(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }
    }

    fn webdav_library() -> LibraryConfig {
        LibraryConfig {
            id: "lib-webdav".into(),
            name: "WebDAV".into(),
            path: "/app-data/libraries/lib-webdav".into(),
            source_type: Some("webdav".into()),
            data_source_id: Some("ds-1".into()),
            source_path: Some("/books".into()),
        }
    }

    #[test]
    fn resolve_library_path_should_return_original_path_for_local_library() {
        let app_data = PathBuf::from("/app-data");
        let config = AppConfig {
            libraries: vec![local_library()],
            active_library_id: Some("lib-local".into()),
            ..Default::default()
        };
        let (id, path) = LibraryService::resolve_library_path(None, &app_data, &config).unwrap();
        assert_eq!(id, "lib-local");
        assert_eq!(PathBuf::from(path), PathBuf::from("/users/wen/books"));
    }

    #[test]
    fn resolve_library_path_should_return_container_path_for_remote_library() {
        let app_data = PathBuf::from("/app-data");
        let config = AppConfig {
            libraries: vec![webdav_library()],
            active_library_id: Some("lib-webdav".into()),
            ..Default::default()
        };
        let (id, path) = LibraryService::resolve_library_path(None, &app_data, &config).unwrap();
        assert_eq!(id, "lib-webdav");
        assert_eq!(
            PathBuf::from(path),
            library_container_dir(&app_data, "lib-webdav")
        );
    }
}
