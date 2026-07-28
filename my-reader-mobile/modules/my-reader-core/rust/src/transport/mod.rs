mod catalog;
mod content;
mod download;
mod reading;
mod registry;
mod sync;
#[cfg(feature = "typescript-contract")]
mod typescript;

use serde::{Deserialize, Serialize};

use crate::{parse_core_json, serialize_core_json, CoreFfiError};

pub const CORE_CONTRACT_VERSION: u32 = 2;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "domain", content = "request", rename_all = "camelCase")]
enum SyncTransportRequest {
    Catalog(catalog::CatalogSyncRequest),
    Download(download::DownloadRequest),
    Sync(sync::SyncRequest),
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "domain", content = "response", rename_all = "camelCase")]
enum SyncTransportResponse {
    Catalog(catalog::CatalogSyncResponse),
    Download(download::DownloadResponse),
    Sync(sync::SyncResponse),
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "domain", content = "request", rename_all = "camelCase")]
enum AsyncTransportRequest {
    Catalog(catalog::CatalogAsyncRequest),
    Content(content::ContentRequest),
    Reading(reading::ReadingRequest),
    Registry(registry::RegistryRequest),
    Sync(sync::SyncAsyncRequest),
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "domain", content = "response", rename_all = "camelCase")]
enum AsyncTransportResponse {
    Catalog(catalog::CatalogAsyncResponse),
    Content(content::ContentResponse),
    Reading(reading::ReadingResponse),
    Registry(registry::RegistryResponse),
    Sync(sync::SyncAsyncResponse),
}

pub fn invoke_sync(request_json: &str) -> Result<String, CoreFfiError> {
    let response = match parse_core_json::<SyncTransportRequest>(request_json)? {
        SyncTransportRequest::Catalog(request) => {
            SyncTransportResponse::Catalog(catalog::handle_sync(request)?)
        }
        SyncTransportRequest::Download(request) => {
            SyncTransportResponse::Download(download::handle(request)?)
        }
        SyncTransportRequest::Sync(request) => SyncTransportResponse::Sync(sync::handle(request)?),
    };
    serialize_core_json(&response)
}

pub fn invoke_async(request_json: &str) -> Result<String, CoreFfiError> {
    let response = match parse_core_json::<AsyncTransportRequest>(request_json)? {
        AsyncTransportRequest::Catalog(request) => {
            AsyncTransportResponse::Catalog(catalog::handle_async(request)?)
        }
        AsyncTransportRequest::Content(request) => {
            AsyncTransportResponse::Content(content::handle(request)?)
        }
        AsyncTransportRequest::Reading(request) => {
            AsyncTransportResponse::Reading(reading::handle(request)?)
        }
        AsyncTransportRequest::Registry(request) => {
            AsyncTransportResponse::Registry(registry::handle(request)?)
        }
        AsyncTransportRequest::Sync(request) => {
            AsyncTransportResponse::Sync(sync::handle_async(request)?)
        }
    };
    serialize_core_json(&response)
}

#[cfg(feature = "typescript-contract")]
pub(crate) use typescript::generate_typescript_contract;
