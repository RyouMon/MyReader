use std::sync::Mutex;

use crate::models::AppConfig;

pub type AppState = Mutex<AppConfig>;

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PreparedBookSource {
    pub format: String,
    pub file_path: String,
    pub extracted_dir_path: Option<String>,
    pub extracted_entries: Vec<String>,
    pub streamer_url: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CacheUsageDto {
    pub total_bytes: u64,
    pub max_bytes: u64,
}

pub mod book;
pub mod cache;
pub(crate) mod common;
pub mod download;
pub mod library;
pub mod progress;
pub mod reader;
pub mod source;
pub mod sync;
