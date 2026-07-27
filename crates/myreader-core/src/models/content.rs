use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileState {
    pub id: String,
    pub path: String,
    pub local_state: String,
    pub local_blake3: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
    pub updated_at: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStateUpdate {
    pub local_state: String,
    pub local_blake3: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
}
