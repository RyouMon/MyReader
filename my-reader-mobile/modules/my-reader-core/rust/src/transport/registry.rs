use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{run_core_async, CoreFfiError};

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
        legacy_registry: Option<my_reader_core::models::DeviceRegistry>,
    },
    UpsertDataSource {
        registry_path: String,
        source: my_reader_core::models::DataSource,
    },
    PrepareDataSource {
        source: my_reader_core::models::DataSource,
    },
    ValidateDataSource {
        registry_path: String,
        source: my_reader_core::models::DataSource,
    },
    RemoveDataSource {
        registry_path: String,
        data_source_id: String,
    },
    RegisterLibrary {
        registry_path: String,
        library: my_reader_core::models::Library,
    },
    ReplaceLibrary {
        registry_path: String,
        library: my_reader_core::models::Library,
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
        request: my_reader_core::models::LocalLibraryRequest,
    },
    TestRemoteDataSource {
        source: my_reader_core::models::DataSource,
        credential: my_reader_core::models::RemoteCredential,
    },
    ListRemoteDirectories {
        registry_path: String,
        data_source_id: String,
        path: String,
        credential: my_reader_core::models::RemoteCredential,
    },
    AddRemoteLibrary {
        registry_path: String,
        request: my_reader_core::models::RemoteLibraryRequest,
        credential: my_reader_core::models::RemoteCredential,
    },
    RefreshRemoteLibrary {
        registry_path: String,
        library_id: String,
        local_root_path: String,
        credential: my_reader_core::models::RemoteCredential,
    },
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum RegistryResponse {
    Initialize(my_reader_core::models::DeviceRegistry),
    UpsertDataSource(my_reader_core::models::DeviceRegistry),
    PrepareDataSource(my_reader_core::models::DataSource),
    ValidateDataSource(()),
    RemoveDataSource(my_reader_core::models::DeviceRegistry),
    RegisterLibrary(my_reader_core::models::DeviceRegistry),
    ReplaceLibrary(my_reader_core::models::DeviceRegistry),
    RemoveLibrary(my_reader_core::models::DeviceRegistry),
    SwitchLibrary(my_reader_core::models::DeviceRegistry),
    AddLocalLibrary(LibraryResult),
    TestRemoteDataSource(()),
    ListRemoteDirectories(Vec<my_reader_core::models::RemoteDirectoryEntry>),
    AddRemoteLibrary(LibraryResult),
    RefreshRemoteLibrary(LibraryResult),
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub(super) struct LibraryResult {
    registry: my_reader_core::models::DeviceRegistry,
    library: my_reader_core::models::Library,
}

pub(super) fn handle(request: RegistryRequest) -> Result<RegistryResponse, CoreFfiError> {
    Ok(match request {
        RegistryRequest::Initialize {
            registry_path,
            legacy_registry,
        } => RegistryResponse::Initialize(core_result(
            my_reader_core::api::registry::load_or_initialize(
                Path::new(&registry_path),
                legacy_registry,
            ),
        )?),
        RegistryRequest::UpsertDataSource {
            registry_path,
            source,
        } => RegistryResponse::UpsertDataSource(core_result(
            my_reader_core::api::registry::upsert_data_source(Path::new(&registry_path), source),
        )?),
        RegistryRequest::PrepareDataSource { source } => RegistryResponse::PrepareDataSource(
            core_result(my_reader_core::api::registry::prepare_data_source(source))?,
        ),
        RegistryRequest::ValidateDataSource {
            registry_path,
            source,
        } => RegistryResponse::ValidateDataSource(core_result(
            my_reader_core::api::registry::ensure_data_source_can_upsert(
                Path::new(&registry_path),
                &source,
            ),
        )?),
        RegistryRequest::RemoveDataSource {
            registry_path,
            data_source_id,
        } => RegistryResponse::RemoveDataSource(core_result(
            my_reader_core::api::registry::remove_data_source(
                Path::new(&registry_path),
                &data_source_id,
            ),
        )?),
        RegistryRequest::RegisterLibrary {
            registry_path,
            library,
        } => RegistryResponse::RegisterLibrary(core_result(
            my_reader_core::api::registry::register_library(Path::new(&registry_path), library),
        )?),
        RegistryRequest::ReplaceLibrary {
            registry_path,
            library,
        } => RegistryResponse::ReplaceLibrary(core_result(
            my_reader_core::api::registry::replace_library(Path::new(&registry_path), library),
        )?),
        RegistryRequest::RemoveLibrary {
            registry_path,
            library_id,
        } => RegistryResponse::RemoveLibrary(core_result(
            my_reader_core::api::registry::remove_library(Path::new(&registry_path), &library_id),
        )?),
        RegistryRequest::SwitchLibrary {
            registry_path,
            library_id,
        } => RegistryResponse::SwitchLibrary(core_result(
            my_reader_core::api::registry::switch_library(Path::new(&registry_path), &library_id),
        )?),
        RegistryRequest::AddLocalLibrary {
            registry_path,
            request,
        } => {
            let (registry, library) = run_core_async(my_reader_core::api::library::add_local(
                Path::new(&registry_path),
                request,
            ))?;
            RegistryResponse::AddLocalLibrary(LibraryResult { registry, library })
        }
        RegistryRequest::TestRemoteDataSource { source, credential } => {
            RegistryResponse::TestRemoteDataSource(run_core_async(
                my_reader_core::api::datasource::test_connection(&source, &credential),
            )?)
        }
        RegistryRequest::ListRemoteDirectories {
            registry_path,
            data_source_id,
            path,
            credential,
        } => RegistryResponse::ListRemoteDirectories(run_core_async(
            my_reader_core::api::datasource::list_directories(
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
            let (registry, library) = run_core_async(my_reader_core::api::library::add_remote(
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
            let (registry, library) =
                run_core_async(my_reader_core::api::library::refresh_remote(
                    Path::new(&registry_path),
                    &library_id,
                    Path::new(&local_root_path),
                    &credential,
                ))?;
            RegistryResponse::RefreshRemoteLibrary(LibraryResult { registry, library })
        }
    })
}

fn core_result<T>(result: Result<T, my_reader_core::CoreError>) -> Result<T, CoreFfiError> {
    result.map_err(|error| CoreFfiError::Core(error.to_string()))
}
