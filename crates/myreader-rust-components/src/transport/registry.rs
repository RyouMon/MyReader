use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{run_core_async, RustComponentsError};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(
    tag = "operation",
    content = "input",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum RegistryRequest {
    Initialize {
        registry_path: String,
        legacy_registry: Option<myreader_core::models::DeviceRegistry>,
    },
    UpsertDataSource {
        registry_path: String,
        source: myreader_core::models::DataSource,
    },
    PrepareDataSource {
        source: myreader_core::models::DataSource,
    },
    ValidateDataSource {
        registry_path: String,
        source: myreader_core::models::DataSource,
    },
    RemoveDataSource {
        registry_path: String,
        data_source_id: String,
    },
    RegisterLibrary {
        registry_path: String,
        library: myreader_core::models::Library,
    },
    ReplaceLibrary {
        registry_path: String,
        library: myreader_core::models::Library,
    },
    RemoveLibrary {
        registry_path: String,
        library_id: String,
    },
    SwitchLibrary {
        registry_path: String,
        library_id: String,
    },
    AddLocalLibrary {
        registry_path: String,
        request: myreader_core::models::LocalLibraryRequest,
    },
    TestRemoteDataSource {
        source: myreader_core::models::DataSource,
        credential: myreader_core::models::RemoteCredential,
    },
    ListRemoteDirectories {
        registry_path: String,
        data_source_id: String,
        path: String,
        credential: myreader_core::models::RemoteCredential,
    },
    AddRemoteLibrary {
        registry_path: String,
        request: myreader_core::models::RemoteLibraryRequest,
        credential: myreader_core::models::RemoteCredential,
    },
    RefreshRemoteLibrary {
        registry_path: String,
        library_id: String,
        local_root_path: String,
        credential: myreader_core::models::RemoteCredential,
    },
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum RegistryResponse {
    Initialize(myreader_core::models::DeviceRegistry),
    UpsertDataSource(myreader_core::models::DeviceRegistry),
    PrepareDataSource(myreader_core::models::DataSource),
    ValidateDataSource(()),
    RemoveDataSource(myreader_core::models::DeviceRegistry),
    RegisterLibrary(myreader_core::models::DeviceRegistry),
    ReplaceLibrary(myreader_core::models::DeviceRegistry),
    RemoveLibrary(myreader_core::models::DeviceRegistry),
    SwitchLibrary(myreader_core::models::DeviceRegistry),
    AddLocalLibrary(LibraryResult),
    TestRemoteDataSource(()),
    ListRemoteDirectories(Vec<myreader_core::models::RemoteDirectoryEntry>),
    AddRemoteLibrary(LibraryResult),
    RefreshRemoteLibrary(LibraryResult),
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub(super) struct LibraryResult {
    registry: myreader_core::models::DeviceRegistry,
    library: myreader_core::models::Library,
}

pub(super) fn handle(request: RegistryRequest) -> Result<RegistryResponse, RustComponentsError> {
    Ok(match request {
        RegistryRequest::Initialize {
            registry_path,
            legacy_registry,
        } => RegistryResponse::Initialize(core_result(
            myreader_core::api::registry::load_or_initialize(
                Path::new(&registry_path),
                legacy_registry,
            ),
        )?),
        RegistryRequest::UpsertDataSource {
            registry_path,
            source,
        } => RegistryResponse::UpsertDataSource(core_result(
            myreader_core::api::registry::upsert_data_source(Path::new(&registry_path), source),
        )?),
        RegistryRequest::PrepareDataSource { source } => RegistryResponse::PrepareDataSource(
            core_result(myreader_core::api::registry::prepare_data_source(source))?,
        ),
        RegistryRequest::ValidateDataSource {
            registry_path,
            source,
        } => RegistryResponse::ValidateDataSource(core_result(
            myreader_core::api::registry::ensure_data_source_can_upsert(
                Path::new(&registry_path),
                &source,
            ),
        )?),
        RegistryRequest::RemoveDataSource {
            registry_path,
            data_source_id,
        } => RegistryResponse::RemoveDataSource(core_result(
            myreader_core::api::registry::remove_data_source(
                Path::new(&registry_path),
                &data_source_id,
            ),
        )?),
        RegistryRequest::RegisterLibrary {
            registry_path,
            library,
        } => RegistryResponse::RegisterLibrary(core_result(
            myreader_core::api::registry::register_library(Path::new(&registry_path), library),
        )?),
        RegistryRequest::ReplaceLibrary {
            registry_path,
            library,
        } => RegistryResponse::ReplaceLibrary(core_result(
            myreader_core::api::registry::replace_library(Path::new(&registry_path), library),
        )?),
        RegistryRequest::RemoveLibrary {
            registry_path,
            library_id,
        } => RegistryResponse::RemoveLibrary(core_result(
            myreader_core::api::registry::remove_library(Path::new(&registry_path), &library_id),
        )?),
        RegistryRequest::SwitchLibrary {
            registry_path,
            library_id,
        } => RegistryResponse::SwitchLibrary(core_result(
            myreader_core::api::registry::switch_library(Path::new(&registry_path), &library_id),
        )?),
        RegistryRequest::AddLocalLibrary {
            registry_path,
            request,
        } => {
            let (registry, library) = run_core_async(myreader_core::api::library::add_local(
                Path::new(&registry_path),
                request,
            ))?;
            RegistryResponse::AddLocalLibrary(LibraryResult { registry, library })
        }
        RegistryRequest::TestRemoteDataSource { source, credential } => {
            RegistryResponse::TestRemoteDataSource(run_core_async(
                myreader_core::api::datasource::test_connection(&source, &credential),
            )?)
        }
        RegistryRequest::ListRemoteDirectories {
            registry_path,
            data_source_id,
            path,
            credential,
        } => RegistryResponse::ListRemoteDirectories(run_core_async(
            myreader_core::api::datasource::list_directories(
                Path::new(&registry_path),
                &data_source_id,
                &path,
                &credential,
            ),
        )?),
        RegistryRequest::AddRemoteLibrary {
            registry_path,
            request,
            credential,
        } => {
            let (registry, library) = run_core_async(myreader_core::api::library::add_remote(
                Path::new(&registry_path),
                request,
                &credential,
            ))?;
            RegistryResponse::AddRemoteLibrary(LibraryResult { registry, library })
        }
        RegistryRequest::RefreshRemoteLibrary {
            registry_path,
            library_id,
            local_root_path,
            credential,
        } => {
            let (registry, library) = run_core_async(myreader_core::api::library::refresh_remote(
                Path::new(&registry_path),
                &library_id,
                Path::new(&local_root_path),
                &credential,
            ))?;
            RegistryResponse::RefreshRemoteLibrary(LibraryResult { registry, library })
        }
    })
}

fn core_result<T>(result: Result<T, myreader_core::CoreError>) -> Result<T, RustComponentsError> {
    result.map_err(|error| RustComponentsError::Core(error.to_string()))
}
