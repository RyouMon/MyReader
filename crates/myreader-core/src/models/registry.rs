use serde::{Deserialize, Serialize};

pub const DEVICE_REGISTRY_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRegistry {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub data_sources: Vec<DataSource>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(default)]
    pub active_library_id: Option<String>,
}

impl DeviceRegistry {
    pub fn empty() -> Self {
        Self {
            schema_version: DEVICE_REGISTRY_SCHEMA_VERSION,
            ..Self::default()
        }
    }
}

fn default_schema_version() -> u32 {
    DEVICE_REGISTRY_SCHEMA_VERSION
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DataSource {
    Local {
        id: String,
        name: String,
        #[serde(default = "enabled_by_default")]
        enabled: bool,
        root_path: String,
        #[serde(default)]
        readonly: Option<bool>,
        #[serde(default)]
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
        root_path: Option<String>,
        #[serde(default)]
        has_password: bool,
        #[serde(default)]
        credential_reference: Option<String>,
        #[serde(default)]
        readonly: Option<bool>,
        #[serde(default)]
        created_at: Option<f64>,
    },
    Onedrive {
        id: String,
        name: String,
        #[serde(default = "enabled_by_default")]
        enabled: bool,
        client_id: String,
        #[serde(default)]
        tenant_id: Option<String>,
        #[serde(default)]
        display_name: Option<String>,
        #[serde(default)]
        email: Option<String>,
        #[serde(default)]
        root_path: Option<String>,
        #[serde(default)]
        has_refresh_token: bool,
        #[serde(default)]
        credential_reference: Option<String>,
        #[serde(default)]
        readonly: Option<bool>,
        #[serde(default)]
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
