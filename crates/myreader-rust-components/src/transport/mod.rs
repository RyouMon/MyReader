mod catalog;
mod registry;

use serde::{Deserialize, Serialize};

use crate::{parse_core_json, serialize_core_json, RustComponentsError};

pub const CORE_CONTRACT_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
#[serde(tag = "domain", content = "request", rename_all = "camelCase")]
enum TransportRequest {
    Catalog(catalog::CatalogRequest),
    Registry(registry::RegistryRequest),
}

#[derive(Debug, Serialize)]
#[serde(tag = "domain", content = "response", rename_all = "camelCase")]
enum TransportResponse {
    Catalog(catalog::CatalogResponse),
    Registry(registry::RegistryResponse),
}

pub fn invoke(request_json: &str) -> Result<String, RustComponentsError> {
    let response = match parse_core_json::<TransportRequest>(request_json)? {
        TransportRequest::Catalog(request) => TransportResponse::Catalog(catalog::handle(request)?),
        TransportRequest::Registry(request) => {
            TransportResponse::Registry(registry::handle(request)?)
        }
    };
    serialize_core_json(&response)
}
