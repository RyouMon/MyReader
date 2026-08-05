use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDigest {
    pub size: i64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileState {
    pub id: String,
    pub path: String,

    pub local_state: String,
    pub local_sha256: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
    pub updated_at: f64,
}

impl FileState {
    pub fn is_locally_available(&self) -> bool {
        matches!(
            self.local_state.as_str(),
            "present" | "local_only" | "dirty_push"
        )
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStateUpdate {
    pub local_state: String,
    pub local_sha256: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadedFile {
    pub size: i64,
    pub sha256: String,
    pub mtime_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookCoverThumbnailCache {
    pub id: String,
    pub book_id: i64,
    pub cover_identity: String,
    pub thumbnail_version: String,
    pub width_px: i64,
    pub height_px: i64,
    pub file_name: String,
    pub file_size_bytes: i64,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookCoverThumbnailCachePatch {
    pub book_id: i64,
    pub cover_identity: String,
    pub thumbnail_version: String,
    pub width_px: i64,
    pub height_px: i64,
    pub file_name: String,
    pub file_size_bytes: i64,
}

#[cfg(test)]
mod tests {
    use super::FileState;

    fn state(local_state: &str) -> FileState {
        FileState {
            id: "state-1".into(),
            path: "Author/Book/Book.epub".into(),
            local_state: local_state.into(),
            local_sha256: None,
            local_size: None,
            local_mtime: None,
            updated_at: 0.0,
        }
    }

    #[test]
    fn should_report_local_availability_when_file_state_has_local_content() {
        for local_state in ["present", "local_only", "dirty_push"] {
            assert!(state(local_state).is_locally_available());
        }
        assert!(!state("remote_only").is_locally_available());
    }
}
