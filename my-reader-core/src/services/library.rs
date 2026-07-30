use std::path::{Path, PathBuf};

use opendal::Operator;
use sea_orm::{Database, EntityTrait, PaginatorTrait};
use uuid::Uuid;

use crate::{
    infrastructure::storage,
    models::{
        AppConfig, DataSource, Library, LocalLibraryRequest, RemoteCredential, RemoteLibraryRequest,
    },
    services::config,
    CoreError,
};

pub struct LibraryService;

impl LibraryService {
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
            book_count,
            metadata_uri: request.metadata_uri,
            added_at: request.added_at,
            data_source_id: None,
            source_type: Some("local".into()),
            source_path: None,
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
