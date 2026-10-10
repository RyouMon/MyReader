use serde::{Deserialize, Serialize};

/// Device-local file state. Unknown wire values remain readable and round-trip
/// unchanged, but never count as locally available content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "String", into = "String")]
pub enum FileLocalState {
    RemoteOnly,
    Downloading,
    Present,
    LocalOnly,
    DirtyPush,
    SourceMissing,
    RemoteDeletePending,
    Unknown(String),
}

impl FileLocalState {
    pub fn as_str(&self) -> &str {
        match self {
            Self::RemoteOnly => "remote_only",
            Self::Downloading => "downloading",
            Self::Present => "present",
            Self::LocalOnly => "local_only",
            Self::DirtyPush => "dirty_push",
            Self::SourceMissing => "source_missing",
            Self::RemoteDeletePending => "remote_delete_pending",
            Self::Unknown(value) => value,
        }
    }

    pub fn is_locally_available(&self) -> bool {
        matches!(self, Self::Present | Self::LocalOnly | Self::DirtyPush)
    }
}

impl From<String> for FileLocalState {
    fn from(value: String) -> Self {
        match value.as_str() {
            "remote_only" => Self::RemoteOnly,
            "downloading" => Self::Downloading,
            "present" => Self::Present,
            "local_only" => Self::LocalOnly,
            "dirty_push" => Self::DirtyPush,
            "source_missing" => Self::SourceMissing,
            "remote_delete_pending" => Self::RemoteDeletePending,
            _ => Self::Unknown(value),
        }
    }
}

impl From<&str> for FileLocalState {
    fn from(value: &str) -> Self {
        value.to_owned().into()
    }
}

impl From<FileLocalState> for String {
    fn from(value: FileLocalState) -> Self {
        match value {
            FileLocalState::Unknown(value) => value,
            value => value.as_str().to_owned(),
        }
    }
}
