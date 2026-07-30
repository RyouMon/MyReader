use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarSyncMode {
    PushOnly,
    Full,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarSyncReport {
    pub pushed: usize,
    pub pulled: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncScheduleSnapshot {
    pub last_successful_pull_at: Option<i64>,
    pub next_retry_at: Option<i64>,
    pub transient_failure_count: u32,
    pub suspended_reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
