use serde::{Deserialize, Serialize};

use crate::models::{AppConfig, SecurityScopedBookmark};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LibraryLocationProblem {
    RootMissing,
    PathUnavailable,
    InvalidLibrary,
    IdentityUnknown,
    IdentityMismatch,
    Credential,
    Connectivity,
    DataSource,
    Busy,
    Changed,
    Managed,
    SaveFailed,
}

impl LibraryLocationProblem {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RootMissing => "root_missing",
            Self::PathUnavailable => "path_unavailable",
            Self::InvalidLibrary => "invalid_library",
            Self::IdentityUnknown => "identity_unknown",
            Self::IdentityMismatch => "identity_mismatch",
            Self::Credential => "credential",
            Self::Connectivity => "connectivity",
            Self::DataSource => "data_source",
            Self::Busy => "busy",
            Self::Changed => "changed",
            Self::Managed => "managed",
            Self::SaveFailed => "save_failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLocation {
    pub library_id: String,
    pub library_name: String,
    pub data_source_id: Option<String>,
    pub data_source_name: Option<String>,
    pub source_root: String,
    pub path: String,
    pub effective_path: String,
    pub can_relocate: bool,
    pub problem: Option<LibraryLocationProblem>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelocateLibraryRequest {
    pub target_path: String,
    pub target_uri: Option<String>,
    pub security_scoped_bookmark: Option<SecurityScopedBookmark>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelocateLibraryResult {
    pub location: LibraryLocation,
    pub config: Option<AppConfig>,
}
