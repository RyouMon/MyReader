use serde::{Deserialize, Serialize};

use super::SecurityScopedBookmark;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLibraryRequest {
    pub library_root_path: String,
    pub path: String,
    #[serde(default)]
    pub sidecar_container_parent_path: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub metadata_uri: Option<String>,
    #[serde(default)]
    pub added_at: Option<f64>,
    #[serde(default)]
    pub security_scoped_bookmark: Option<SecurityScopedBookmark>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteLibraryRequest {
    pub data_source_id: String,
    pub source_path: String,
    pub libraries_root_path: String,
    #[serde(default)]
    pub libraries_root_uri: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub added_at: Option<f64>,
}
