use std::path::Path;

use tauri::AppHandle;

use crate::asset_scope;
use crate::cache;
use crate::error::AppError;
use crate::models::{AppConfig, LibraryConfig, LibraryInfo};
use crate::utils::paths::{library_container_dir, library_root_path};

pub struct LibraryService;

impl LibraryService {
    pub async fn list_libraries(config: &AppConfig) -> Result<Vec<LibraryInfo>, AppError> {
        let mut infos = Vec::new();
        for lib in &config.libraries {
            let book_count = myreader_core::api::catalog::count_books(Path::new(&lib.path))
                .await
                .unwrap_or(0);
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
        ensure_registry(app_data_dir, config)?;
        let (registry, library) = myreader_core::api::library::add_local(
            &crate::config::device_registry_path(app_data_dir),
            myreader_core::models::LocalLibraryRequest {
                library_root_path: path.to_owned(),
                path: path.to_owned(),
                sidecar_container_parent_path: Some(
                    app_data_dir
                        .join("libraries")
                        .to_string_lossy()
                        .into_owned(),
                ),
                name: name.map(ToOwned::to_owned),
                metadata_uri: None,
                added_at: None,
                security_scoped_bookmark: None,
            },
        )
        .await?;
        config.apply_device_registry(&registry);
        Ok(library_info_from_core(library))
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
            tracing::error!(
                "Failed to extend asset protocol scope after adding library. error: {e}"
            );
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
        add_remote_library(app_data_dir, data_source_id, remote_path, name, config).await
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
        let info =
            Self::add_webdav_library(app_data_dir, data_source_id, remote_path, name, config)
                .await?;
        if let Err(e) = asset_scope::sync_for_reader_libraries(app, &config.libraries) {
            tracing::error!(
                "Failed to extend asset protocol scope after adding WebDAV library. error: {e}"
            );
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
        add_remote_library(app_data_dir, data_source_id, remote_path, name, config).await
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
        let info =
            Self::add_onedrive_library(app_data_dir, data_source_id, remote_path, name, config)
                .await?;
        if let Err(e) = asset_scope::sync_for_reader_libraries(app, &config.libraries) {
            tracing::error!(
                "Failed to extend asset protocol scope after adding OneDrive library. error: {e}"
            );
        }
        Ok(info)
    }

    /// Refresh a WebDAV library: re-download metadata.db.
    pub async fn refresh_webdav_library(
        app_data_dir: &Path,
        id: &str,
        config: &AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        refresh_remote_library(app_data_dir, id, config).await
    }

    /// Refresh a OneDrive library: re-download metadata.db.
    pub async fn refresh_onedrive_library(
        app_data_dir: &Path,
        id: &str,
        config: &AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        refresh_remote_library(app_data_dir, id, config).await
    }

    pub async fn refresh_library(id: &str, config: &AppConfig) -> Result<LibraryInfo, AppError> {
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", id)))?;

        if lib.source_type.as_deref() == Some("webdav") {
            return Err(AppError::Config("WEBDAV_LIBRARY_USE_ASYNC_REFRESH".into()));
        }

        let lib_path = lib.path.clone();
        let lib_path_canon = dunce::canonicalize(&lib_path)
            .map_err(|e| AppError::Config(format!("INVALID_LIBRARY_PATH: {e}")))?;
        let lib_path_str = lib_path_canon.to_string_lossy().to_string();

        if !myreader_core::api::catalog::validate_library(&lib_path_canon) {
            return Err(AppError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                lib_path_str
            )));
        }

        let books = myreader_core::api::catalog::list_books(&lib_path_canon).await?;
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
        ensure_registry(app_data_dir, config)?;
        let registry = myreader_core::api::registry::remove_library(
            &crate::config::device_registry_path(app_data_dir),
            id,
        )?;
        config.apply_device_registry(&registry);
        cache::clear_library_cache_files(id)?;
        let container = library_container_dir(app_data_dir, id);
        if container.exists() {
            std::fs::remove_dir_all(&container)?;
        }
        Ok(())
    }

    pub fn switch_library(
        app_data_dir: &Path,
        id: &str,
        config: &mut AppConfig,
    ) -> Result<(), AppError> {
        ensure_registry(app_data_dir, config)?;
        let registry = myreader_core::api::registry::switch_library(
            &crate::config::device_registry_path(app_data_dir),
            id,
        )?;
        config.apply_device_registry(&registry);
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

async fn add_remote_library(
    app_data_dir: &Path,
    data_source_id: &str,
    remote_path: &str,
    name: Option<&str>,
    config: &mut AppConfig,
) -> Result<LibraryInfo, AppError> {
    ensure_registry(app_data_dir, config)?;
    let source = config
        .data_sources
        .iter()
        .find(|source| source.id == data_source_id)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
    let credential = crate::storage::core_remote_credential(&source).await?;
    let (registry, library) = myreader_core::api::library::add_remote(
        &crate::config::device_registry_path(app_data_dir),
        myreader_core::models::RemoteLibraryRequest {
            data_source_id: data_source_id.to_owned(),
            source_path: remote_path.to_owned(),
            libraries_root_path: app_data_dir
                .join("libraries")
                .to_string_lossy()
                .into_owned(),
            libraries_root_uri: None,
            name: name.map(ToOwned::to_owned),
            added_at: None,
        },
        &credential,
    )
    .await?;
    config.apply_device_registry(&registry);
    Ok(library_info_from_core(library))
}

async fn refresh_remote_library(
    app_data_dir: &Path,
    id: &str,
    config: &AppConfig,
) -> Result<LibraryInfo, AppError> {
    ensure_registry(app_data_dir, config)?;
    let library = config
        .libraries
        .iter()
        .find(|library| library.id == id)
        .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {id}")))?;
    let data_source_id = library
        .data_source_id
        .as_deref()
        .ok_or_else(|| AppError::Config("REMOTE_LIBRARY_MISSING_DATASOURCE".into()))?;
    let source = config
        .data_sources
        .iter()
        .find(|source| source.id == data_source_id)
        .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
    let credential = crate::storage::core_remote_credential(source).await?;
    let local_root = library_container_dir(app_data_dir, id);
    let (_, library) = myreader_core::api::library::refresh_remote(
        &crate::config::device_registry_path(app_data_dir),
        id,
        &local_root,
        &credential,
    )
    .await?;

    let book_ids = myreader_core::api::catalog::list_books(&local_root)
        .await?
        .into_iter()
        .map(|book| book.id)
        .collect::<Vec<_>>();
    cache::clear_orphaned_library_cache_files(id, &book_ids)?;
    cache::clear_library_missing_cover_markers(app_data_dir, id)?;

    Ok(library_info_from_core(library))
}

fn library_info_from_core(library: myreader_core::models::Library) -> LibraryInfo {
    LibraryInfo {
        id: library.id,
        name: library.name,
        path: library.path,
        book_count: usize::try_from(library.book_count).unwrap_or(usize::MAX),
        source_type: library.source_type,
        data_source_id: library.data_source_id,
        source_path: library.source_path,
    }
}

fn ensure_registry(app_data_dir: &Path, config: &AppConfig) -> Result<(), AppError> {
    myreader_core::api::registry::load_or_initialize(
        &crate::config::device_registry_path(app_data_dir),
        Some(config.device_registry()),
    )?;
    Ok(())
}
