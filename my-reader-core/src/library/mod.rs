//! Shared library access below use-case services. Database pooling, migration,
//! and removal remain owned by `database`; this context never opens a second pool.
#[cfg(test)]
mod tests;

pub(crate) mod metadata;

use std::path::Path;

use sea_orm::DatabaseConnection;

use crate::{
    database,
    models::{
        AppConfig, DataSource, Library, LibraryType, MyReaderLibraryMarker,
        MYREADER_LIBRARY_MARKER_RELATIVE_PATH,
    },
    repositories::calibre::CatalogRepository,
    sync::persistence::{async_io::ensure_database_identity, DatabaseIdentity},
    CoreError,
};

pub(crate) struct LibraryContext {
    database: DatabaseConnection,
    database_path: String,
}

impl LibraryContext {
    pub(crate) async fn open(sidecar_root: &Path) -> Result<Self, CoreError> {
        let database_path = Self::database_path(sidecar_root)?;
        let database = database::open_database_file(Path::new(&database_path)).await?;
        Ok(Self {
            database,
            database_path,
        })
    }

    pub(crate) fn database_path(sidecar_root: &Path) -> Result<String, CoreError> {
        let root = sidecar_root
            .to_str()
            .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
        database::library_db_path(root)?
            .into_os_string()
            .into_string()
            .map_err(|_| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))
    }

    pub(crate) fn database(&self) -> &DatabaseConnection {
        &self.database
    }

    pub(crate) fn path(&self) -> &str {
        &self.database_path
    }

    pub(crate) async fn identity(
        &self,
        library_root: &Path,
    ) -> Result<DatabaseIdentity, CoreError> {
        self.identity_for_uuid(&source_library_uuid(library_root).await?)
            .await
    }

    pub(crate) async fn identity_for_uuid(
        &self,
        library_uuid: &str,
    ) -> Result<DatabaseIdentity, CoreError> {
        Ok(ensure_database_identity(self.path(), library_uuid).await?)
    }
}

pub(crate) fn source_library_type(library_root: &Path) -> LibraryType {
    if library_root.join("metadata.db").is_file() {
        LibraryType::Calibre
    } else {
        LibraryType::MyReader
    }
}

pub(crate) async fn source_library_uuid(library_root: &Path) -> Result<String, CoreError> {
    match source_library_type(library_root) {
        LibraryType::Calibre => {
            CatalogRepository::open(&library_root.to_string_lossy())
                .await?
                .get_library_uuid()
                .await
        }
        LibraryType::MyReader => Ok(read_myreader_marker(library_root)?.library_uuid),
    }
}

pub(crate) fn read_myreader_marker(
    library_root: &Path,
) -> Result<MyReaderLibraryMarker, CoreError> {
    let path = library_root.join(MYREADER_LIBRARY_MARKER_RELATIVE_PATH);
    let bytes = std::fs::read(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            CoreError::LibraryMarkerNotFound(path.display().to_string())
        } else {
            error.into()
        }
    })?;
    let marker = serde_json::from_slice::<MyReaderLibraryMarker>(&bytes).map_err(|error| {
        CoreError::DataIntegrity(format!("MYREADER_LIBRARY_MARKER_INVALID: {error}"))
    })?;
    marker.validate().map_err(|error| {
        CoreError::DataIntegrity(format!("MYREADER_LIBRARY_MARKER_INVALID: {error}"))
    })?;
    Ok(marker)
}

/// Validate the registry snapshot before opening or mutating a managed library.
pub(crate) fn writable_myreader_library(
    config: &AppConfig,
    library_id: &str,
    library_root: &Path,
    recorded_at_ms: i64,
) -> Result<(Library, MyReaderLibraryMarker), CoreError> {
    if recorded_at_ms < 0 {
        return Err(CoreError::Config("RECORDED_AT_INVALID".into()));
    }
    let library = config
        .libraries
        .iter()
        .find(|library| library.id == library_id)
        .cloned()
        .ok_or_else(|| CoreError::LibraryNotFound(library_id.to_owned()))?;
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
        return Err(CoreError::LibraryContainsMetadataDb);
    }
    Ok((library, read_myreader_marker(library_root)?))
}
