use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteFileStat {
    pub etag: String,
    pub size: u64,
    pub mtime_ms: i64,
}

/// A short-lived request for the platform's native background downloader.
#[derive(Debug, Clone)]
pub struct RemoteDownloadRequest {
    pub url: String,
    pub headers: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RemoteCredential {
    Webdav {
        password: String,
    },
    Onedrive {
        #[serde(rename = "accessToken")]
        access_token: String,
    },
    Gdrive {
        access_token: String,
    },
    Dropbox {
        access_token: String,
    },
    S3 {
        access_key_id: String,
        secret_access_key: String,
        session_token: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
pub enum LibraryStorageConfig {
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
    Gdrive {
        access_token: String,
        root: Option<String>,
        root_folder_id: Option<String>,
    },
    Dropbox {
        access_token: String,
        root: Option<String>,
    },
    S3 {
        endpoint: String,
        bucket: String,
        region: String,
        root: Option<String>,
        virtual_host_style: bool,
        access_key_id: String,
        secret_access_key: String,
        session_token: Option<String>,
    },
}
