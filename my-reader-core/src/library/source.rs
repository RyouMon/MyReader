use std::path::PathBuf;

use opendal::raw::Service;

use crate::{
    infrastructure::storage,
    models::{
        AppConfig, DataSource, LibraryLocationProblem as Problem, LibraryStorageConfig,
        LibraryType, MyReaderLibraryMarker, RemoteCredential, SyncFailureKind,
        MYREADER_LIBRARY_MARKER_RELATIVE_PATH,
    },
    repositories::calibre::CatalogRepository,
    sync::transport,
    CoreError,
};

pub(crate) type Failure = (Problem, String);

pub(crate) fn resolve_storage(
    config: &AppConfig,
    library_id: &str,
    local_root_path: &str,
    credential: Option<&RemoteCredential>,
) -> Result<LibraryStorageConfig, CoreError> {
    let library = config
        .libraries
        .iter()
        .find(|library| library.id == library_id)
        .ok_or_else(|| CoreError::LibraryNotFound(library_id.to_owned()))?;
    if !library.is_remote() {
        let root = local_root_path.trim();
        if root.is_empty() {
            return Err(CoreError::Config("LIBRARY_ROOT_PATH_REQUIRED".into()));
        }
        return Ok(LibraryStorageConfig::LocalDirect {
            root: root.to_owned(),
        });
    }

    let data_source_id = library
        .data_source_id
        .as_deref()
        .ok_or_else(|| CoreError::Config("LIBRARY_DATA_SOURCE_MISSING".into()))?;
    let source = config
        .data_sources
        .iter()
        .find(|source| source.id() == data_source_id)
        .ok_or_else(|| CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
    if library.source_type.as_ref() != Some(&source.source_type()) {
        return Err(CoreError::Config("LIBRARY_DATASOURCE_TYPE_MISMATCH".into()));
    }
    let credential =
        credential.ok_or_else(|| CoreError::Config("REMOTE_CREDENTIAL_REQUIRED".into()))?;
    let library_root = library.source_path.as_deref().unwrap_or_default();

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
            root: Some(storage::scope_remote_root(
                root_path.as_deref(),
                library_root,
            )?),
        }),
        (DataSource::Onedrive { root_path, .. }, RemoteCredential::Onedrive { access_token }) => {
            Ok(LibraryStorageConfig::Onedrive {
                access_token: access_token.clone(),
                root: Some(storage::scope_remote_root(
                    root_path.as_deref(),
                    library_root,
                )?),
            })
        }
        (DataSource::Local { .. }, _) => {
            Err(CoreError::Config("LIBRARY_DATASOURCE_TYPE_MISMATCH".into()))
        }
        _ => Err(CoreError::Config(
            "DATASOURCE_CREDENTIAL_TYPE_MISMATCH".into(),
        )),
    }
}

pub(crate) fn native_path(path: &str) -> PathBuf {
    url::Url::parse(path)
        .ok()
        .and_then(|url| url.to_file_path().ok())
        .unwrap_or_else(|| PathBuf::from(path))
}

pub(crate) fn failure(problem: Problem, error: impl std::fmt::Display) -> Failure {
    (problem, error.to_string())
}

fn storage_failure(error: CoreError, missing: Problem) -> Failure {
    let problem = match &error {
        CoreError::StorageBackend(error) if error.kind() == opendal::ErrorKind::NotFound => missing,
        CoreError::Io(error) if error.kind() == std::io::ErrorKind::NotFound => missing,
        CoreError::Io(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            Problem::Credential
        }
        _ => match error.failure_kind() {
            SyncFailureKind::Credential => Problem::Credential,
            SyncFailureKind::Connectivity => Problem::Connectivity,
            _ => Problem::InvalidLibrary,
        },
    };
    failure(problem, error)
}

pub(crate) async fn ensure_root(storage: &LibraryStorageConfig) -> Result<(), CoreError> {
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

pub(crate) async fn check_root(storage: &LibraryStorageConfig) -> Result<(), Failure> {
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

pub(crate) async fn check_library_marker(
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

pub(crate) async fn target_identity(
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
