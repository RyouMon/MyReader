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

impl LibraryConfig {
    pub fn is_local(&self) -> bool {
        self.source_type.as_deref() == Some("local")
    }

    pub fn is_remote(&self) -> bool {
        matches!(
            self.source_type.as_deref(),
            Some("webdav") | Some("onedrive")
        )
    }
}

/// Data source configuration; persisted locally to describe connectable data locations (local directories, WebDAV, etc.).
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

/// Data source type and its connection parameters.
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
    Onedrive {
        client_id: String,
        tenant_id: String,
        #[serde(default)]
        credential_account: Option<String>,
        #[serde(default)]
        root_path: Option<String>,
        #[serde(default)]
        user_name: Option<String>,
        #[serde(default)]
        user_email: Option<String>,
    },
}

/// Newly added data sources are enabled by default so migrated legacy configs do not become invisible.
fn default_data_source_enabled() -> bool {
    true
}

/// Root application config structure, persisted to `app_data_dir/config.json` (machine-local only: library registry, active library, reader UI).
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
    /// Stable per-install device UUID, written back to config.json after first generation.
    #[serde(default)]
    pub device_id: Option<String>,
}


/// Data source DTO for the frontend. For WebDAV only whether a password is configured is returned, to avoid echoing plaintext secrets on the settings page.
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
    Onedrive {
        client_id: String,
        tenant_id: String,
        has_refresh_token: bool,
        root_path: Option<String>,
        user_name: Option<String>,
        user_email: Option<String>,
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
            DataSourceDetail::Onedrive {
                client_id,
                tenant_id,
                credential_account,
                root_path,
                user_name,
                user_email,
            } => DataSourceDetailDto::Onedrive {
                client_id: client_id.clone(),
                tenant_id: tenant_id.clone(),
                has_refresh_token: credential_account
                    .as_ref()
                    .is_some_and(|account| !account.trim().is_empty()),
                root_path: root_path.clone(),
                user_name: user_name.clone(),
                user_email: user_email.clone(),
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

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OnedriveFolderEntry {
    pub name: String,
    pub path: String,
    pub item_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OnedriveAuthResultDto {
    pub access_token: String,
    pub refresh_token: String,
    pub user_name: String,
    pub user_email: Option<String>,
}

/// Returned by `get_reading_progress`: JSON of a Readium `Locator` (compatible with `@readium/shared`).
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

/// Returned by `check_book_file_state`: describes whether a book file is cached locally.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileStateDto {
    pub path: String,
    pub local_state: String,
    pub local_size: Option<i64>,
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

// ── Inline tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_data_source_enabled_should_return_true_when_data_source_is_added() {
        assert!(default_data_source_enabled());
    }

    #[test]
    fn data_source_dto_should_preserve_local_root_path_when_local_source_has_root_path() {
        let source = DataSourceConfig {
            id: "ds-1".to_string(),
            name: "Local".to_string(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: "/tmp/books".to_string(),
            },
        };

        let dto = DataSourceDto::from(&source);
        assert_eq!(dto.id, "ds-1");
        assert_eq!(dto.name, "Local");
        assert!(dto.enabled);
        match dto.detail {
            DataSourceDetailDto::Local { root_path } => {
                assert_eq!(root_path, "/tmp/books");
            }
            _ => panic!("expected local DTO"),
        }
    }

    #[test]
    fn data_source_dto_should_mark_has_password_when_webdav_has_credential_account() {
        let source = DataSourceConfig {
            id: "ds-2".to_string(),
            name: "WebDAV".to_string(),
            enabled: false,
            detail: DataSourceDetail::Webdav {
                endpoint: "https://dav.example.com".to_string(),
                username: "user".to_string(),
                credential_account: Some("acct".to_string()),
                root_path: Some("/books".to_string()),
            },
        };

        let dto = DataSourceDto::from(&source);
        match dto.detail {
            DataSourceDetailDto::Webdav {
                endpoint,
                username,
                has_password,
                root_path,
            } => {
                assert_eq!(endpoint, "https://dav.example.com");
                assert_eq!(username, "user");
                assert!(has_password);
                assert_eq!(root_path, Some("/books".to_string()));
            }
            _ => panic!("expected webdav DTO"),
        }
    }

    #[test]
    fn data_source_dto_should_mark_no_password_when_webdav_has_blank_credential_account() {
        let source = DataSourceConfig {
            id: "ds-3".to_string(),
            name: "WebDAV".to_string(),
            enabled: true,
            detail: DataSourceDetail::Webdav {
                endpoint: "https://dav.example.com".to_string(),
                username: "user".to_string(),
                credential_account: Some("   ".to_string()),
                root_path: None,
            },
        };

        let dto = DataSourceDto::from(&source);
        match dto.detail {
            DataSourceDetailDto::Webdav { has_password, .. } => {
                assert!(!has_password);
            }
            _ => panic!("expected webdav DTO"),
        }
    }

    #[test]
    fn data_source_dto_should_carry_user_info_when_onedrive_has_user_info() {
        let source = DataSourceConfig {
            id: "ds-4".to_string(),
            name: "OneDrive".to_string(),
            enabled: true,
            detail: DataSourceDetail::Onedrive {
                client_id: "client".to_string(),
                tenant_id: "consumers".to_string(),
                credential_account: Some("acct".to_string()),
                root_path: Some("/Books".to_string()),
                user_name: Some("Wen Liang".to_string()),
                user_email: Some("wen@example.com".to_string()),
            },
        };

        let dto = DataSourceDto::from(&source);
        match dto.detail {
            DataSourceDetailDto::Onedrive {
                client_id,
                tenant_id,
                has_refresh_token,
                root_path,
                user_name,
                user_email,
            } => {
                assert_eq!(client_id, "client");
                assert_eq!(tenant_id, "consumers");
                assert!(has_refresh_token);
                assert_eq!(root_path, Some("/Books".to_string()));
                assert_eq!(user_name, Some("Wen Liang".to_string()));
                assert_eq!(user_email, Some("wen@example.com".to_string()));
            }
            _ => panic!("expected onedrive DTO"),
        }
    }
}
