use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RemoteCredential {
    Webdav {
        password: String,
    },
    Onedrive {
        #[serde(rename = "accessToken")]
        access_token: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RemoteDirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum SidecarStorageConfig {
    LocalDirect {
        root: String,
    },
    Webdav {
        endpoint: String,
        username: String,
        password: String,
        root: Option<String>,
    },
    Onedrive {
        access_token: String,
        root: Option<String>,
    },
}
