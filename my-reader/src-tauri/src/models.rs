use serde::{Deserialize, Serialize};
use specta::Type;

use crate::reader_ui_prefs::ReaderUiPreferences;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub source_type: Option<String>,
    #[serde(default)]
    pub data_source_id: Option<String>,
    #[serde(default)]
    pub source_path: Option<String>,
}

/// 数据源配置；用于在本机保存可连接的数据位置（如本地目录、WebDAV）。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceConfig {
    pub id: String,
    pub name: String,
    #[serde(default = "default_data_source_enabled")]
    pub enabled: bool,
    #[serde(flatten)]
    pub detail: DataSourceDetail,
}

/// 数据源类型与其连接参数。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DataSourceDetail {
    Local {
        root_path: String,
    },
    Webdav {
        endpoint: String,
        username: String,
        #[serde(default)]
        credential_account: Option<String>,
        #[serde(default)]
        root_path: Option<String>,
    },
}

/// 新增数据源默认启用，避免历史配置迁移后出现不可见状态。
fn default_data_source_enabled() -> bool {
    true
}

/// 应用配置根结构，持久化为 `app_data_dir/config.json`（仅机器本地：书库注册、活动书库、阅读器 UI）。
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
#[derive(Default)]
pub struct AppConfig {
    pub libraries: Vec<LibraryConfig>,
    pub active_library_id: Option<String>,
    #[serde(default)]
    pub data_sources: Vec<DataSourceConfig>,
    #[serde(default)]
    pub reader_ui: ReaderUiPreferences,
    /// 稳定的 per-install 设备 UUID，首次生成后写回 config.json。
    #[serde(default)]
    pub device_id: Option<String>,
}


/// 前端展示用数据源 DTO，WebDAV 仅回传是否已配置密码，避免在设置页明文回显。
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DataSourceDto {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    #[serde(flatten)]
    pub detail: DataSourceDetailDto,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DataSourceDetailDto {
    Local {
        root_path: String,
    },
    Webdav {
        endpoint: String,
        username: String,
        has_password: bool,
        root_path: Option<String>,
    },
}

impl From<&DataSourceConfig> for DataSourceDto {
    fn from(value: &DataSourceConfig) -> Self {
        let detail = match &value.detail {
            DataSourceDetail::Local { root_path } => DataSourceDetailDto::Local {
                root_path: root_path.clone(),
            },
            DataSourceDetail::Webdav {
                endpoint,
                username,
                credential_account,
                root_path,
            } => DataSourceDetailDto::Webdav {
                endpoint: endpoint.clone(),
                username: username.clone(),
                has_password: credential_account
                    .as_ref()
                    .is_some_and(|account| !account.trim().is_empty()),
                root_path: root_path.clone(),
            },
        };

        Self {
            id: value.id.clone(),
            name: value.name.clone(),
            enabled: value.enabled,
            detail,
        }
    }
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedBooks {
    pub items: Vec<BookEntry>,
    pub total: usize,
}

/// Flattened book entry from Calibre's metadata.db with all related data pre-joined.
#[derive(Debug, Clone, Serialize, Type)]
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
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookDetail {
    #[serde(flatten)]
    pub book: BookEntry,
    pub format_sizes: Vec<FormatSize>,
    pub identifiers: Vec<BookIdentifier>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FormatSize {
    pub format: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BookIdentifier {
    pub id_type: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub book_count: usize,
    pub source_type: Option<String>,
    pub data_source_id: Option<String>,
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WebdavFolderEntry {
    pub name: String,
    pub path: String,
}

/// `get_reading_progress` 返回：Readium `Locator` 的 JSON（与 `@readium/shared` 一致）。
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgressDto {
    pub library_id: String,
    pub book_id: i64,
    pub format: String,
    #[specta(type = specta_typescript::Any)]
    pub locator: serde_json::Value,
    pub updated_at: f64,
}

/// Wrapper around `serde_json::Value` that exports as TypeScript `any` via specta.
/// The inner value is public so callers can access `.0` directly.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JsonAny(pub serde_json::Value);

impl specta::Type for JsonAny {
    fn definition(_types: &mut specta::Types) -> specta::datatype::DataType {
        specta::datatype::DataType::Reference(specta_typescript::define("any"))
    }
}
