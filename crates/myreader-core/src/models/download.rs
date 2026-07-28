use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadTaskStatus {
    Queued,
    Starting,
    Downloading,
    Done,
    Error,
    Cancelled,
}

impl DownloadTaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Starting => "starting",
            Self::Downloading => "downloading",
            Self::Done => "done",
            Self::Error => "error",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn is_active(self) -> bool {
        matches!(self, Self::Queued | Self::Starting | Self::Downloading)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTaskRequest {
    pub id: String,
    pub library_id: String,
    pub book_id: Option<String>,
    pub format: Option<String>,
    pub relative_path: String,
    pub dedupe_key: Option<String>,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub library_id: String,
    pub book_id: Option<String>,
    pub format: Option<String>,
    pub relative_path: String,
    pub label: String,
    pub status: DownloadTaskStatus,
    pub progress: f64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueuedDownloadTask {
    pub task: DownloadTask,
    pub inserted: bool,
}
