use std::path::{Path, PathBuf};

use tauri::Emitter;
use tracing::warn;

use crate::error::AppError;
use crate::models::{AppConfig, LibraryConfig, LibraryInfo};
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};
use crate::utils::io::{download_all_covers, download_metadata_db, webdav_cache_dir};
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

        db::ensure_library_data_dir(&canon_str)?;

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

    /// Add a WebDAV library: download metadata.db, cache locally.
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
        let cache_dir = webdav_cache_dir(app_data_dir, &id)?;
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

        let cache_dir = webdav_cache_dir(app_data_dir, id)?;
        let db_path = cache_dir.join("metadata.db");

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

    pub fn remove_library(id: &str, config: &mut AppConfig) -> Result<(), AppError> {
        config.libraries.retain(|lib| lib.id != id);
        cache::clear_library_cache_files(id)?;

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

        Ok((lib_id, lib.path.clone()))
    }

    /// Spawn a background task to download all missing covers for a WebDAV library.
    /// Returns immediately; covers appear progressively as they finish downloading.
    /// Emits a `webdav-covers-downloaded` event when done.
    pub fn spawn_cover_download(
        app_handle: &tauri::AppHandle,
        library_id: &str,
        config: &AppConfig,
    ) {
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == library_id)
            .filter(|l| l.source_type.as_deref() == Some("webdav"));

        if lib.is_none() {
            return;
        }
        let lib = lib.unwrap();
        let data_source_id = match &lib.data_source_id {
            Some(id) => id.clone(),
            None => return,
        };
        let remote_path = lib.source_path.clone().unwrap_or_default();
        let cache_dir_str = lib.path.clone();
        let config_clone = config.clone();
        let app_handle_clone = app_handle.clone();
        let library_id_owned = library_id.to_string();

        tokio::spawn(async move {
            let source = config_clone
                .data_sources
                .iter()
                .find(|s| s.id == data_source_id);

            if source.is_none() {
                warn!("Skipping cover download: data source not found");
                return;
            }
            let source = source.unwrap();

            let cache_dir = PathBuf::from(&cache_dir_str);
            let repo = match CalibreBookRepository::open(&cache_dir_str).await {
                Ok(r) => r,
                Err(e) => {
                    warn!("Skipping cover download: cannot open metadata.db: {e}");
                    return;
                }
            };
            let summaries = match repo.get_cover_summaries().await {
                Ok(s) => s,
                Err(e) => {
                    warn!("Skipping cover download: cannot query covers: {e}");
                    return;
                }
            };

            download_all_covers(source, &remote_path, &cache_dir, &summaries).await;

            let _ = app_handle_clone.emit("webdav-covers-downloaded", &library_id_owned);
        });
    }
}