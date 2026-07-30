use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const APP_CONFIG_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub preferences: AppPreferences,
    #[serde(default)]
    pub data_sources: Vec<DataSource>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(default)]
    pub active_library_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desktop: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mobile: Option<Value>,
    #[serde(flatten)]
    pub extensions: BTreeMap<String, Value>,
}

impl AppConfig {
    pub fn empty() -> Self {
        Self {
            schema_version: APP_CONFIG_SCHEMA_VERSION,
            device_id: None,
            preferences: AppPreferences::default(),
            data_sources: Vec::new(),
            libraries: Vec::new(),
            active_library_id: None,
            desktop: None,
            mobile: None,
            extensions: BTreeMap::new(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self::empty()
    }
}

fn default_schema_version() -> u32 {
    APP_CONFIG_SCHEMA_VERSION
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_language")]
    pub language: String,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            language: default_language(),
        }
    }
}

fn default_theme() -> String {
    "system".into()
}

fn default_language() -> String {
    "system".into()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DataSource {
    Local {
        id: String,
        name: String,
        #[serde(default = "enabled_by_default")]
        enabled: bool,
        #[serde(alias = "root_path")]
        root_path: String,
        #[serde(default)]
        readonly: Option<bool>,
        #[serde(default)]
        #[serde(alias = "created_at")]
        created_at: Option<f64>,
    },
    Webdav {
        id: String,
        name: String,
        #[serde(default = "enabled_by_default")]
        enabled: bool,
        endpoint: String,
        username: String,
        #[serde(default)]
        #[serde(alias = "root_path")]
        root_path: Option<String>,
        #[serde(default)]
        #[serde(alias = "has_password")]
        has_password: bool,
        #[serde(default)]
        #[serde(alias = "credential_reference")]
        credential_reference: Option<String>,
        #[serde(default)]
        readonly: Option<bool>,
        #[serde(default)]
        #[serde(alias = "created_at")]
        created_at: Option<f64>,
    },
    Onedrive {
        id: String,
        name: String,
        #[serde(default = "enabled_by_default")]
        enabled: bool,
        #[serde(alias = "client_id")]
        client_id: String,
        #[serde(default)]
        #[serde(alias = "tenant_id")]
        tenant_id: Option<String>,
        #[serde(default)]
        #[serde(alias = "display_name")]
        display_name: Option<String>,
        #[serde(default)]
        email: Option<String>,
        #[serde(default)]
        #[serde(alias = "root_path")]
        root_path: Option<String>,
        #[serde(default)]
        #[serde(alias = "has_refresh_token")]
        has_refresh_token: bool,
        #[serde(default)]
        #[serde(alias = "credential_reference")]
        credential_reference: Option<String>,
        #[serde(default)]
        readonly: Option<bool>,
        #[serde(default)]
        #[serde(alias = "created_at")]
        created_at: Option<f64>,
    },
}

impl DataSource {
    pub fn id(&self) -> &str {
        match self {
            Self::Local { id, .. } | Self::Webdav { id, .. } | Self::Onedrive { id, .. } => id,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            Self::Local { name, .. } | Self::Webdav { name, .. } | Self::Onedrive { name, .. } => {
                name
            }
        }
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Self::Local { .. } => "local",
            Self::Webdav { .. } => "webdav",
            Self::Onedrive { .. } => "onedrive",
        }
    }
}

fn enabled_by_default() -> bool {
    true
}

pub fn is_remote_library_source_type(source_type: Option<&str>) -> bool {
    matches!(source_type, Some("webdav") | Some("onedrive"))
}

#[cfg(test)]
mod tests {
    use super::{is_remote_library_source_type, DataSource};

    #[test]
    fn should_read_legacy_snake_case_when_data_source_is_deserialized() {
        let source = serde_json::from_value::<DataSource>(serde_json::json!({
            "type": "webdav",
            "id": "source",
            "name": "WebDAV",
            "enabled": true,
            "endpoint": "https://example.com",
            "username": "reader",
            "root_path": "Books",
            "has_password": true,
            "credential_reference": null,
            "readonly": false,
            "created_at": 1.0
        }))
        .unwrap();

        assert_eq!(source.id(), "source");
    }

    #[test]
    fn should_write_camel_case_when_data_source_is_serialized() {
        let source = DataSource::Onedrive {
            id: "source".into(),
            name: "OneDrive".into(),
            enabled: true,
            client_id: "client".into(),
            tenant_id: Some("consumers".into()),
            display_name: None,
            email: None,
            root_path: Some("Books".into()),
            has_refresh_token: true,
            credential_reference: None,
            readonly: None,
            created_at: Some(1.0),
        };

        let value = serde_json::to_value(source).unwrap();

        assert_eq!(value["clientId"], "client");
        assert_eq!(value["rootPath"], "Books");
        assert_eq!(value["hasRefreshToken"], true);
        assert!(value.get("client_id").is_none());
    }

    #[test]
    fn should_classify_network_backed_library_when_source_type_is_remote() {
        assert!(is_remote_library_source_type(Some("webdav")));
        assert!(is_remote_library_source_type(Some("onedrive")));
        assert!(!is_remote_library_source_type(Some("local")));
        assert!(!is_remote_library_source_type(None));
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub book_count: u64,
    #[serde(default)]
    pub metadata_uri: Option<String>,
    #[serde(default)]
    pub added_at: Option<f64>,
    #[serde(default)]
    pub data_source_id: Option<String>,
    #[serde(default)]
    pub source_type: Option<String>,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub metadata_etag: Option<String>,
    #[serde(default)]
    pub security_scoped_bookmark: Option<SecurityScopedBookmark>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityScopedBookmark {
    pub bookmark_base64: String,
    pub resolved_uri: String,
    pub stale: bool,
}
