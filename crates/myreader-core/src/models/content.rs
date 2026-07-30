use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct FileState {
    pub id: String,
    pub path: String,
    #[cfg_attr(
        feature = "typescript-contract",
        specta(type = crate::models::typescript_contract::FileLocalState)
    )]
    pub local_state: String,
    pub local_blake3: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
    pub updated_at: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct FileStateUpdate {
    #[cfg_attr(
        feature = "typescript-contract",
        specta(type = crate::models::typescript_contract::FileLocalState)
    )]
    pub local_state: String,
    pub local_blake3: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct DownloadedFile {
    pub size: i64,
    pub mtime_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct BookCoverThumbnailCache {
    pub id: String,
    pub book_id: i64,
    pub cover_identity: String,
    pub thumbnail_version: String,
    pub width_px: i64,
    pub height_px: i64,
    pub file_name: String,
    pub file_size_bytes: i64,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct BookCoverThumbnailCachePatch {
    pub book_id: i64,
    pub cover_identity: String,
    pub thumbnail_version: String,
    pub width_px: i64,
    pub height_px: i64,
    pub file_name: String,
    pub file_size_bytes: i64,
}
