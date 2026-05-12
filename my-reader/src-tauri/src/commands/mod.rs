use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use log::{error, info};
use reqwest::Method;
use tauri::{AppHandle, State};

use crate::calibre;
use crate::error::AppError;
use crate::models::{
    AppConfig, BookDetail, BookEntry, BookIdentifier, DataSourceConfig,
    DataSourceDetail, DataSourceDto, FormatSize, JsonAny, LibraryConfig, LibraryInfo, PaginatedBooks,
    ReadingProgressDto,
};
use crate::reader_ui_prefs::ReaderUiPreferences;
use crate::reading_progress;
use crate::streamer::StreamerState;
use crate::sync::credentials;

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


pub use crate::services::cache_service::*;
pub use crate::services::config_service::{config_path, save_config};

pub mod book;
pub mod cache;
pub mod library;
pub mod progress;
pub mod reader;
pub mod source;

