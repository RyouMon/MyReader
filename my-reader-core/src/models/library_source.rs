use serde::{Deserialize, Serialize};

/// Storage backend recorded in the library registry. Keeping unknown strings
/// avoids discarding a library when reading a config from another version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "String", into = "String")]
pub enum LibrarySourceType {
    Local,
    Webdav,
    Onedrive,
    Unknown(String),
}

impl LibrarySourceType {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Local => "local",
            Self::Webdav => "webdav",
            Self::Onedrive => "onedrive",
            Self::Unknown(value) => value,
        }
    }

    pub fn is_remote(&self) -> bool {
        matches!(self, Self::Webdav | Self::Onedrive)
    }
}

impl From<String> for LibrarySourceType {
    fn from(value: String) -> Self {
        match value.as_str() {
            "local" => Self::Local,
            "webdav" => Self::Webdav,
            "onedrive" => Self::Onedrive,
            _ => Self::Unknown(value),
        }
    }
}

impl From<&str> for LibrarySourceType {
    fn from(value: &str) -> Self {
        value.to_owned().into()
    }
}

impl From<LibrarySourceType> for String {
    fn from(value: LibrarySourceType) -> Self {
        match value {
            LibrarySourceType::Unknown(value) => value,
            value => value.as_str().to_owned(),
        }
    }
}
