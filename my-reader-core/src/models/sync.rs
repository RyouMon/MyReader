use serde::{Deserialize, Serialize};

use super::Library;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarSyncMode {
    PushOnly,
    Full,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LibrarySyncScope {
    All,
    Calibre,
    Myreader,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySyncOptions {
    pub scope: LibrarySyncScope,
    pub force_calibre: bool,
    pub sidecar_mode: SidecarSyncMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarSyncReport {
    pub pushed: usize,
    pub pulled: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyReaderSyncReport {
    pub skipped: bool,
    pub skip_reason: Option<String>,
    pub mode: SidecarSyncMode,
    pub pushed: usize,
    pub pulled: usize,
    pub error: Option<String>,
    pub failure_kind: Option<SyncFailureKind>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibreSyncReport {
    pub skipped: bool,
    pub skip_reason: Option<String>,
    pub changed: bool,
    pub library: Library,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySyncReport {
    pub library_id: String,
    pub library_name: String,
    pub calibre: CalibreSyncReport,
    pub myreader: MyReaderSyncReport,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub failure_kind: Option<SyncFailureKind>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncScheduleSnapshot {
    pub last_successful_pull_at: Option<i64>,
    pub next_retry_at: Option<i64>,
    pub transient_failure_count: u32,
    pub suspended_reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncFailureKind {
    Connectivity,
    Configuration,
    Credential,
    DataIntegrity,
    Unexpected,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncFailureDisposition {
    Retry,
    Suspend,
}
