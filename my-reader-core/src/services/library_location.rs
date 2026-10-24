use opendal::raw::Service;
use std::path::{Path, PathBuf};

use crate::{
    infrastructure::storage,
    library::LibraryContext,
    models::{
        AppConfig, DataSource, Library, LibraryLocation, LibraryLocationProblem as Problem,
        LibraryStorageConfig, LibraryType, MyReaderLibraryMarker, RelocateLibraryRequest,
        RelocateLibraryResult, RemoteCredential, SyncFailureKind,
        MYREADER_LIBRARY_MARKER_RELATIVE_PATH,
    },
    repositories::calibre::CatalogRepository,
    sync::{
        persistence::{async_io as persistence, SyncScheduleState},
        transport,
    },
    CoreError,
};

use super::{config::ConfigService, library_location_gate as gate, sync::SyncService};

pub struct LibraryLocationService;

type Failure = (Problem, String);

impl LibraryLocationService {
    pub fn describe(config_path: &Path, library_id: &str) -> Result<LibraryLocation, CoreError> {
        let (config, library) = load_library(config_path, library_id)?;
        describe(config_path, &config, &library)
    }

    /// Probe only the root and the library's type marker. Missing sidecar objects
    /// are deliberately outside this diagnostic and never imply a missing root.
    pub async fn diagnose(
        config_path: &Path,
        library_id: &str,
        local_root: &Path,
        credential: Option<&RemoteCredential>,
    ) -> Result<LibraryLocation, CoreError> {
        let (config, library) = load_library(config_path, library_id)?;
        let mut location = describe(config_path, &config, &library)?;
        let result = async {
            let storage = SyncService::resolve_library_storage(
                &config,
                library_id,
                &local_root.to_string_lossy(),
                credential,
            )
            .map_err(|error| failure(Problem::DataSource, error))?;
            if let Err(problem) = check_root(&storage).await {
                if problem.0 == Problem::PathUnavailable {
                    if let Some(source) = config
                        .data_sources
                        .iter()
                        .find(|source| Some(source.id()) == library.data_source_id.as_deref())
                    {
                        let mut base = config.clone();
                        base.libraries
                            .iter_mut()
                            .find(|item| item.id == library_id)
                            .unwrap()
                            .source_path = Some("/".into());
                        let base_storage =
                            SyncService::resolve_library_storage(&base, library_id, "", credential)
                                .map_err(|error| failure(Problem::DataSource, error))?;
                        if let Err((_, detail)) = check_root(&base_storage).await {
                            return Err((
                                Problem::DataSource,
                                format!("Cannot access data source {}: {detail}", source.name()),
                            ));
                        }
                    }
                }
                return Err(problem);
            }
            check_library_marker(&storage, library.library_type).await
        }
        .await;
        if let Err((problem, detail)) = result {
            location.problem = Some(problem);
            location.detail = Some(detail);
        }
        Ok(location)
    }

    pub async fn relocate(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        request: RelocateLibraryRequest,
        credential: Option<&RemoteCredential>,
    ) -> Result<RelocateLibraryResult, CoreError> {
        let (config, library) = load_library(config_path, library_id)?;
        let location = describe(config_path, &config, &library)?;
        let mut result = RelocateLibraryResult {
            location,
            config: None,
        };
        let outcome = Self::relocate_checked(
            config_path,
            sidecar_root,
            &config,
            &library,
            &result.location,
            request,
            credential,
        )
        .await;
        match outcome {
            Ok(config) => {
                result.location = describe(
                    config_path,
                    &config,
                    config
                        .libraries
                        .iter()
                        .find(|item| item.id == library_id)
                        .unwrap(),
                )?;
                result.config = Some(config);
            }
            Err((problem, detail)) => {
                result.location.problem = Some(problem);
                result.location.detail = Some(detail);
            }
        }
        Ok(result)
    }

    async fn relocate_checked(
        config_path: &Path,
        sidecar_root: &Path,
        config: &AppConfig,
        library: &Library,
        location: &LibraryLocation,
        request: RelocateLibraryRequest,
        credential: Option<&RemoteCredential>,
    ) -> Result<AppConfig, Failure> {
        if !location.can_relocate {
            return Err((Problem::Managed, String::new()));
        }
        let mut lease = gate::gate(sidecar_root)
            .try_write_owned()
            .map_err(|_| (Problem::Busy, String::new()))?;
        let mut next = library.clone();
        let local_target = if library.is_remote() {
            let path = storage::scope_remote_root(None, &request.target_path)
                .map_err(|error| failure(Problem::PathUnavailable, error))?;
            next.source_path = Some(path);
            PathBuf::new()
        } else {
            let root = dunce::canonicalize(request.target_path.trim())
                .map_err(|error| failure(Problem::RootMissing, error))?;
            if library.security_scoped_bookmark.is_some()
                && request.security_scoped_bookmark.is_none()
            {
                return Err((
                    Problem::Credential,
                    "Persistent directory access is required".into(),
                ));
            }
            next.path = request
                .target_uri
                .unwrap_or_else(|| root.to_string_lossy().into_owned());
            next.source_path = None;
            next.metadata_uri = (next.library_type == LibraryType::Calibre)
                .then(|| format!("{}/metadata.db", next.path.trim_end_matches('/')));
            next.security_scoped_bookmark = request.security_scoped_bookmark;
            root
        };
        let mut candidate = config.clone();
        *candidate
            .libraries
            .iter_mut()
            .find(|item| item.id == library.id)
            .unwrap() = next.clone();
        let storage = SyncService::resolve_library_storage(
            &candidate,
            &library.id,
            &local_target.to_string_lossy(),
            credential,
        )
        .map_err(|error| failure(Problem::DataSource, error))?;
        check_root(&storage).await?;
        let uuid = target_identity(&storage, library.library_type).await?;
        let database_path = LibraryContext::database_path(sidecar_root)
            .map_err(|error| failure(Problem::IdentityUnknown, error))?;
        if !Path::new(&database_path).is_file() {
            return Err((Problem::IdentityUnknown, String::new()));
        }
        let identity = persistence::read_database_identity(&database_path)
            .await
            .map_err(|error| failure(Problem::IdentityUnknown, error))?
            .ok_or_else(|| (Problem::IdentityUnknown, String::new()))?;
        if identity.library_uuid.as_str() != uuid {
            return Err((Problem::IdentityMismatch, String::new()));
        }
        next.metadata_etag = None;
        let updated = save_location(config_path, library, &next)?;
        // The database write is transactional. Roll the registry back if it fails.
        if let Err(error) = persistence::write_schedule_state(
            &database_path,
            &SyncScheduleState {
                last_successful_pull_at: None,
                next_retry_at: None,
                transient_failure_count: 0,
                suspended_reason: None,
            },
        )
        .await
        {
            save_location(config_path, &next, library)?;
            return Err(failure(Problem::SaveFailed, error));
        }
        *lease = Some(gate::Registry {
            config_path: config_path.to_path_buf(),
            library_id: library.id.clone(),
        });
        Ok(updated)
    }
}

fn load_library(config_path: &Path, library_id: &str) -> Result<(AppConfig, Library), CoreError> {
    let config = ConfigService::load(config_path)?
        .ok_or_else(|| CoreError::Config("APP_CONFIG_NOT_FOUND".into()))?;
    let library = config
        .libraries
        .iter()
        .find(|item| item.id == library_id)
        .cloned()
        .ok_or_else(|| CoreError::LibraryNotFound(library_id.into()))?;
    Ok((config, library))
}

pub(super) fn native_path(path: &str) -> PathBuf {
    url::Url::parse(path)
        .ok()
        .and_then(|url| url.to_file_path().ok())
        .unwrap_or_else(|| PathBuf::from(path))
}

fn describe(
    config_path: &Path,
    config: &AppConfig,
    library: &Library,
) -> Result<LibraryLocation, CoreError> {
    let source = config
        .data_sources
        .iter()
        .find(|source| Some(source.id()) == library.data_source_id.as_deref());
    let source_root = match source {
        Some(DataSource::Local { root_path, .. }) => root_path.clone(),
        Some(DataSource::Webdav { root_path, .. } | DataSource::Onedrive { root_path, .. }) => {
            root_path.clone().unwrap_or_else(|| "/".into())
        }
        None => String::new(),
    };
    let path = if library.is_remote() {
        library.source_path.clone().unwrap_or_else(|| "/".into())
    } else {
        library
            .security_scoped_bookmark
            .as_ref()
            .map(|bookmark| bookmark.resolved_uri.clone())
            .unwrap_or_else(|| library.path.clone())
    };
    let effective_path = if library.is_remote() {
        let scoped = storage::scope_remote_root(Some(&source_root), &path)?;
        match source {
            Some(DataSource::Webdav { endpoint, .. }) => {
                let mut endpoint = url::Url::parse(endpoint)
                    .map_err(|error| CoreError::Config(error.to_string()))?;
                let _ = endpoint.set_username("");
                let _ = endpoint.set_password(None);
                endpoint.set_query(None);
                endpoint.set_fragment(None);
                format!("{}{}", endpoint.as_str().trim_end_matches('/'), scoped)
            }
            _ => scoped,
        }
    } else {
        path.clone()
    };
    let app_root = config_path.parent().unwrap_or(Path::new(""));
    let app_root = dunce::canonicalize(app_root).unwrap_or_else(|_| app_root.to_path_buf());
    let native = native_path(&path);
    let native = dunce::canonicalize(&native).unwrap_or(native);
    let internal = [
        app_root.join("libraries"),
        app_root.join("managed-libraries"),
    ]
    .iter()
    .any(|root| native.starts_with(root));
    Ok(LibraryLocation {
        library_id: library.id.clone(),
        library_name: library.name.clone(),
        data_source_id: library.data_source_id.clone(),
        data_source_name: source.map(|source| source.name().to_owned()),
        source_root,
        path,
        effective_path,
        can_relocate: library.is_remote()
            || library.security_scoped_bookmark.is_some()
            || !internal,
        problem: None,
        detail: None,
    })
}

fn save_location(
    config_path: &Path,
    previous: &Library,
    next: &Library,
) -> Result<AppConfig, Failure> {
    ConfigService::mutate_config(config_path, |config| {
        if config.libraries.iter().any(|item| {
            item.id != next.id
                && (item.path == next.path
                    || (next.is_remote()
                        && item.data_source_id == next.data_source_id
                        && item.source_path == next.source_path))
        }) {
            return Err(CoreError::LibraryAlreadyExists);
        }
        let current = config
            .libraries
            .iter_mut()
            .find(|item| item.id == previous.id)
            .ok_or_else(|| CoreError::LibraryNotFound(previous.id.clone()))?;
        if current != previous {
            return Err(CoreError::Config("LIBRARY_LOCATION_CHANGED".into()));
        }
        *current = next.clone();
        Ok(())
    })
    .map_err(|error| failure(Problem::SaveFailed, error))
}

fn failure(problem: Problem, error: impl std::fmt::Display) -> Failure {
    (problem, error.to_string())
}

fn storage_failure(error: CoreError, missing: Problem) -> Failure {
    let problem = match &error {
        CoreError::StorageBackend(error) if error.kind() == opendal::ErrorKind::NotFound => missing,
        CoreError::Io(error) if error.kind() == std::io::ErrorKind::NotFound => missing,
        CoreError::Io(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            Problem::Credential
        }
        _ => match SyncService::failure_kind(&error) {
            SyncFailureKind::Credential => Problem::Credential,
            SyncFailureKind::Connectivity => Problem::Connectivity,
            _ => Problem::InvalidLibrary,
        },
    };
    failure(problem, error)
}

pub(super) async fn ensure_root(storage: &LibraryStorageConfig) -> Result<(), CoreError> {
    if !matches!(storage, LibraryStorageConfig::LocalDirect { .. }) {
        let operator = transport::build_storage_operator(storage)?;
        return if remote_root_metadata(&operator).await?.is_dir() {
            Ok(())
        } else {
            Err(CoreError::Config("LIBRARY_ROOT_NOT_DIRECTORY".into()))
        };
    }
    check_root(storage)
        .await
        .map_err(|(problem, detail)| match problem {
            Problem::Connectivity => CoreError::Storage(detail),
            Problem::Credential => CoreError::StorageBackend(opendal::Error::new(
                opendal::ErrorKind::PermissionDenied,
                detail,
            )),
            _ => CoreError::Config(detail),
        })
}

pub(super) async fn check_root(storage: &LibraryStorageConfig) -> Result<(), Failure> {
    if let LibraryStorageConfig::LocalDirect { root } = storage {
        let metadata = tokio::fs::metadata(root)
            .await
            .map_err(|error| storage_failure(error.into(), Problem::RootMissing))?;
        return if metadata.is_dir() {
            Ok(())
        } else {
            Err((Problem::InvalidLibrary, String::new()))
        };
    }
    let operator = transport::build_storage_operator(storage)
        .map_err(|error| storage_failure(error.into(), Problem::PathUnavailable))?;
    check_remote_root(&operator).await
}

async fn remote_root_metadata(operator: &opendal::Operator) -> opendal::Result<opendal::Metadata> {
    // OpenDAL's SimulateLayer treats "/" as an existing virtual directory.
    // Query the backend directly so this probe actually reaches WebDAV / Graph.
    operator
        .base_service()
        .stat(
            operator.base_context(),
            "/",
            opendal::raw::OpStat::default(),
        )
        .await
        .map(|result| result.into_metadata())
}

async fn check_remote_root(operator: &opendal::Operator) -> Result<(), Failure> {
    let metadata = remote_root_metadata(operator)
        .await
        .map_err(|error| storage_failure(error.into(), Problem::PathUnavailable))?;
    if metadata.is_dir() {
        Ok(())
    } else {
        Err((Problem::InvalidLibrary, String::new()))
    }
}

async fn check_library_marker(
    storage: &LibraryStorageConfig,
    library_type: LibraryType,
) -> Result<(), Failure> {
    let operator = transport::build_storage_operator(storage)
        .map_err(|error| storage_failure(error.into(), Problem::InvalidLibrary))?;
    let marker = match library_type {
        LibraryType::Calibre => "metadata.db",
        LibraryType::MyReader => MYREADER_LIBRARY_MARKER_RELATIVE_PATH,
    };
    let metadata = operator
        .stat(marker)
        .await
        .map_err(|error| storage_failure(error.into(), Problem::InvalidLibrary))?;
    if metadata.is_file() {
        Ok(())
    } else {
        Err((Problem::InvalidLibrary, String::new()))
    }
}

async fn target_identity(
    storage: &LibraryStorageConfig,
    library_type: LibraryType,
) -> Result<String, Failure> {
    let operator = transport::build_storage_operator(storage)
        .map_err(|error| storage_failure(error.into(), Problem::InvalidLibrary))?;
    if library_type == LibraryType::MyReader {
        if operator
            .exists("metadata.db")
            .await
            .map_err(|error| storage_failure(error.into(), Problem::InvalidLibrary))?
        {
            return Err((
                Problem::InvalidLibrary,
                "Target is a Calibre library".into(),
            ));
        }
        let bytes = operator
            .read(MYREADER_LIBRARY_MARKER_RELATIVE_PATH)
            .await
            .map_err(|error| storage_failure(error.into(), Problem::InvalidLibrary))?;
        let marker: MyReaderLibraryMarker = serde_json::from_slice(&bytes.to_vec())
            .map_err(|error| failure(Problem::InvalidLibrary, error))?;
        marker
            .validate()
            .map_err(|error| failure(Problem::InvalidLibrary, error))?;
        return Ok(marker.library_uuid);
    }
    let temp = tempfile::tempdir().map_err(|error| failure(Problem::SaveFailed, error))?;
    let metadata_path = temp.path().join("metadata.db");
    let bytes = operator
        .read("metadata.db")
        .await
        .map_err(|error| storage_failure(error.into(), Problem::InvalidLibrary))?;
    tokio::fs::write(&metadata_path, bytes.to_vec())
        .await
        .map_err(|error| failure(Problem::SaveFailed, error))?;
    CatalogRepository::validate_calibre_metadata(&metadata_path)
        .await
        .map_err(|error| failure(Problem::InvalidLibrary, error))?;
    CatalogRepository::read_library_uuid(&metadata_path)
        .await
        .map_err(|error| failure(Problem::InvalidLibrary, error))
}

#[cfg(test)]
mod tests;
