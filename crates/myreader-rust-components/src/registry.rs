use std::path::Path;

use crate::{run_core_async, RustComponentsError};

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeDataSource {
    pub source_type: String,
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub root_path: Option<String>,
    pub readonly: Option<bool>,
    pub created_at: Option<f64>,
    pub endpoint: Option<String>,
    pub username: Option<String>,
    pub has_password: bool,
    pub credential_reference: Option<String>,
    pub client_id: Option<String>,
    pub tenant_id: Option<String>,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub has_refresh_token: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeSecurityScopedBookmark {
    pub bookmark_base64: String,
    pub resolved_uri: String,
    pub stale: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeLibrary {
    pub id: String,
    pub name: String,
    pub path: String,
    pub book_count: i64,
    pub metadata_uri: Option<String>,
    pub added_at: Option<f64>,
    pub data_source_id: Option<String>,
    pub source_type: Option<String>,
    pub source_path: Option<String>,
    pub metadata_etag: Option<String>,
    pub security_scoped_bookmark: Option<NativeSecurityScopedBookmark>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeDeviceRegistry {
    pub schema_version: u32,
    pub data_sources: Vec<NativeDataSource>,
    pub libraries: Vec<NativeLibrary>,
    pub active_library_id: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeLocalLibraryRequest {
    pub library_root_path: String,
    pub path: String,
    pub sidecar_container_parent_path: Option<String>,
    pub name: Option<String>,
    pub metadata_uri: Option<String>,
    pub added_at: Option<f64>,
    pub security_scoped_bookmark: Option<NativeSecurityScopedBookmark>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeRemoteLibraryRequest {
    pub data_source_id: String,
    pub source_path: String,
    pub libraries_root_path: String,
    pub libraries_root_uri: Option<String>,
    pub name: Option<String>,
    pub added_at: Option<f64>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeRemoteCredential {
    pub credential_type: String,
    pub password: Option<String>,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeRemoteDirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeLibraryResult {
    pub registry: NativeDeviceRegistry,
    pub library: NativeLibrary,
}

fn required_field(value: Option<String>, field: &str) -> Result<String, RustComponentsError> {
    value.ok_or_else(|| {
        RustComponentsError::Core(format!("Invalid native data source: {field} is required"))
    })
}

impl TryFrom<NativeDataSource> for myreader_core::models::DataSource {
    type Error = RustComponentsError;

    fn try_from(source: NativeDataSource) -> Result<Self, Self::Error> {
        match source.source_type.as_str() {
            "local" => Ok(Self::Local {
                id: source.id,
                name: source.name,
                enabled: source.enabled,
                root_path: required_field(source.root_path, "rootPath")?,
                readonly: source.readonly,
                created_at: source.created_at,
            }),
            "webdav" => Ok(Self::Webdav {
                id: source.id,
                name: source.name,
                enabled: source.enabled,
                endpoint: required_field(source.endpoint, "endpoint")?,
                username: required_field(source.username, "username")?,
                root_path: source.root_path,
                has_password: source.has_password,
                credential_reference: source.credential_reference,
                readonly: source.readonly,
                created_at: source.created_at,
            }),
            "onedrive" => Ok(Self::Onedrive {
                id: source.id,
                name: source.name,
                enabled: source.enabled,
                client_id: required_field(source.client_id, "clientId")?,
                tenant_id: source.tenant_id,
                display_name: source.display_name,
                email: source.email,
                root_path: source.root_path,
                has_refresh_token: source.has_refresh_token,
                credential_reference: source.credential_reference,
                readonly: source.readonly,
                created_at: source.created_at,
            }),
            source_type => Err(RustComponentsError::Core(format!(
                "Invalid native data source type: {source_type}"
            ))),
        }
    }
}

impl From<myreader_core::models::DataSource> for NativeDataSource {
    fn from(source: myreader_core::models::DataSource) -> Self {
        match source {
            myreader_core::models::DataSource::Local {
                id,
                name,
                enabled,
                root_path,
                readonly,
                created_at,
            } => Self {
                source_type: "local".into(),
                id,
                name,
                enabled,
                root_path: Some(root_path),
                readonly,
                created_at,
                endpoint: None,
                username: None,
                has_password: false,
                credential_reference: None,
                client_id: None,
                tenant_id: None,
                display_name: None,
                email: None,
                has_refresh_token: false,
            },
            myreader_core::models::DataSource::Webdav {
                id,
                name,
                enabled,
                endpoint,
                username,
                root_path,
                has_password,
                credential_reference,
                readonly,
                created_at,
            } => Self {
                source_type: "webdav".into(),
                id,
                name,
                enabled,
                root_path,
                readonly,
                created_at,
                endpoint: Some(endpoint),
                username: Some(username),
                has_password,
                credential_reference,
                client_id: None,
                tenant_id: None,
                display_name: None,
                email: None,
                has_refresh_token: false,
            },
            myreader_core::models::DataSource::Onedrive {
                id,
                name,
                enabled,
                client_id,
                tenant_id,
                display_name,
                email,
                root_path,
                has_refresh_token,
                credential_reference,
                readonly,
                created_at,
            } => Self {
                source_type: "onedrive".into(),
                id,
                name,
                enabled,
                root_path,
                readonly,
                created_at,
                endpoint: None,
                username: None,
                has_password: false,
                credential_reference,
                client_id: Some(client_id),
                tenant_id,
                display_name,
                email,
                has_refresh_token,
            },
        }
    }
}

impl From<NativeSecurityScopedBookmark> for myreader_core::models::SecurityScopedBookmark {
    fn from(bookmark: NativeSecurityScopedBookmark) -> Self {
        Self {
            bookmark_base64: bookmark.bookmark_base64,
            resolved_uri: bookmark.resolved_uri,
            stale: bookmark.stale,
        }
    }
}

impl From<myreader_core::models::SecurityScopedBookmark> for NativeSecurityScopedBookmark {
    fn from(bookmark: myreader_core::models::SecurityScopedBookmark) -> Self {
        Self {
            bookmark_base64: bookmark.bookmark_base64,
            resolved_uri: bookmark.resolved_uri,
            stale: bookmark.stale,
        }
    }
}

impl TryFrom<NativeLibrary> for myreader_core::models::Library {
    type Error = RustComponentsError;

    fn try_from(library: NativeLibrary) -> Result<Self, Self::Error> {
        Ok(Self {
            id: library.id,
            name: library.name,
            path: library.path,
            book_count: u64::try_from(library.book_count).map_err(|error| {
                RustComponentsError::Core(format!("Invalid native library book count: {error}"))
            })?,
            metadata_uri: library.metadata_uri,
            added_at: library.added_at,
            data_source_id: library.data_source_id,
            source_type: library.source_type,
            source_path: library.source_path,
            metadata_etag: library.metadata_etag,
            security_scoped_bookmark: library.security_scoped_bookmark.map(Into::into),
        })
    }
}

impl TryFrom<myreader_core::models::Library> for NativeLibrary {
    type Error = RustComponentsError;

    fn try_from(library: myreader_core::models::Library) -> Result<Self, Self::Error> {
        Ok(Self {
            id: library.id,
            name: library.name,
            path: library.path,
            book_count: i64::try_from(library.book_count).map_err(|error| {
                RustComponentsError::Core(format!("Invalid core library book count: {error}"))
            })?,
            metadata_uri: library.metadata_uri,
            added_at: library.added_at,
            data_source_id: library.data_source_id,
            source_type: library.source_type,
            source_path: library.source_path,
            metadata_etag: library.metadata_etag,
            security_scoped_bookmark: library.security_scoped_bookmark.map(Into::into),
        })
    }
}

impl TryFrom<NativeDeviceRegistry> for myreader_core::models::DeviceRegistry {
    type Error = RustComponentsError;

    fn try_from(registry: NativeDeviceRegistry) -> Result<Self, Self::Error> {
        Ok(Self {
            schema_version: registry.schema_version,
            data_sources: registry
                .data_sources
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            libraries: registry
                .libraries
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            active_library_id: registry.active_library_id,
        })
    }
}

impl TryFrom<myreader_core::models::DeviceRegistry> for NativeDeviceRegistry {
    type Error = RustComponentsError;

    fn try_from(registry: myreader_core::models::DeviceRegistry) -> Result<Self, Self::Error> {
        Ok(Self {
            schema_version: registry.schema_version,
            data_sources: registry.data_sources.into_iter().map(Into::into).collect(),
            libraries: registry
                .libraries
                .into_iter()
                .map(TryInto::try_into)
                .collect::<Result<_, _>>()?,
            active_library_id: registry.active_library_id,
        })
    }
}

impl From<NativeLocalLibraryRequest> for myreader_core::models::LocalLibraryRequest {
    fn from(request: NativeLocalLibraryRequest) -> Self {
        Self {
            library_root_path: request.library_root_path,
            path: request.path,
            sidecar_container_parent_path: request.sidecar_container_parent_path,
            name: request.name,
            metadata_uri: request.metadata_uri,
            added_at: request.added_at,
            security_scoped_bookmark: request.security_scoped_bookmark.map(Into::into),
        }
    }
}

impl From<NativeRemoteLibraryRequest> for myreader_core::models::RemoteLibraryRequest {
    fn from(request: NativeRemoteLibraryRequest) -> Self {
        Self {
            data_source_id: request.data_source_id,
            source_path: request.source_path,
            libraries_root_path: request.libraries_root_path,
            libraries_root_uri: request.libraries_root_uri,
            name: request.name,
            added_at: request.added_at,
        }
    }
}

impl TryFrom<NativeRemoteCredential> for myreader_core::models::RemoteCredential {
    type Error = RustComponentsError;

    fn try_from(credential: NativeRemoteCredential) -> Result<Self, Self::Error> {
        match credential.credential_type.as_str() {
            "webdav" => Ok(Self::Webdav {
                password: required_field(credential.password, "password")?,
            }),
            "onedrive" => Ok(Self::Onedrive {
                access_token: required_field(credential.access_token, "accessToken")?,
            }),
            credential_type => Err(RustComponentsError::Core(format!(
                "Invalid native credential type: {credential_type}"
            ))),
        }
    }
}

fn native_registry(
    result: Result<myreader_core::models::DeviceRegistry, myreader_core::CoreError>,
) -> Result<NativeDeviceRegistry, RustComponentsError> {
    result
        .map_err(|error| RustComponentsError::Core(error.to_string()))?
        .try_into()
}

fn native_library_result(
    result: (
        myreader_core::models::DeviceRegistry,
        myreader_core::models::Library,
    ),
) -> Result<NativeLibraryResult, RustComponentsError> {
    Ok(NativeLibraryResult {
        registry: result.0.try_into()?,
        library: result.1.try_into()?,
    })
}

#[uniffi::export]
pub fn initialize_device_registry(
    registry_path: String,
    legacy_registry: Option<NativeDeviceRegistry>,
) -> Result<NativeDeviceRegistry, RustComponentsError> {
    let legacy = legacy_registry.map(TryInto::try_into).transpose()?;
    native_registry(myreader_core::api::registry::load_or_initialize(
        Path::new(&registry_path),
        legacy,
    ))
}

#[uniffi::export]
pub fn upsert_device_data_source(
    registry_path: String,
    source: NativeDataSource,
) -> Result<NativeDeviceRegistry, RustComponentsError> {
    native_registry(myreader_core::api::registry::upsert_data_source(
        Path::new(&registry_path),
        source.try_into()?,
    ))
}

#[uniffi::export]
pub fn prepare_device_data_source(
    source: NativeDataSource,
) -> Result<NativeDataSource, RustComponentsError> {
    myreader_core::api::registry::prepare_data_source(source.try_into()?)
        .map(Into::into)
        .map_err(|error| RustComponentsError::Core(error.to_string()))
}

#[uniffi::export]
pub fn validate_device_data_source(
    registry_path: String,
    source: NativeDataSource,
) -> Result<(), RustComponentsError> {
    myreader_core::api::registry::ensure_data_source_can_upsert(
        Path::new(&registry_path),
        &source.try_into()?,
    )
    .map_err(|error| RustComponentsError::Core(error.to_string()))
}

#[uniffi::export]
pub fn remove_device_data_source(
    registry_path: String,
    data_source_id: String,
) -> Result<NativeDeviceRegistry, RustComponentsError> {
    native_registry(myreader_core::api::registry::remove_data_source(
        Path::new(&registry_path),
        &data_source_id,
    ))
}

#[uniffi::export]
pub fn register_device_library(
    registry_path: String,
    library: NativeLibrary,
) -> Result<NativeDeviceRegistry, RustComponentsError> {
    native_registry(myreader_core::api::registry::register_library(
        Path::new(&registry_path),
        library.try_into()?,
    ))
}

#[uniffi::export]
pub fn replace_device_library(
    registry_path: String,
    library: NativeLibrary,
) -> Result<NativeDeviceRegistry, RustComponentsError> {
    native_registry(myreader_core::api::registry::replace_library(
        Path::new(&registry_path),
        library.try_into()?,
    ))
}

#[uniffi::export]
pub fn remove_device_library(
    registry_path: String,
    library_id: String,
) -> Result<NativeDeviceRegistry, RustComponentsError> {
    native_registry(myreader_core::api::registry::remove_library(
        Path::new(&registry_path),
        &library_id,
    ))
}

#[uniffi::export]
pub fn switch_device_library(
    registry_path: String,
    library_id: String,
) -> Result<NativeDeviceRegistry, RustComponentsError> {
    native_registry(myreader_core::api::registry::switch_library(
        Path::new(&registry_path),
        &library_id,
    ))
}

#[uniffi::export]
pub fn add_local_library(
    registry_path: String,
    request: NativeLocalLibraryRequest,
) -> Result<NativeLibraryResult, RustComponentsError> {
    native_library_result(run_core_async(myreader_core::api::library::add_local(
        Path::new(&registry_path),
        request.into(),
    ))?)
}

#[uniffi::export]
pub fn test_remote_data_source(
    source: NativeDataSource,
    credential: NativeRemoteCredential,
) -> Result<(), RustComponentsError> {
    let source = source.try_into()?;
    let credential = credential.try_into()?;
    run_core_async(myreader_core::api::datasource::test_connection(
        &source,
        &credential,
    ))
}

#[uniffi::export]
pub fn list_remote_directories(
    registry_path: String,
    data_source_id: String,
    path: String,
    credential: NativeRemoteCredential,
) -> Result<Vec<NativeRemoteDirectoryEntry>, RustComponentsError> {
    let credential = credential.try_into()?;
    let entries = run_core_async(myreader_core::api::datasource::list_directories(
        Path::new(&registry_path),
        &data_source_id,
        &path,
        &credential,
    ))?;
    Ok(entries
        .into_iter()
        .map(|entry| NativeRemoteDirectoryEntry {
            name: entry.name,
            path: entry.path,
            is_directory: entry.is_directory,
        })
        .collect())
}

#[uniffi::export]
pub fn add_remote_library(
    registry_path: String,
    request: NativeRemoteLibraryRequest,
    credential: NativeRemoteCredential,
) -> Result<NativeLibraryResult, RustComponentsError> {
    let credential = credential.try_into()?;
    native_library_result(run_core_async(myreader_core::api::library::add_remote(
        Path::new(&registry_path),
        request.into(),
        &credential,
    ))?)
}

#[uniffi::export]
pub fn refresh_remote_library(
    registry_path: String,
    library_id: String,
    local_root_path: String,
    credential: NativeRemoteCredential,
) -> Result<NativeLibraryResult, RustComponentsError> {
    let credential = credential.try_into()?;
    native_library_result(run_core_async(
        myreader_core::api::library::refresh_remote(
            Path::new(&registry_path),
            &library_id,
            Path::new(&local_root_path),
            &credential,
        ),
    )?)
}
