use std::path::{Path, PathBuf};

use opendal::services::Fs;
use opendal::Operator;
use sea_orm::{Database, EntityTrait, PaginatorTrait};
use uuid::Uuid;

use crate::{
    infrastructure::storage,
    models::{
        AppConfig, DataSource, Library, LibraryStorageConfig, LibraryType, LocalLibraryRequest,
        MyReaderLibraryMarker, RemoteCredential, RemoteLibraryRequest, SidecarSyncMode,
        MYREADER_LIBRARY_MARKER_RELATIVE_PATH,
    },
    services::config,
    sync::persistence::{ensure_database_document, ensure_database_identity, DatabaseIdentity},
    CoreError,
};

pub struct LibraryService;

impl LibraryService {
    pub async fn create_local_myreader(
        config_path: &Path,
        request: LocalLibraryRequest,
        recorded_at_ms: i64,
    ) -> Result<(AppConfig, Library), CoreError> {
        if recorded_at_ms < 0 {
            return Err(CoreError::Config("RECORDED_AT_INVALID".into()));
        }
        let requested_library_root = request.library_root_path.trim().to_owned();
        let (library_root, created_library_root) =
            resolve_empty_library_root(&requested_library_root)?;
        let requested_path = request.path.trim();
        if requested_path.is_empty() {
            return Err(CoreError::Config("LIBRARY_PATH_REQUIRED".into()));
        }
        let source_path = request
            .source_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let sidecar_parent = request
            .sidecar_container_parent_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .ok_or_else(|| CoreError::Config("SIDECAR_CONTAINER_PARENT_REQUIRED".into()))?;
        let name = request
            .name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| {
                library_root
                    .file_name()
                    .and_then(|value| value.to_str())
                    .map(ToOwned::to_owned)
            })
            .filter(|value| !value.is_empty())
            .ok_or_else(|| CoreError::Config("LIBRARY_NAME_REQUIRED".into()))?;
        let id = Uuid::new_v4().to_string();
        let library_uuid = Uuid::new_v4().to_string();
        let marker = MyReaderLibraryMarker::new(&library_uuid)
            .map_err(|error| CoreError::DataIntegrity(error.to_owned()))?;
        let path = if requested_path == requested_library_root {
            library_root.to_string_lossy().into_owned()
        } else {
            requested_path.to_owned()
        };
        let library = Library {
            id: id.clone(),
            name,
            path,
            library_type: LibraryType::MyReader,
            book_count: 0,
            metadata_uri: None,
            added_at: request.added_at,
            data_source_id: None,
            source_type: Some("local".into()),
            source_path,
            metadata_etag: None,
            security_scoped_bookmark: request.security_scoped_bookmark,
        };
        config::ConfigService::ensure_library_can_add(config_path, &library)?;

        let sidecar_root = Path::new(&sidecar_parent).join(&id);
        if sidecar_root.exists() {
            return Err(CoreError::Config("LIBRARY_CONTAINER_ALREADY_EXISTS".into()));
        }

        let result = async {
            std::fs::create_dir_all(library_root.join("Books"))?;
            write_myreader_marker(&library_root, &marker)?;
            std::fs::create_dir_all(&sidecar_root)?;
            crate::database::open_db(&sidecar_root.to_string_lossy()).await?;
            let database_path = crate::database::library_db_path(&sidecar_root.to_string_lossy())?;
            let database_path = database_path
                .to_str()
                .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
            let identity = ensure_database_identity(database_path, &library_uuid)?;
            ensure_database_document(database_path, &identity, recorded_at_ms)?;
            let state = config::ConfigService::add_library(config_path, library.clone())?;
            Ok((state, library.clone()))
        }
        .await;

        if result.is_err() {
            rollback_local_myreader_creation(&library_root, &sidecar_root, created_library_root);
        }
        result
    }

    pub async fn open_local_myreader(
        config_path: &Path,
        request: LocalLibraryRequest,
        recorded_at_ms: i64,
    ) -> Result<(AppConfig, Library), CoreError> {
        if recorded_at_ms < 0 {
            return Err(CoreError::Config("RECORDED_AT_INVALID".into()));
        }
        let requested_library_root = request.library_root_path.trim();
        let library_root = resolve_existing_library_root(requested_library_root)?;
        if library_root.join("metadata.db").exists() {
            return Err(CoreError::DataIntegrity(
                "MYREADER_LIBRARY_CONTAINS_METADATA_DB".into(),
            ));
        }
        let marker = Self::read_myreader_marker(&library_root)?;
        let root = library_root
            .to_str()
            .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
        let operator = Operator::new(Fs::default().root(root))
            .map_err(storage::storage_error)?
            .finish();
        let snapshots = crate::sync::storage::StorageAdapter::new(&operator)
            .load_range(&crate::sync::storage::snapshot_prefix(&marker.library_uuid))
            .await?;
        if snapshots.is_empty() {
            return Err(CoreError::DataIntegrity(
                "LOCAL_MYREADER_AUTOMERGE_SNAPSHOT_NOT_FOUND".into(),
            ));
        }

        let requested_path = request.path.trim();
        if requested_path.is_empty() {
            return Err(CoreError::Config("LIBRARY_PATH_REQUIRED".into()));
        }
        let source_path = request
            .source_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let sidecar_parent = request
            .sidecar_container_parent_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| CoreError::Config("SIDECAR_CONTAINER_PARENT_REQUIRED".into()))?;
        let name = request
            .name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| {
                library_root
                    .file_name()
                    .and_then(|value| value.to_str())
                    .map(ToOwned::to_owned)
            })
            .filter(|value| !value.is_empty())
            .ok_or_else(|| CoreError::Config("LIBRARY_NAME_REQUIRED".into()))?;
        let id = Uuid::new_v4().to_string();
        let sidecar_root = Path::new(sidecar_parent).join(&id);
        let library = Library {
            id,
            name,
            path: if requested_path == requested_library_root {
                library_root.to_string_lossy().into_owned()
            } else {
                requested_path.to_owned()
            },
            library_type: LibraryType::MyReader,
            book_count: 0,
            metadata_uri: None,
            added_at: request.added_at,
            data_source_id: None,
            source_type: Some("local".into()),
            source_path,
            metadata_etag: None,
            security_scoped_bookmark: request.security_scoped_bookmark,
        };
        config::ConfigService::ensure_library_can_add(config_path, &library)?;
        if sidecar_root.exists() {
            return Err(CoreError::Config("LIBRARY_CONTAINER_ALREADY_EXISTS".into()));
        }

        let result = async {
            std::fs::create_dir_all(&sidecar_root)?;
            crate::database::open_db(&sidecar_root.to_string_lossy()).await?;
            let database_path = crate::database::library_db_path(&sidecar_root.to_string_lossy())?;
            let database_path = database_path
                .to_str()
                .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
            let identity = ensure_database_identity(database_path, &marker.library_uuid)?;
            ensure_database_document(database_path, &identity, recorded_at_ms)?;
            crate::services::sync::SyncService::sync_sidecar_with_operator(
                &sidecar_root,
                &library_root,
                recorded_at_ms,
                SidecarSyncMode::Full,
                &operator,
                true,
            )
            .await?;
            let mut library = library;
            library.book_count = u64::try_from(
                crate::services::catalog::CatalogService::list_myreader_books(
                    &sidecar_root,
                    &library_root,
                )
                .await?
                .len(),
            )
            .unwrap_or(u64::MAX);
            let state = config::ConfigService::add_library(config_path, library.clone())?;
            Ok((state, library))
        }
        .await;

        if result.is_err() {
            let _ = std::fs::remove_dir_all(&sidecar_root);
        }
        result
    }

    pub async fn create_remote_myreader(
        config_path: &Path,
        request: RemoteLibraryRequest,
        credential: &RemoteCredential,
        recorded_at_ms: i64,
    ) -> Result<(AppConfig, Library), CoreError> {
        validate_remote_myreader_request(&request, recorded_at_ms)?;
        let config_snapshot = config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        let source = config_snapshot
            .data_sources
            .iter()
            .find(|source| source.id() == request.data_source_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", request.data_source_id))
            })?;
        ensure_remote_source_writable(source)?;
        let source_type = remote_source_type(source)?;
        let source_name = source.name();
        let source_path = storage::normalize_remote_path(&request.source_path)?;
        let base_operator = storage::build_remote_operator(source, credential)?;
        ensure_remote_myreader_create_target(&base_operator, &source_path).await?;
        let scoped_storage = remote_library_storage(source, credential, &source_path)?;
        let scoped_operator = crate::sync::transport::build_storage_operator(&scoped_storage)?;
        create_remote_myreader_with_operators(
            config_path,
            request,
            source_type,
            source_name,
            recorded_at_ms,
            &base_operator,
            &scoped_operator,
        )
        .await
    }

    pub async fn open_remote_myreader(
        config_path: &Path,
        request: RemoteLibraryRequest,
        credential: &RemoteCredential,
        recorded_at_ms: i64,
    ) -> Result<(AppConfig, Library), CoreError> {
        validate_remote_myreader_request(&request, recorded_at_ms)?;
        let config_snapshot = config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        let source = config_snapshot
            .data_sources
            .iter()
            .find(|source| source.id() == request.data_source_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", request.data_source_id))
            })?;
        ensure_remote_source_writable(source)?;
        let source_type = remote_source_type(source)?;
        let source_name = source.name();
        let source_path = storage::normalize_remote_path(&request.source_path)?;
        let base_operator = storage::build_remote_operator(source, credential)?;
        let scoped_storage = remote_library_storage(source, credential, &source_path)?;
        let scoped_operator = crate::sync::transport::build_storage_operator(&scoped_storage)?;
        open_remote_myreader_with_operators(
            config_path,
            request,
            source_type,
            source_name,
            recorded_at_ms,
            &base_operator,
            &scoped_operator,
        )
        .await
    }

    pub fn read_myreader_marker(library_root: &Path) -> Result<MyReaderLibraryMarker, CoreError> {
        let path = library_root.join(MYREADER_LIBRARY_MARKER_RELATIVE_PATH);
        let bytes = std::fs::read(&path).map_err(|error| {
            CoreError::NotFound(format!("MYREADER_LIBRARY_MARKER_NOT_FOUND: {error}"))
        })?;
        let marker = serde_json::from_slice::<MyReaderLibraryMarker>(&bytes).map_err(|error| {
            CoreError::DataIntegrity(format!("MYREADER_LIBRARY_MARKER_INVALID: {error}"))
        })?;
        marker.validate().map_err(|error| {
            CoreError::DataIntegrity(format!("MYREADER_LIBRARY_MARKER_INVALID: {error}"))
        })?;
        Ok(marker)
    }

    pub(crate) async fn writable_myreader_identity(
        config_path: &Path,
        library_id: &str,
        library_root: &Path,
        sidecar_root: &Path,
        recorded_at_ms: i64,
    ) -> Result<(Library, MyReaderLibraryMarker, String, DatabaseIdentity), CoreError> {
        if recorded_at_ms < 0 {
            return Err(CoreError::Config("RECORDED_AT_INVALID".into()));
        }
        let config = config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        let library = config
            .libraries
            .iter()
            .find(|library| library.id == library_id)
            .cloned()
            .ok_or_else(|| CoreError::NotFound(format!("LIBRARY_NOT_FOUND: {library_id}")))?;
        if library.library_type != LibraryType::MyReader {
            return Err(CoreError::Config("LIBRARY_NOT_MYREADER".into()));
        }
        if !matches!(
            library.source_type.as_deref(),
            Some("local") | Some("webdav") | Some("onedrive")
        ) {
            return Err(CoreError::Config("MYREADER_LIBRARY_SOURCE_REQUIRED".into()));
        }
        if let Some(data_source_id) = library.data_source_id.as_deref() {
            let source = config
                .data_sources
                .iter()
                .find(|source| source.id() == data_source_id)
                .ok_or_else(|| {
                    CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}"))
                })?;
            let (kind, readonly) = match source {
                DataSource::Local { readonly, .. } => ("local", *readonly),
                DataSource::Webdav { readonly, .. } => ("webdav", *readonly),
                DataSource::Onedrive { readonly, .. } => ("onedrive", *readonly),
            };
            if library.source_type.as_deref() != Some(kind) {
                return Err(CoreError::Config("LIBRARY_DATASOURCE_TYPE_MISMATCH".into()));
            }
            if readonly == Some(true) {
                return Err(CoreError::Config("DATASOURCE_READ_ONLY".into()));
            }
        }
        if matches!(
            library.source_type.as_deref(),
            Some("webdav") | Some("onedrive")
        ) && library.data_source_id.is_none()
        {
            return Err(CoreError::Config(
                "REMOTE_LIBRARY_MISSING_DATASOURCE".into(),
            ));
        }
        if library_root.join("metadata.db").exists() {
            return Err(CoreError::DataIntegrity(
                "MYREADER_LIBRARY_CONTAINS_METADATA_DB".into(),
            ));
        }
        let marker = Self::read_myreader_marker(library_root)?;
        crate::database::open_db(&sidecar_root.to_string_lossy()).await?;
        let database_path = crate::database::library_db_path(&sidecar_root.to_string_lossy())?;
        let database_path = database_path
            .to_str()
            .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?
            .to_owned();
        let identity = ensure_database_identity(&database_path, &marker.library_uuid)?;
        Ok((library, marker, database_path, identity))
    }

    pub async fn add_local(
        config_path: &Path,
        request: LocalLibraryRequest,
    ) -> Result<(AppConfig, Library), CoreError> {
        let requested_library_root = request.library_root_path.trim();
        let library_root = dunce::canonicalize(requested_library_root)
            .map_err(|error| CoreError::Config(format!("INVALID_LIBRARY_PATH: {error}")))?;
        if !crate::services::catalog::CatalogService::validate_library(&library_root) {
            return Err(CoreError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                library_root.display()
            )));
        }

        let requested_path = request.path.trim();
        if requested_path.is_empty() {
            return Err(CoreError::Config("LIBRARY_PATH_REQUIRED".into()));
        }
        let source_path = request
            .source_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let path = if requested_path == requested_library_root {
            library_root.to_string_lossy().into_owned()
        } else {
            requested_path.to_owned()
        };
        let name = request
            .name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .or_else(|| {
                library_root
                    .file_name()
                    .and_then(|value| value.to_str())
                    .map(ToOwned::to_owned)
            })
            .filter(|value| !value.is_empty())
            .ok_or_else(|| CoreError::Config("LIBRARY_NAME_REQUIRED".into()))?;
        let id = Uuid::new_v4().to_string();
        let book_count = crate::services::catalog::CatalogService::count_books(&library_root)
            .await
            .unwrap_or(0) as u64;
        let library = Library {
            id: id.clone(),
            name,
            path,
            library_type: LibraryType::Calibre,
            book_count,
            metadata_uri: request.metadata_uri,
            added_at: request.added_at,
            data_source_id: None,
            source_type: Some("local".into()),
            source_path,
            metadata_etag: None,
            security_scoped_bookmark: request.security_scoped_bookmark,
        };

        config::ConfigService::ensure_library_can_add(config_path, &library)?;

        let container_parent = request
            .sidecar_container_parent_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let sidecar_root = container_parent
            .map(|parent| Path::new(parent).join(&id))
            .unwrap_or_else(|| library_root.clone());
        let created_container = container_parent.is_some() && !sidecar_root.exists();
        if created_container {
            std::fs::create_dir_all(&sidecar_root)?;
        }

        let result = (|| {
            crate::database::ensure_library_data_dir(
                sidecar_root
                    .to_str()
                    .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?,
            )?;
            let state = config::ConfigService::add_library(config_path, library.clone())?;
            Ok((state, library))
        })();

        if result.is_err() && created_container {
            let _ = std::fs::remove_dir_all(&sidecar_root);
        }
        result
    }

    pub async fn add_remote(
        config_path: &Path,
        request: RemoteLibraryRequest,
        credential: &RemoteCredential,
    ) -> Result<(AppConfig, Library), CoreError> {
        validate_request(&request)?;
        let config_snapshot = config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        let source = config_snapshot
            .data_sources
            .iter()
            .find(|source| source.id() == request.data_source_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", request.data_source_id))
            })?;
        let source_type = remote_source_type(source)?;
        let source_name = source.name().to_owned();
        let operator = storage::build_remote_operator(source, credential)?;
        add_remote_library_with_operator(config_path, request, source_type, &source_name, &operator)
            .await
    }

    pub async fn refresh_remote(
        config_path: &Path,
        library_id: &str,
        local_root_path: &Path,
        credential: &RemoteCredential,
    ) -> Result<(AppConfig, Library), CoreError> {
        let config_snapshot = config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        let library = config_snapshot
            .libraries
            .iter()
            .find(|library| library.id == library_id)
            .cloned()
            .ok_or_else(|| CoreError::NotFound(format!("LIBRARY_NOT_FOUND: {library_id}")))?;
        if library.library_type != LibraryType::Calibre {
            return Err(CoreError::Config("LIBRARY_NOT_CALIBRE".into()));
        }
        let data_source_id = library
            .data_source_id
            .as_deref()
            .ok_or_else(|| CoreError::Config("REMOTE_LIBRARY_MISSING_DATASOURCE".into()))?;
        let source = config_snapshot
            .data_sources
            .iter()
            .find(|source| source.id() == data_source_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}"))
            })?;
        remote_source_type(source)?;
        let operator = storage::build_remote_operator(source, credential)?;
        let source_path = library
            .source_path
            .as_deref()
            .ok_or_else(|| CoreError::Config("REMOTE_LIBRARY_MISSING_SOURCE_PATH".into()))?;
        let metadata_path = local_root_path.join("metadata.db");
        let book_count =
            download_and_validate_metadata(&operator, source_path, &metadata_path).await?;
        let mut next_library = library;
        next_library.book_count = book_count;
        let state = config::ConfigService::replace_library(config_path, next_library.clone())?;
        Ok((state, next_library))
    }

    pub fn replace(path: &Path, library: Library) -> Result<AppConfig, CoreError> {
        config::ConfigService::replace_library(path, library)
    }

    pub fn remove(path: &Path, id: &str) -> Result<AppConfig, CoreError> {
        config::ConfigService::remove_library(path, id)
    }

    pub fn switch(path: &Path, id: &str) -> Result<AppConfig, CoreError> {
        config::ConfigService::switch_library(path, id)
    }
}

fn resolve_empty_library_root(value: &str) -> Result<(PathBuf, bool), CoreError> {
    if value.is_empty() {
        return Err(CoreError::Config("LIBRARY_ROOT_PATH_REQUIRED".into()));
    }
    let requested = PathBuf::from(value);
    let requested = if requested.is_absolute() {
        requested
    } else {
        std::env::current_dir()?.join(requested)
    };
    let existed = requested.exists();
    let root = if existed {
        dunce::canonicalize(&requested)
            .map_err(|error| CoreError::Config(format!("INVALID_LIBRARY_PATH: {error}")))?
    } else {
        let parent = requested
            .parent()
            .ok_or_else(|| CoreError::Config("INVALID_LIBRARY_PATH".into()))?;
        let name = requested
            .file_name()
            .ok_or_else(|| CoreError::Config("INVALID_LIBRARY_PATH".into()))?;
        dunce::canonicalize(parent)
            .map_err(|error| CoreError::Config(format!("INVALID_LIBRARY_PATH: {error}")))?
            .join(name)
    };
    if existed {
        if !root.is_dir() {
            return Err(CoreError::Config("LIBRARY_ROOT_NOT_DIRECTORY".into()));
        }
        if std::fs::read_dir(&root)?.next().transpose()?.is_some() {
            return Err(CoreError::Config("LIBRARY_ROOT_NOT_EMPTY".into()));
        }
    }
    Ok((root, !existed))
}

fn resolve_existing_library_root(value: &str) -> Result<PathBuf, CoreError> {
    if value.is_empty() {
        return Err(CoreError::Config("LIBRARY_ROOT_PATH_REQUIRED".into()));
    }
    let requested = PathBuf::from(value);
    let requested = if requested.is_absolute() {
        requested
    } else {
        std::env::current_dir()?.join(requested)
    };
    let root = dunce::canonicalize(&requested)
        .map_err(|error| CoreError::Config(format!("INVALID_LIBRARY_PATH: {error}")))?;
    if !root.is_dir() {
        return Err(CoreError::Config("LIBRARY_ROOT_NOT_DIRECTORY".into()));
    }
    Ok(root)
}

fn write_myreader_marker(
    library_root: &Path,
    marker: &MyReaderLibraryMarker,
) -> Result<(), CoreError> {
    let path = library_root.join(MYREADER_LIBRARY_MARKER_RELATIVE_PATH);
    let parent = path
        .parent()
        .ok_or_else(|| CoreError::Config("MYREADER_LIBRARY_MARKER_PATH_INVALID".into()))?;
    std::fs::create_dir_all(parent)?;
    let temporary = parent.join(format!("library.json.{}.tmp", Uuid::new_v4()));
    let mut bytes = serde_json::to_vec_pretty(marker)?;
    bytes.push(b'\n');
    std::fs::write(&temporary, bytes)?;
    if let Err(error) = std::fs::rename(&temporary, &path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.into());
    }
    Ok(())
}

fn rollback_local_myreader_creation(
    library_root: &Path,
    sidecar_root: &Path,
    created_library_root: bool,
) {
    let _ = std::fs::remove_dir_all(sidecar_root);
    let _ = std::fs::remove_file(library_root.join(MYREADER_LIBRARY_MARKER_RELATIVE_PATH));
    let _ = std::fs::remove_dir(library_root.join(".myreader"));
    let _ = std::fs::remove_dir(library_root.join("Books"));
    if created_library_root {
        let _ = std::fs::remove_dir(library_root);
    }
}

#[allow(clippy::too_many_arguments)]
async fn create_remote_myreader_with_operators(
    config_path: &Path,
    request: RemoteLibraryRequest,
    source_type: &str,
    source_name: &str,
    recorded_at_ms: i64,
    base_operator: &Operator,
    scoped_operator: &Operator,
) -> Result<(AppConfig, Library), CoreError> {
    let source_path = storage::normalize_remote_path(&request.source_path)?;
    let (library, local_root) =
        remote_myreader_registration(&request, source_type, source_name, &source_path, None)?;
    config::ConfigService::ensure_library_can_add(config_path, &library)?;
    if local_root.exists() {
        return Err(CoreError::Config("LIBRARY_CONTAINER_ALREADY_EXISTS".into()));
    }

    let marker = MyReaderLibraryMarker::new(&Uuid::new_v4().to_string())
        .map_err(CoreError::DataIntegrity)?;
    let result = async {
        create_remote_myreader_directories(base_operator, &source_path).await?;
        write_remote_myreader_marker(base_operator, &source_path, &marker).await?;
        initialize_local_myreader_cache(&local_root, &marker, recorded_at_ms).await?;
        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_root,
            &local_root,
            recorded_at_ms,
            SidecarSyncMode::PushOnly,
            scoped_operator,
            true,
        )
        .await?;
        let state = config::ConfigService::add_library(config_path, library.clone())?;
        Ok((state, library.clone()))
    }
    .await;

    if result.is_err() {
        let _ = std::fs::remove_dir_all(&local_root);
        rollback_remote_myreader_creation(base_operator, &source_path).await;
    }
    result
}

#[allow(clippy::too_many_arguments)]
async fn open_remote_myreader_with_operators(
    config_path: &Path,
    request: RemoteLibraryRequest,
    source_type: &str,
    source_name: &str,
    recorded_at_ms: i64,
    base_operator: &Operator,
    scoped_operator: &Operator,
) -> Result<(AppConfig, Library), CoreError> {
    let source_path = storage::normalize_remote_path(&request.source_path)?;
    let marker = read_remote_myreader_marker(base_operator, &source_path).await?;
    let snapshots = crate::sync::storage::StorageAdapter::new(scoped_operator)
        .load_range(&crate::sync::storage::snapshot_prefix(&marker.library_uuid))
        .await?;
    if snapshots.is_empty() {
        return Err(CoreError::DataIntegrity(
            "REMOTE_MYREADER_AUTOMERGE_SNAPSHOT_NOT_FOUND".into(),
        ));
    }

    let (mut library, local_root) =
        remote_myreader_registration(&request, source_type, source_name, &source_path, None)?;
    config::ConfigService::ensure_library_can_add(config_path, &library)?;
    if local_root.exists() {
        return Err(CoreError::Config("LIBRARY_CONTAINER_ALREADY_EXISTS".into()));
    }

    let result = async {
        initialize_local_myreader_cache(&local_root, &marker, recorded_at_ms).await?;
        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_root,
            &local_root,
            recorded_at_ms,
            SidecarSyncMode::Full,
            scoped_operator,
            true,
        )
        .await?;
        library.book_count = u64::try_from(
            crate::services::catalog::CatalogService::list_myreader_books(&local_root, &local_root)
                .await?
                .len(),
        )
        .unwrap_or(u64::MAX);
        let state = config::ConfigService::add_library(config_path, library.clone())?;
        Ok((state, library.clone()))
    }
    .await;

    if result.is_err() {
        let _ = std::fs::remove_dir_all(&local_root);
    }
    result
}

fn remote_myreader_registration(
    request: &RemoteLibraryRequest,
    source_type: &str,
    source_name: &str,
    source_path: &str,
    library_id: Option<String>,
) -> Result<(Library, PathBuf), CoreError> {
    let id = library_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let local_root = Path::new(request.libraries_root_path.trim()).join(&id);
    let public_root = request
        .libraries_root_uri
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|root| format!("{}/{}", root.trim_end_matches('/'), id))
        .unwrap_or_else(|| local_root.to_string_lossy().into_owned());
    let name = request
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| source_path.rsplit('/').next().map(ToOwned::to_owned))
        .filter(|value| !value.is_empty())
        .or_else(|| {
            let name = source_name.trim();
            (!name.is_empty()).then(|| name.to_owned())
        })
        .ok_or_else(|| CoreError::Config("LIBRARY_NAME_REQUIRED".into()))?;
    Ok((
        Library {
            id,
            name,
            path: public_root,
            library_type: LibraryType::MyReader,
            book_count: 0,
            metadata_uri: None,
            added_at: request.added_at,
            data_source_id: Some(request.data_source_id.clone()),
            source_type: Some(source_type.to_owned()),
            source_path: Some(if source_path.is_empty() {
                "/".into()
            } else {
                format!("/{source_path}")
            }),
            metadata_etag: None,
            security_scoped_bookmark: None,
        },
        local_root,
    ))
}

async fn initialize_local_myreader_cache(
    local_root: &Path,
    marker: &MyReaderLibraryMarker,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    std::fs::create_dir_all(local_root.join("Books"))?;
    write_myreader_marker(local_root, marker)?;
    crate::database::open_db(&local_root.to_string_lossy()).await?;
    let database_path = crate::database::library_db_path(&local_root.to_string_lossy())?;
    let database_path = database_path
        .to_str()
        .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
    let identity = ensure_database_identity(database_path, &marker.library_uuid)?;
    ensure_database_document(database_path, &identity, recorded_at_ms)?;
    Ok(())
}

async fn ensure_remote_myreader_create_target(
    operator: &Operator,
    source_path: &str,
) -> Result<(), CoreError> {
    let prefix = if source_path.is_empty() {
        "/".to_owned()
    } else {
        format!("{source_path}/")
    };
    // OpenDAL 0.51's OneDrive backend reports every missing path ending in `/`
    // as an empty directory, so only stat the normalized target path.
    if remote_path_exists(operator, source_path).await? {
        return Err(CoreError::Config("LIBRARY_FOLDER_ALREADY_EXISTS".into()));
    }
    let entries = match operator.list(&prefix).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == opendal::ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(storage::storage_error(error)),
    };
    if entries.iter().any(|entry| {
        let relative = entry.path().trim_end_matches('/');
        relative != source_path.trim_end_matches('/')
    }) {
        return Err(CoreError::Config("LIBRARY_FOLDER_ALREADY_EXISTS".into()));
    }
    Ok(())
}

async fn remote_path_exists(operator: &Operator, path: &str) -> Result<bool, CoreError> {
    if path.is_empty() {
        return Ok(true);
    }
    match operator.stat(path).await {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == opendal::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(storage::storage_error(error)),
    }
}

async fn create_remote_myreader_directories(
    operator: &Operator,
    source_path: &str,
) -> Result<(), CoreError> {
    if !source_path.is_empty() {
        operator
            .create_dir(&format!("{source_path}/"))
            .await
            .map_err(storage::storage_error)?;
    }
    for relative in [".myreader", "Books"] {
        let path = storage::join_remote_path(source_path, relative)?;
        operator
            .create_dir(&format!("{path}/"))
            .await
            .map_err(storage::storage_error)?;
    }
    Ok(())
}

async fn write_remote_myreader_marker(
    operator: &Operator,
    source_path: &str,
    marker: &MyReaderLibraryMarker,
) -> Result<(), CoreError> {
    let path = storage::join_remote_path(source_path, MYREADER_LIBRARY_MARKER_RELATIVE_PATH)?;
    let mut bytes = serde_json::to_vec_pretty(marker)?;
    bytes.push(b'\n');
    operator
        .write(&path, bytes)
        .await
        .map(|_| ())
        .map_err(storage::storage_error)
}

async fn read_remote_myreader_marker(
    operator: &Operator,
    source_path: &str,
) -> Result<MyReaderLibraryMarker, CoreError> {
    let path = storage::join_remote_path(source_path, MYREADER_LIBRARY_MARKER_RELATIVE_PATH)?;
    let bytes = operator.read(&path).await.map_err(|error| {
        if error.kind() == opendal::ErrorKind::NotFound {
            CoreError::NotFound("REMOTE_MYREADER_LIBRARY_MARKER_NOT_FOUND".into())
        } else {
            storage::storage_error(error)
        }
    })?;
    let marker =
        serde_json::from_slice::<MyReaderLibraryMarker>(&bytes.to_vec()).map_err(|error| {
            CoreError::DataIntegrity(format!("MYREADER_LIBRARY_MARKER_INVALID: {error}"))
        })?;
    marker.validate().map_err(|error| {
        CoreError::DataIntegrity(format!("MYREADER_LIBRARY_MARKER_INVALID: {error}"))
    })?;
    Ok(marker)
}

async fn rollback_remote_myreader_creation(operator: &Operator, source_path: &str) {
    if source_path.is_empty() {
        return;
    }
    let _ = operator.remove_all(&format!("{source_path}/")).await;
}

async fn add_remote_library_with_operator(
    config_path: &Path,
    request: RemoteLibraryRequest,
    source_type: &str,
    source_name: &str,
    operator: &Operator,
) -> Result<(AppConfig, Library), CoreError> {
    let source_path = storage::normalize_remote_path(&request.source_path)?;
    let id = Uuid::new_v4().to_string();
    let local_root = Path::new(request.libraries_root_path.trim()).join(&id);
    let public_root = request
        .libraries_root_uri
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|root| format!("{}/{}", root.trim_end_matches('/'), id))
        .unwrap_or_else(|| local_root.to_string_lossy().into_owned());
    let name = request
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| source_path.rsplit('/').next().map(ToOwned::to_owned))
        .filter(|value| !value.is_empty())
        .or_else(|| {
            let name = source_name.trim();
            (!name.is_empty()).then(|| name.to_owned())
        })
        .ok_or_else(|| CoreError::Config("LIBRARY_NAME_REQUIRED".into()))?;
    let mut library = Library {
        id,
        name,
        path: public_root.clone(),
        library_type: LibraryType::Calibre,
        book_count: 0,
        metadata_uri: Some(format!("{public_root}/metadata.db")),
        added_at: request.added_at,
        data_source_id: Some(request.data_source_id),
        source_type: Some(source_type.to_owned()),
        source_path: Some(format!("/{source_path}")),
        metadata_etag: None,
        security_scoped_bookmark: None,
    };

    config::ConfigService::ensure_library_can_add(config_path, &library)?;
    if local_root.exists() {
        return Err(CoreError::Config("LIBRARY_CONTAINER_ALREADY_EXISTS".into()));
    }
    std::fs::create_dir_all(&local_root)?;

    let result = async {
        crate::database::ensure_library_data_dir(
            local_root
                .to_str()
                .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?,
        )?;
        library.book_count =
            download_and_validate_metadata(operator, &source_path, &local_root.join("metadata.db"))
                .await?;
        let state = config::ConfigService::add_library(config_path, library.clone())?;
        Ok((state, library.clone()))
    }
    .await;

    if result.is_err() {
        let _ = std::fs::remove_dir_all(&local_root);
    }
    result
}

pub(super) async fn download_and_validate_metadata(
    operator: &Operator,
    source_path: &str,
    destination: &Path,
) -> Result<u64, CoreError> {
    let remote_path = storage::join_remote_path(source_path, "metadata.db")?;
    let bytes = operator
        .read(&remote_path)
        .await
        .map_err(storage::storage_error)?;
    if bytes.is_empty() {
        return Err(CoreError::Storage("REMOTE_METADATA_DB_EMPTY".into()));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| CoreError::Config("LIBRARY_CONTAINER_PATH_INVALID".into()))?;
    std::fs::create_dir_all(parent)?;
    let temporary = temporary_download_path(destination);
    tokio::fs::write(&temporary, bytes.to_vec()).await?;
    let count = count_calibre_books(&temporary).await;
    if count.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    let count = count?;
    if destination.exists() {
        std::fs::remove_file(destination)?;
    }
    std::fs::rename(&temporary, destination)?;
    Ok(count)
}

async fn count_calibre_books(metadata_path: &Path) -> Result<u64, CoreError> {
    let path = metadata_path
        .to_str()
        .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
    let database = Database::connect(format!("sqlite://{path}?mode=ro")).await?;
    let count = crate::entities::calibre::books::Entity::find()
        .count(&database)
        .await?;
    database.close().await?;
    Ok(count)
}

fn temporary_download_path(destination: &Path) -> PathBuf {
    destination.with_extension("db.download")
}

fn remote_source_type(source: &DataSource) -> Result<&'static str, CoreError> {
    match source {
        DataSource::Webdav { .. } => Ok("webdav"),
        DataSource::Onedrive { .. } => Ok("onedrive"),
        DataSource::Local { .. } => Err(CoreError::Config("DATASOURCE_NOT_REMOTE".into())),
    }
}

fn ensure_remote_source_writable(source: &DataSource) -> Result<(), CoreError> {
    let readonly = match source {
        DataSource::Webdav { readonly, .. } | DataSource::Onedrive { readonly, .. } => *readonly,
        DataSource::Local { .. } => return Err(CoreError::Config("DATASOURCE_NOT_REMOTE".into())),
    };
    if readonly == Some(true) {
        return Err(CoreError::Config("DATASOURCE_READ_ONLY".into()));
    }
    Ok(())
}

fn remote_library_storage(
    source: &DataSource,
    credential: &RemoteCredential,
    source_path: &str,
) -> Result<LibraryStorageConfig, CoreError> {
    match (source, credential) {
        (
            DataSource::Webdav {
                endpoint,
                username,
                root_path,
                ..
            },
            RemoteCredential::Webdav { password },
        ) => Ok(LibraryStorageConfig::Webdav {
            endpoint: endpoint.clone(),
            username: username.clone(),
            password: password.clone(),
            root: Some(crate::services::sync::SyncService::scope_remote_root(
                root_path.as_deref(),
                source_path,
            )?),
        }),
        (DataSource::Onedrive { root_path, .. }, RemoteCredential::Onedrive { access_token }) => {
            Ok(LibraryStorageConfig::Onedrive {
                access_token: access_token.clone(),
                root: Some(crate::services::sync::SyncService::scope_remote_root(
                    root_path.as_deref(),
                    source_path,
                )?),
            })
        }
        (DataSource::Local { .. }, _) => Err(CoreError::Config("DATASOURCE_NOT_REMOTE".into())),
        _ => Err(CoreError::Config(
            "DATASOURCE_CREDENTIAL_TYPE_MISMATCH".into(),
        )),
    }
}

fn validate_remote_myreader_request(
    request: &RemoteLibraryRequest,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    if recorded_at_ms < 0 {
        return Err(CoreError::Config("RECORDED_AT_INVALID".into()));
    }
    validate_request(request)
}

fn validate_request(request: &RemoteLibraryRequest) -> Result<(), CoreError> {
    if request.data_source_id.trim().is_empty() {
        return Err(CoreError::Config("DATASOURCE_ID_REQUIRED".into()));
    }
    if request.libraries_root_path.trim().is_empty() {
        return Err(CoreError::Config("LIBRARIES_ROOT_PATH_REQUIRED".into()));
    }
    storage::normalize_remote_path(&request.source_path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use opendal::services::Fs;

    use super::*;

    fn seed_calibre_database(path: &Path) {
        let connection = rusqlite::Connection::open(path).unwrap();
        connection
            .execute(
                "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, sort TEXT NOT NULL, timestamp TEXT, pubdate TEXT, series_index REAL NOT NULL DEFAULT 1, author_sort TEXT, isbn TEXT, lccn TEXT, path TEXT, flags INTEGER NOT NULL DEFAULT 1, uuid TEXT, has_cover INTEGER, last_modified TEXT NOT NULL)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO books (id, title, sort, last_modified) VALUES (1, 'Book', 'Book', '2026-01-01')",
                [],
            )
            .unwrap();
    }

    #[tokio::test]
    async fn should_validate_count_and_persist_when_local_library_is_added() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let library_root = directory.path().join("Ursula K. Le Guin");
        let sidecars = directory.path().join("sidecars");
        std::fs::create_dir_all(&library_root).unwrap();
        seed_calibre_database(&library_root.join("metadata.db"));

        let (state, library) = LibraryService::add_local(
            &config_path,
            LocalLibraryRequest {
                library_root_path: library_root.to_string_lossy().into_owned(),
                path: "file:///library".into(),
                source_path: None,
                sidecar_container_parent_path: Some(sidecars.to_string_lossy().into_owned()),
                name: None,
                metadata_uri: Some("file:///library/metadata.db".into()),
                added_at: Some(1.0),
                security_scoped_bookmark: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(library.name, "Ursula K. Le Guin");
        assert_eq!(library.book_count, 1);
        assert_eq!(library.path, "file:///library");
        assert_eq!(library.source_type.as_deref(), Some("local"));
        assert_eq!(
            state.active_library_id.as_deref(),
            Some(library.id.as_str())
        );
        assert!(sidecars.join(&library.id).join(".myreader").is_dir());
    }

    #[tokio::test]
    async fn should_reject_duplicate_when_local_library_path_already_exists() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let library_root = directory.path().join("Library");
        std::fs::create_dir_all(&library_root).unwrap();
        seed_calibre_database(&library_root.join("metadata.db"));
        let request = || LocalLibraryRequest {
            library_root_path: library_root.to_string_lossy().into_owned(),
            path: "file:///library".into(),
            source_path: None,
            sidecar_container_parent_path: Some(
                directory
                    .path()
                    .join("sidecars")
                    .to_string_lossy()
                    .into_owned(),
            ),
            name: None,
            metadata_uri: Some("file:///library/metadata.db".into()),
            added_at: None,
            security_scoped_bookmark: None,
        };
        LibraryService::add_local(&config_path, request())
            .await
            .unwrap();

        let error = LibraryService::add_local(&config_path, request())
            .await
            .unwrap_err();

        assert!(error.to_string().contains("LIBRARY_ALREADY_EXISTS"));
    }

    #[tokio::test]
    async fn should_create_owned_local_myreader_library_without_metadata_database() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let library_root = directory.path().join("My Library");
        let sidecars = directory.path().join("sidecars");

        let (state, library) = LibraryService::create_local_myreader(
            &config_path,
            LocalLibraryRequest {
                library_root_path: library_root.to_string_lossy().into_owned(),
                path: library_root.to_string_lossy().into_owned(),
                source_path: Some("content://tree/primary%3ABooks".into()),
                sidecar_container_parent_path: Some(sidecars.to_string_lossy().into_owned()),
                name: None,
                metadata_uri: Some("must-not-be-used".into()),
                added_at: Some(1.0),
                security_scoped_bookmark: None,
            },
            100,
        )
        .await
        .unwrap();

        let marker = LibraryService::read_myreader_marker(&library_root).unwrap();
        let database_path =
            crate::database::library_db_path(&sidecars.join(&library.id).to_string_lossy())
                .unwrap();
        let pending =
            crate::sync::persistence::list_pending_outbox(database_path.to_str().unwrap()).unwrap();

        assert_eq!(library.library_type, LibraryType::MyReader);
        assert_eq!(library.source_type.as_deref(), Some("local"));
        assert_eq!(
            library.source_path.as_deref(),
            Some("content://tree/primary%3ABooks")
        );
        assert_eq!(library.metadata_uri, None);
        assert_eq!(
            state.active_library_id.as_deref(),
            Some(library.id.as_str())
        );
        assert!(library_root.join("Books").is_dir());
        assert!(!library_root.join("metadata.db").exists());
        assert!(database_path.is_file());
        assert!(!pending.is_empty());
        assert_eq!(
            crate::sync::persistence::ensure_database_identity(
                database_path.to_str().unwrap(),
                &marker.library_uuid,
            )
            .unwrap()
            .library_uuid,
            marker.library_uuid
        );
    }

    #[tokio::test]
    async fn should_reject_duplicate_local_source_path_across_mirrors() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let sidecars = directory.path().join("sidecars");
        let request = |name: &str| LocalLibraryRequest {
            library_root_path: directory.path().join(name).to_string_lossy().into_owned(),
            path: directory.path().join(name).to_string_lossy().into_owned(),
            source_path: Some("content://tree/primary%3AShared".into()),
            sidecar_container_parent_path: Some(sidecars.to_string_lossy().into_owned()),
            name: Some(name.into()),
            metadata_uri: None,
            added_at: None,
            security_scoped_bookmark: None,
        };

        LibraryService::create_local_myreader(&config_path, request("mirror-one"), 100)
            .await
            .unwrap();
        let error = LibraryService::create_local_myreader(&config_path, request("mirror-two"), 200)
            .await
            .unwrap_err();

        assert!(error.to_string().contains("LIBRARY_ALREADY_EXISTS"));
    }

    #[tokio::test]
    async fn should_open_existing_local_myreader_library_from_shared_snapshot() {
        let directory = tempfile::tempdir().unwrap();
        let config_one = directory.path().join("device-one.json");
        let config_two = directory.path().join("device-two.json");
        let library_root = directory.path().join("Shared Library");
        let sidecars_one = directory.path().join("device-one-sidecars");
        let sidecars_two = directory.path().join("device-two-sidecars");
        std::fs::create_dir_all(&sidecars_one).unwrap();
        std::fs::create_dir_all(&sidecars_two).unwrap();

        let (_, created) = LibraryService::create_local_myreader(
            &config_one,
            LocalLibraryRequest {
                library_root_path: library_root.to_string_lossy().into_owned(),
                path: "file:///shared-library".into(),
                source_path: None,
                sidecar_container_parent_path: Some(sidecars_one.to_string_lossy().into_owned()),
                name: Some("Shared Library".into()),
                metadata_uri: None,
                added_at: None,
                security_scoped_bookmark: None,
            },
            100,
        )
        .await
        .unwrap();
        let source_file = directory.path().join("book.epub");
        tokio::fs::write(&source_file, b"epub").await.unwrap();
        crate::services::catalog::CatalogService::import_local_book(
            &config_one,
            &created.id,
            &sidecars_one.join(&created.id),
            &library_root,
            crate::models::ImportBookRequest {
                source_file_path: source_file.to_string_lossy().into_owned(),
                title: Some("Book".into()),
                authors: vec!["Author".into()],
                recorded_at_ms: 200,
                consume_source_file: false,
            },
        )
        .await
        .unwrap();
        let operator = Operator::new(
            Fs::default().root(library_root.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &sidecars_one.join(&created.id),
            &library_root,
            300,
            SidecarSyncMode::PushOnly,
            &operator,
            true,
        )
        .await
        .unwrap();

        let (_, opened) = LibraryService::open_local_myreader(
            &config_two,
            LocalLibraryRequest {
                library_root_path: library_root.to_string_lossy().into_owned(),
                path: "file:///shared-library".into(),
                source_path: None,
                sidecar_container_parent_path: Some(sidecars_two.to_string_lossy().into_owned()),
                name: None,
                metadata_uri: None,
                added_at: None,
                security_scoped_bookmark: None,
            },
            400,
        )
        .await
        .unwrap();

        assert_eq!(opened.library_type, LibraryType::MyReader);
        assert_eq!(opened.book_count, 1);
        assert_eq!(
            crate::services::catalog::CatalogService::list_myreader_books(
                &sidecars_two.join(&opened.id),
                &library_root,
            )
            .await
            .unwrap()[0]
                .title,
            "Book"
        );
    }

    #[tokio::test]
    async fn should_complete_sidecar_sync_when_remote_import_upload_is_pending() {
        let directory = tempfile::tempdir().unwrap();
        let remote_root = directory.path().join("remote");
        let remote_library = remote_root.join("Books/Library");
        std::fs::create_dir_all(remote_root.join("Books")).unwrap();
        let base_operator = Operator::new(
            Fs::default().root(remote_root.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let scoped_operator = Operator::new(
            Fs::default().root(remote_library.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let config_path = directory.path().join("config.json");
        crate::services::config::ConfigService::load_or_initialize(
            &config_path,
            Some(crate::models::AppConfig {
                schema_version: crate::models::APP_CONFIG_SCHEMA_VERSION,
                data_sources: vec![DataSource::Webdav {
                    id: "source".into(),
                    name: "Source".into(),
                    enabled: true,
                    endpoint: "https://example.com".into(),
                    username: "reader".into(),
                    root_path: None,
                    has_password: true,
                    credential_reference: None,
                    readonly: None,
                    created_at: None,
                }],
                libraries: Vec::new(),
                active_library_id: None,
                ..crate::models::AppConfig::empty()
            }),
        )
        .unwrap();
        let libraries_root = directory.path().join("libraries");
        let (_, library) = create_remote_myreader_with_operators(
            &config_path,
            RemoteLibraryRequest {
                data_source_id: "source".into(),
                source_path: "Books/Library".into(),
                libraries_root_path: libraries_root.to_string_lossy().into_owned(),
                libraries_root_uri: None,
                name: Some("Remote Library".into()),
                added_at: None,
            },
            "webdav",
            "Source",
            100,
            &base_operator,
            &scoped_operator,
        )
        .await
        .unwrap();
        let local_root = libraries_root.join(&library.id);
        let source_file = directory.path().join("The Dispossessed.epub");
        tokio::fs::write(&source_file, b"epub-content")
            .await
            .unwrap();
        let sync_lock = crate::services::sync::library_sync_lock(&local_root).unwrap();
        let sync_guard = sync_lock.lock().await;
        let imported = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            crate::services::catalog::CatalogService::stage_remote_book_import(
                &config_path,
                &library.id,
                &local_root,
                &local_root,
                crate::models::ImportBookRequest {
                    source_file_path: source_file.to_string_lossy().into_owned(),
                    title: None,
                    authors: vec!["Ursula K. Le Guin".into()],
                    recorded_at_ms: 200,
                    consume_source_file: true,
                },
            ),
        )
        .await
        .expect("remote import must not wait for the background sync lock")
        .unwrap();
        drop(sync_guard);
        assert!(!source_file.exists());

        let local_books =
            crate::services::catalog::CatalogService::list_myreader_books(&local_root, &local_root)
                .await
                .unwrap();
        assert_eq!(local_books.len(), 1);
        assert_eq!(local_books[0].id, imported.id);
        assert!(
            crate::services::content::ContentService::has_pending_book_imports(&local_root)
                .await
                .unwrap()
        );
        let queued_state = crate::services::content::ContentService::list_file_states(&local_root)
            .await
            .unwrap()
            .into_iter()
            .find(|state| state.local_state == "dirty_push")
            .unwrap();
        assert!(queued_state.is_locally_available());
        assert!(local_root.join(&queued_state.path).is_file());
        assert!(!scoped_operator.exists(&queued_state.path).await.unwrap());
        assert!(
            !crate::services::sync::SyncService::has_pending_work(&local_root)
                .await
                .unwrap(),
            "a file upload must not be reported as pending sidecar work"
        );

        let database_path =
            crate::database::library_db_path(&local_root.to_string_lossy()).unwrap();
        let database_path = database_path.to_str().unwrap();
        let library_uuid =
            crate::services::catalog::CatalogService::get_source_library_uuid(&local_root)
                .await
                .unwrap();
        let identity =
            crate::sync::persistence::ensure_database_identity(database_path, &library_uuid)
                .unwrap();
        let blocked = crate::sync::exchange::sync_database_with_operator(
            database_path,
            &scoped_operator,
            &identity,
            225,
            crate::sync::exchange::SyncMode::PushOnly,
        )
        .await
        .unwrap();
        assert_eq!(
            blocked.pushed, 0,
            "catalog changes must stay local until the book file is uploaded"
        );

        let remote_automerge = remote_library.join(".myreader/automerge");
        std::fs::remove_dir_all(&remote_automerge).unwrap();
        std::fs::write(&remote_automerge, b"blocked").unwrap();
        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_root,
            &local_root,
            250,
            SidecarSyncMode::PushOnly,
            &scoped_operator,
            true,
        )
        .await
        .expect("blocked catalog work should complete without touching book bytes");
        assert!(
            !scoped_operator.exists(&queued_state.path).await.unwrap(),
            "sidecar sync must not upload book bytes"
        );
        assert!(
            crate::services::content::ContentService::has_pending_book_imports(&local_root)
                .await
                .unwrap()
        );
        std::fs::remove_file(remote_automerge).unwrap();

        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_root,
            &local_root,
            300,
            SidecarSyncMode::PushOnly,
            &scoped_operator,
            true,
        )
        .await
        .unwrap();

        assert!(!scoped_operator.exists(&queued_state.path).await.unwrap());
        assert_eq!(
            crate::services::content::ContentService::get_file_state(
                &local_root,
                &queued_state.path,
            )
            .await
            .unwrap()
            .unwrap()
            .local_state,
            "dirty_push",
            "catalog reconciliation must preserve a pending upload"
        );

        let local_book_path = local_root.join(&queued_state.path);
        let temporarily_missing_path = local_book_path.with_extension("missing");
        std::fs::rename(&local_book_path, &temporarily_missing_path).unwrap();
        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_root,
            &local_root,
            325,
            SidecarSyncMode::PushOnly,
            &scoped_operator,
            true,
        )
        .await
        .expect("a missing pending book file must not fail sidecar sync");
        assert_eq!(
            crate::services::content::ContentService::get_file_state(
                &local_root,
                &queued_state.path,
            )
            .await
            .unwrap()
            .unwrap()
            .local_state,
            "source_missing"
        );
        std::fs::rename(&temporarily_missing_path, &local_book_path).unwrap();

        crate::services::catalog::CatalogService::update_local_book_metadata(
            &config_path,
            &library.id,
            &local_root,
            &local_root,
            crate::models::UpdateBookMetadataRequest {
                book_id: imported.id,
                title: "The Dispossessed: An Ambiguous Utopia".into(),
                authors: vec!["Ursula Le Guin".into()],
                recorded_at_ms: 330,
            },
        )
        .await
        .unwrap();

        let upload = crate::services::book_transfer::BookTransferService::upload_pending_books_with_operator(
            &local_root,
            &local_root,
            &scoped_operator,
        )
        .await
        .unwrap();
        assert_eq!(upload.completed_book_uuids, vec![imported.uuid.unwrap()]);

        let books =
            crate::services::catalog::CatalogService::list_myreader_books(&local_root, &local_root)
                .await
                .unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, "The Dispossessed: An Ambiguous Utopia");
        assert_eq!(books[0].authors, ["Ursula Le Guin"]);
        assert!(scoped_operator.exists(&queued_state.path).await.unwrap());
        assert_eq!(
            crate::services::content::ContentService::get_file_state(
                &local_root,
                &queued_state.path,
            )
            .await
            .unwrap()
            .unwrap()
            .local_state,
            "present"
        );
        assert!(
            !crate::services::content::ContentService::has_pending_book_imports(&local_root)
                .await
                .unwrap()
        );

        let published = crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_root,
            &local_root,
            350,
            SidecarSyncMode::PushOnly,
            &scoped_operator,
            true,
        )
        .await
        .unwrap();
        assert!(published.pushed > 0);
    }

    #[tokio::test]
    async fn should_cancel_pending_upload_when_remote_book_is_deleted() {
        let directory = tempfile::tempdir().unwrap();
        let remote_root = directory.path().join("remote");
        let remote_library = remote_root.join("Books/Library");
        std::fs::create_dir_all(remote_root.join("Books")).unwrap();
        let base_operator = Operator::new(
            Fs::default().root(remote_root.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let scoped_operator = Operator::new(
            Fs::default().root(remote_library.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let config_path = directory.path().join("config.json");
        crate::services::config::ConfigService::load_or_initialize(
            &config_path,
            Some(crate::models::AppConfig {
                schema_version: crate::models::APP_CONFIG_SCHEMA_VERSION,
                data_sources: vec![DataSource::Webdav {
                    id: "source".into(),
                    name: "Source".into(),
                    enabled: true,
                    endpoint: "https://example.com".into(),
                    username: "reader".into(),
                    root_path: None,
                    has_password: true,
                    credential_reference: None,
                    readonly: None,
                    created_at: None,
                }],
                libraries: Vec::new(),
                active_library_id: None,
                ..crate::models::AppConfig::empty()
            }),
        )
        .unwrap();
        let libraries_root = directory.path().join("libraries");
        let (_, library) = create_remote_myreader_with_operators(
            &config_path,
            RemoteLibraryRequest {
                data_source_id: "source".into(),
                source_path: "Books/Library".into(),
                libraries_root_path: libraries_root.to_string_lossy().into_owned(),
                libraries_root_uri: None,
                name: Some("Remote Library".into()),
                added_at: None,
            },
            "webdav",
            "Source",
            100,
            &base_operator,
            &scoped_operator,
        )
        .await
        .unwrap();
        let local_root = libraries_root.join(&library.id);
        let source_file = directory.path().join("Book.epub");
        tokio::fs::write(&source_file, b"epub-content")
            .await
            .unwrap();
        let imported = crate::services::catalog::CatalogService::stage_remote_book_import(
            &config_path,
            &library.id,
            &local_root,
            &local_root,
            crate::models::ImportBookRequest {
                source_file_path: source_file.to_string_lossy().into_owned(),
                title: None,
                authors: vec!["Author".into()],
                recorded_at_ms: 200,
                consume_source_file: false,
            },
        )
        .await
        .unwrap();
        let relative_path = format!("{}/book.epub", imported.path);

        crate::services::catalog::CatalogService::delete_local_book(
            &config_path,
            &library.id,
            &local_root,
            &local_root,
            imported.id,
            300,
        )
        .await
        .unwrap();
        let report = crate::services::book_transfer::BookTransferService::upload_pending_books_with_operator(
            &local_root,
            &local_root,
            &scoped_operator,
        )
        .await
        .unwrap();

        assert!(report.completed_book_uuids.is_empty());
        assert!(report.unavailable_book_uuids.is_empty());
        assert!(
            !crate::services::content::ContentService::has_pending_book_imports(&local_root)
                .await
                .unwrap()
        );
        assert!(!local_root.join(&relative_path).exists());
        assert!(!scoped_operator.exists(&relative_path).await.unwrap());
        assert_eq!(
            crate::services::content::ContentService::get_file_state(&local_root, &relative_path)
                .await
                .unwrap()
                .unwrap()
                .local_state,
            "remote_delete_pending"
        );
    }

    #[tokio::test]
    async fn should_reject_remote_myreader_target_when_folder_already_exists() {
        let remote_root = tempfile::tempdir().unwrap();
        let operator = Operator::new(
            Fs::default().root(
                remote_root
                    .path()
                    .to_str()
                    .expect("temporary path is UTF-8"),
            ),
        )
        .unwrap()
        .finish();

        ensure_remote_myreader_create_target(&operator, "Books/Available")
            .await
            .expect("an absent target is available");

        std::fs::create_dir_all(remote_root.path().join("Books/Existing")).unwrap();
        let existing = ensure_remote_myreader_create_target(&operator, "Books/Existing")
            .await
            .unwrap_err();
        assert!(existing
            .to_string()
            .contains("LIBRARY_FOLDER_ALREADY_EXISTS"));
    }

    #[tokio::test]
    async fn should_remove_remote_target_when_local_initialization_fails() {
        let directory = tempfile::tempdir().unwrap();
        let remote_root = directory.path().join("remote");
        let source_path = "Books/Retryable";
        let remote_library = remote_root.join(source_path);
        std::fs::create_dir_all(remote_root.join("Books")).unwrap();
        let base_operator = Operator::new(
            Fs::default().root(remote_root.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let scoped_operator = Operator::new(
            Fs::default().root(remote_library.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let config_path = directory.path().join("config.json");
        crate::services::config::ConfigService::load_or_initialize(
            &config_path,
            Some(crate::models::AppConfig {
                schema_version: crate::models::APP_CONFIG_SCHEMA_VERSION,
                data_sources: vec![DataSource::Webdav {
                    id: "source".into(),
                    name: "Source".into(),
                    enabled: true,
                    endpoint: "https://example.com".into(),
                    username: "reader".into(),
                    root_path: None,
                    has_password: true,
                    credential_reference: None,
                    readonly: None,
                    created_at: None,
                }],
                libraries: Vec::new(),
                active_library_id: None,
                ..crate::models::AppConfig::empty()
            }),
        )
        .unwrap();
        let blocked_libraries_root = directory.path().join("libraries");
        std::fs::write(&blocked_libraries_root, b"not a directory").unwrap();

        let error = create_remote_myreader_with_operators(
            &config_path,
            RemoteLibraryRequest {
                data_source_id: "source".into(),
                source_path: source_path.into(),
                libraries_root_path: blocked_libraries_root.to_string_lossy().into_owned(),
                libraries_root_uri: None,
                name: Some("Retryable".into()),
                added_at: None,
            },
            "webdav",
            "Source",
            100,
            &base_operator,
            &scoped_operator,
        )
        .await
        .expect_err("the local cache root is blocked by a file");

        assert!(error.to_string().contains("Not a directory"));
        assert!(!remote_library.exists());
        ensure_remote_myreader_create_target(&base_operator, source_path)
            .await
            .expect("the same remote name is available after rollback");
    }

    #[tokio::test]
    async fn should_converge_remote_myreader_files_across_two_devices() {
        let directory = tempfile::tempdir().unwrap();
        let remote_root = directory.path().join("remote");
        let remote_library = remote_root.join("Books/Library");
        std::fs::create_dir_all(remote_root.join("Books")).unwrap();
        let base_operator = Operator::new(
            Fs::default().root(remote_root.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let scoped_operator = Operator::new(
            Fs::default().root(remote_library.to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let source = DataSource::Webdav {
            id: "source".into(),
            name: "Source".into(),
            enabled: true,
            endpoint: "https://example.com".into(),
            username: "reader".into(),
            root_path: None,
            has_password: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
        };
        let config_path_one = directory.path().join("device-one.json");
        let config_path_two = directory.path().join("device-two.json");
        for path in [&config_path_one, &config_path_two] {
            crate::services::config::ConfigService::load_or_initialize(
                path,
                Some(crate::models::AppConfig {
                    schema_version: crate::models::APP_CONFIG_SCHEMA_VERSION,
                    data_sources: vec![source.clone()],
                    libraries: Vec::new(),
                    active_library_id: None,
                    ..crate::models::AppConfig::empty()
                }),
            )
            .unwrap();
        }
        let device_one_root = directory.path().join("device-one-libraries");
        let request_one = RemoteLibraryRequest {
            data_source_id: "source".into(),
            source_path: "Books/Library".into(),
            libraries_root_path: device_one_root.to_string_lossy().into_owned(),
            libraries_root_uri: None,
            name: Some("Remote Library".into()),
            added_at: None,
        };
        let (_, library_one) = create_remote_myreader_with_operators(
            &config_path_one,
            request_one,
            "webdav",
            "Source",
            100,
            &base_operator,
            &scoped_operator,
        )
        .await
        .unwrap();
        let local_one = device_one_root.join(&library_one.id);
        let source_file = directory.path().join("The Dispossessed.epub");
        tokio::fs::write(&source_file, b"epub-content")
            .await
            .unwrap();
        let imported = crate::services::catalog::CatalogService::stage_remote_book_import(
            &config_path_one,
            &library_one.id,
            &local_one,
            &local_one,
            crate::models::ImportBookRequest {
                source_file_path: source_file.to_string_lossy().into_owned(),
                title: None,
                authors: vec!["Ursula K. Le Guin".into()],
                recorded_at_ms: 200,
                consume_source_file: false,
            },
        )
        .await
        .unwrap();
        crate::services::book_transfer::BookTransferService::upload_pending_books_with_operator(
            &local_one,
            &local_one,
            &scoped_operator,
        )
        .await
        .unwrap();
        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_one,
            &local_one,
            300,
            SidecarSyncMode::PushOnly,
            &scoped_operator,
            true,
        )
        .await
        .unwrap();

        let device_two_root = directory.path().join("device-two-libraries");
        let request_two = RemoteLibraryRequest {
            data_source_id: "source".into(),
            source_path: "Books/Library".into(),
            libraries_root_path: device_two_root.to_string_lossy().into_owned(),
            libraries_root_uri: None,
            name: None,
            added_at: None,
        };
        let (_, library_two) = open_remote_myreader_with_operators(
            &config_path_two,
            request_two,
            "webdav",
            "Source",
            400,
            &base_operator,
            &scoped_operator,
        )
        .await
        .unwrap();
        let local_two = device_two_root.join(&library_two.id);
        let books =
            crate::services::catalog::CatalogService::list_myreader_books(&local_two, &local_two)
                .await
                .unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].id, imported.id);
        let relative_path = format!("{}/book.epub", imported.path);
        let state =
            crate::services::content::ContentService::get_file_state(&local_two, &relative_path)
                .await
                .unwrap()
                .unwrap();
        assert_eq!(state.local_state, "remote_only");

        let remote_bytes = scoped_operator.read(&relative_path).await.unwrap();
        let local_file = local_two.join(&relative_path);
        tokio::fs::create_dir_all(local_file.parent().unwrap())
            .await
            .unwrap();
        let partial = local_file.with_extension("epub.part");
        tokio::fs::write(&partial, remote_bytes.to_vec())
            .await
            .unwrap();
        tokio::fs::rename(&partial, &local_file).await.unwrap();
        let marker = LibraryService::read_myreader_marker(&local_two).unwrap();
        let database_path = crate::database::library_db_path(&local_two.to_string_lossy()).unwrap();
        let identity =
            ensure_database_identity(database_path.to_str().unwrap(), &marker.library_uuid)
                .unwrap();
        let document =
            ensure_database_document(database_path.to_str().unwrap(), &identity, 400).unwrap();
        let catalog_book = document
            .projection
            .catalog_books
            .iter()
            .find(|book| book.book_id == imported.id)
            .unwrap();
        crate::services::content::ContentService::finalize_verified_downloaded_file(
            &local_two,
            &relative_path,
            &local_file,
            catalog_book.size,
            &catalog_book.sha256,
        )
        .await
        .unwrap();

        crate::services::catalog::CatalogService::delete_local_book(
            &config_path_one,
            &library_one.id,
            &local_one,
            &local_one,
            imported.id,
            500,
        )
        .await
        .unwrap();
        assert!(scoped_operator.exists(&relative_path).await.unwrap());
        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_one,
            &local_one,
            600,
            SidecarSyncMode::PushOnly,
            &scoped_operator,
            true,
        )
        .await
        .unwrap();
        assert!(!scoped_operator.exists(&relative_path).await.unwrap());

        crate::services::sync::SyncService::sync_sidecar_with_operator(
            &local_two,
            &local_two,
            700,
            SidecarSyncMode::Full,
            &scoped_operator,
            true,
        )
        .await
        .unwrap();
        assert!(
            crate::services::catalog::CatalogService::list_myreader_books(&local_two, &local_two)
                .await
                .unwrap()
                .is_empty()
        );
        assert!(!local_file.exists());
    }

    #[tokio::test]
    async fn should_persist_zero_books_when_local_book_count_is_unavailable() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let library_root = directory.path().join("Library");
        std::fs::create_dir_all(&library_root).unwrap();
        std::fs::write(library_root.join("metadata.db"), []).unwrap();

        let (_, library) = LibraryService::add_local(
            &config_path,
            LocalLibraryRequest {
                library_root_path: library_root.to_string_lossy().into_owned(),
                path: library_root.to_string_lossy().into_owned(),
                source_path: None,
                sidecar_container_parent_path: None,
                name: None,
                metadata_uri: None,
                added_at: None,
                security_scoped_bookmark: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(library.book_count, 0);
    }

    #[tokio::test]
    async fn should_download_validate_and_persist_when_remote_metadata_exists() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let remote = tempfile::tempdir().unwrap();
        let remote_library = remote.path().join("Books/Library");
        std::fs::create_dir_all(&remote_library).unwrap();
        seed_calibre_database(&remote_library.join("metadata.db"));
        let libraries = tempfile::tempdir().unwrap();
        let source = DataSource::Webdav {
            id: "source".into(),
            name: "Source".into(),
            enabled: true,
            endpoint: "https://example.com".into(),
            username: "reader".into(),
            root_path: None,
            has_password: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
        };
        crate::services::config::ConfigService::load_or_initialize(
            &config_path,
            Some(crate::models::AppConfig {
                schema_version: crate::models::APP_CONFIG_SCHEMA_VERSION,
                data_sources: vec![source],
                libraries: Vec::new(),
                active_library_id: None,
                ..crate::models::AppConfig::empty()
            }),
        )
        .unwrap();
        let operator = Operator::new(
            Fs::default().root(remote.path().to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let request = RemoteLibraryRequest {
            data_source_id: "source".into(),
            source_path: "/Books/Library/".into(),
            libraries_root_path: libraries.path().to_string_lossy().into_owned(),
            libraries_root_uri: Some("file:///libraries".into()),
            name: None,
            added_at: Some(1.0),
        };

        let (state, library) =
            add_remote_library_with_operator(&config_path, request, "webdav", "Source", &operator)
                .await
                .unwrap();

        assert_eq!(library.name, "Library");
        assert_eq!(library.book_count, 1);
        assert_eq!(library.source_path.as_deref(), Some("/Books/Library"));
        assert!(libraries
            .path()
            .join(&library.id)
            .join("metadata.db")
            .is_file());
        assert_eq!(
            state.active_library_id.as_deref(),
            Some(library.id.as_str())
        );
    }

    #[tokio::test]
    async fn should_reject_remote_metadata_refresh_when_library_is_myreader() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let library = Library {
            id: "library".into(),
            name: "Library".into(),
            path: "file:///libraries/library".into(),
            library_type: LibraryType::MyReader,
            book_count: 0,
            metadata_uri: None,
            added_at: None,
            data_source_id: Some("source".into()),
            source_type: Some("webdav".into()),
            source_path: Some("/Books/Library".into()),
            metadata_etag: None,
            security_scoped_bookmark: None,
        };
        crate::services::config::ConfigService::load_or_initialize(
            &config_path,
            Some(crate::models::AppConfig {
                schema_version: crate::models::APP_CONFIG_SCHEMA_VERSION,
                data_sources: vec![DataSource::Webdav {
                    id: "source".into(),
                    name: "Source".into(),
                    enabled: true,
                    endpoint: "https://example.com".into(),
                    username: "reader".into(),
                    root_path: None,
                    has_password: true,
                    credential_reference: None,
                    readonly: None,
                    created_at: None,
                }],
                libraries: vec![library],
                active_library_id: Some("library".into()),
                ..crate::models::AppConfig::empty()
            }),
        )
        .unwrap();

        let error = LibraryService::refresh_remote(
            &config_path,
            "library",
            directory.path(),
            &RemoteCredential::Webdav {
                password: "secret".into(),
            },
        )
        .await
        .unwrap_err();

        assert!(error.to_string().contains("LIBRARY_NOT_CALIBRE"));
    }

    #[tokio::test]
    async fn should_use_source_name_when_remote_root_is_selected() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let remote = tempfile::tempdir().unwrap();
        seed_calibre_database(&remote.path().join("metadata.db"));
        let libraries = tempfile::tempdir().unwrap();
        crate::services::config::ConfigService::load_or_initialize(
            &config_path,
            Some(crate::models::AppConfig {
                schema_version: crate::models::APP_CONFIG_SCHEMA_VERSION,
                data_sources: vec![DataSource::Webdav {
                    id: "source".into(),
                    name: "Remote Books".into(),
                    enabled: true,
                    endpoint: "https://example.com".into(),
                    username: "reader".into(),
                    root_path: None,
                    has_password: true,
                    credential_reference: None,
                    readonly: None,
                    created_at: None,
                }],
                libraries: Vec::new(),
                active_library_id: None,
                ..crate::models::AppConfig::empty()
            }),
        )
        .unwrap();
        let operator = Operator::new(
            Fs::default().root(remote.path().to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();
        let request = RemoteLibraryRequest {
            data_source_id: "source".into(),
            source_path: "/".into(),
            libraries_root_path: libraries.path().to_string_lossy().into_owned(),
            libraries_root_uri: None,
            name: None,
            added_at: None,
        };

        let (_, library) = add_remote_library_with_operator(
            &config_path,
            request,
            "webdav",
            "Remote Books",
            &operator,
        )
        .await
        .unwrap();

        assert_eq!(library.name, "Remote Books");
    }
}
