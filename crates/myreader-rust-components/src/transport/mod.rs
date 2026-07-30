mod catalog;
mod content;
mod reading;
mod registry;
#[cfg(feature = "typescript-contract")]
mod typescript;

use serde::{Deserialize, Serialize};

use crate::{parse_core_json, serialize_core_json, RustComponentsError};

pub const CORE_CONTRACT_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "domain", content = "request", rename_all = "camelCase")]
enum SyncTransportRequest {
    Catalog(catalog::CatalogSyncRequest),
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "domain", content = "response", rename_all = "camelCase")]
enum SyncTransportResponse {
    Catalog(catalog::CatalogSyncResponse),
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "domain", content = "request", rename_all = "camelCase")]
enum AsyncTransportRequest {
    Catalog(catalog::CatalogAsyncRequest),
    Content(content::ContentRequest),
    Reading(reading::ReadingRequest),
    Registry(registry::RegistryRequest),
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "domain", content = "response", rename_all = "camelCase")]
enum AsyncTransportResponse {
    Catalog(catalog::CatalogAsyncResponse),
    Content(content::ContentResponse),
    Reading(reading::ReadingResponse),
    Registry(registry::RegistryResponse),
}

pub fn invoke_sync(request_json: &str) -> Result<String, RustComponentsError> {
    let response = match parse_core_json::<SyncTransportRequest>(request_json)? {
        SyncTransportRequest::Catalog(request) => {
            SyncTransportResponse::Catalog(catalog::handle_sync(request)?)
        }
    };
    serialize_core_json(&response)
}

pub fn invoke_async(request_json: &str) -> Result<String, RustComponentsError> {
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
    };
    serialize_core_json(&response)
}

#[cfg(feature = "typescript-contract")]
pub(crate) use typescript::generate_typescript_contract;
