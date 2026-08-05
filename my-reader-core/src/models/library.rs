use serde::{Deserialize, Serialize};
use uuid::{Uuid, Variant};

use super::SecurityScopedBookmark;

pub const MYREADER_LIBRARY_MARKER_TYPE: &str = "myreader-library";
pub const MYREADER_LIBRARY_MARKER_VERSION: u32 = 1;
pub const MYREADER_LIBRARY_MARKER_RELATIVE_PATH: &str = ".myreader/library.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyReaderLibraryMarker {
    #[serde(rename = "type")]
    pub marker_type: String,
    pub version: u32,
    pub library_uuid: String,
}

impl MyReaderLibraryMarker {
    pub fn new(library_uuid: &str) -> Result<Self, String> {
        let marker = Self {
            marker_type: MYREADER_LIBRARY_MARKER_TYPE.to_owned(),
            version: MYREADER_LIBRARY_MARKER_VERSION,
            library_uuid: library_uuid.to_owned(),
        };
        marker.validate()?;
        Ok(marker)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.marker_type != MYREADER_LIBRARY_MARKER_TYPE {
            return Err("Unsupported MyReader library marker type".into());
        }
        if self.version != MYREADER_LIBRARY_MARKER_VERSION {
            return Err(format!(
                "Unsupported MyReader library marker version {}",
                self.version
            ));
        }
        let uuid = Uuid::parse_str(&self.library_uuid)
            .map_err(|_| "MyReader library UUID is invalid".to_owned())?;
        if uuid.get_variant() != Variant::RFC4122
            || !(1..=8).contains(&uuid.get_version_num())
            || uuid.hyphenated().to_string() != self.library_uuid
        {
            return Err("MyReader library UUID is invalid".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLibraryRequest {
    pub library_root_path: String,
    pub path: String,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub sidecar_container_parent_path: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub metadata_uri: Option<String>,
    #[serde(default)]
    pub added_at: Option<f64>,
    #[serde(default)]
    pub security_scoped_bookmark: Option<SecurityScopedBookmark>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteLibraryRequest {
    pub data_source_id: String,
    pub source_path: String,
    pub libraries_root_path: String,
    #[serde(default)]
    pub libraries_root_uri: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub added_at: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";

    #[test]
    fn should_encode_canonical_myreader_library_marker() {
        let marker = MyReaderLibraryMarker::new(LIBRARY_UUID).unwrap();
        let value = serde_json::to_value(marker).unwrap();

        assert_eq!(value["type"], MYREADER_LIBRARY_MARKER_TYPE);
        assert_eq!(value["version"], MYREADER_LIBRARY_MARKER_VERSION);
        assert_eq!(value["libraryUuid"], LIBRARY_UUID);
    }

    #[test]
    fn should_reject_marker_when_identity_is_not_canonical() {
        let marker = MyReaderLibraryMarker {
            marker_type: MYREADER_LIBRARY_MARKER_TYPE.into(),
            version: MYREADER_LIBRARY_MARKER_VERSION,
            library_uuid: LIBRARY_UUID.to_uppercase(),
        };

        assert_eq!(
            marker.validate().unwrap_err(),
            "MyReader library UUID is invalid"
        );
    }
}
