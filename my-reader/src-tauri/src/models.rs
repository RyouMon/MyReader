use serde::{Deserialize, Serialize};

use crate::reader_ui_prefs::ReaderUiPreferences;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfig {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// 应用配置根结构，持久化为 `app_data_dir/config.json`（书库列表、活动书库、阅读器 UI）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub libraries: Vec<LibraryConfig>,
    pub active_library_id: Option<String>,
    #[serde(default)]
    pub reader_ui: ReaderUiPreferences,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            libraries: Vec::new(),
            active_library_id: None,
            reader_ui: ReaderUiPreferences::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedBooks {
    pub items: Vec<BookEntry>,
    pub total: usize,
}

/// Flattened book entry from Calibre's metadata.db with all related data pre-joined.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookEntry {
    pub id: i64,
    pub title: String,
    pub author_sort: String,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub formats: Vec<String>,
    pub has_cover: bool,
    pub path: String,
    pub timestamp: Option<String>,
    pub pubdate: Option<String>,
    pub last_modified: Option<String>,
    pub comment: Option<String>,
    pub publisher: Option<String>,
    pub languages: Vec<String>,
    pub rating: Option<i32>,
    pub uuid: Option<String>,
}

/// Extended book detail with format sizes and identifiers pre-loaded.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookDetail {
    #[serde(flatten)]
    pub book: BookEntry,
    pub format_sizes: Vec<FormatSize>,
    pub identifiers: Vec<BookIdentifier>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatSize {
    pub format: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookIdentifier {
    pub id_type: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub book_count: usize,
}

/// 与前端 `BookAnchor` 一致，序列化存入 `reading_progress.anchor_json`。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookAnchor {
    pub chapter_index: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub char_offset: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_snippet: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_snippet_after: Option<String>,
}

/// `get_reading_progress` 返回：含书库/书/格式主键字段，便于前端校验。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgressDto {
    pub library_id: String,
    pub book_id: i64,
    pub format: String,
    pub anchor: BookAnchor,
    pub updated_at: f64,
}
