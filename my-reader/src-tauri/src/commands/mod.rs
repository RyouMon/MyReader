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

pub mod annotation;
pub mod book;
pub mod book_reading_format;
pub mod bookmark;
pub(crate) mod common;
pub mod download;
pub mod favorite;
pub mod library;
pub mod progress;
pub mod reader;
pub mod reading_statistics;
pub mod source;
pub mod sync;
