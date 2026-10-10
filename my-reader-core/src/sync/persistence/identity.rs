use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};
use uuid::{Uuid, Variant, Version};

use crate::sync::SyncError;

/// Stable source-library identity, distinct from this device's replica ID.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct LibraryUuid(String);

impl LibraryUuid {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for LibraryUuid {
    type Err = SyncError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let invalid = || SyncError::Sync("Invalid library UUID".into());
        let uuid = Uuid::parse_str(value).map_err(|_| invalid())?;
        if uuid.get_variant() != Variant::RFC4122
            || !(1..=8).contains(&uuid.get_version_num())
            || uuid.hyphenated().to_string() != value
        {
            return Err(invalid());
        }
        Ok(Self(value.to_owned()))
    }
}

impl TryFrom<String> for LibraryUuid {
    type Error = SyncError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl From<LibraryUuid> for String {
    fn from(value: LibraryUuid) -> Self {
        value.0
    }
}

impl fmt::Display for LibraryUuid {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Locally generated UUID v4 used as the Automerge actor identity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct ReplicaId(String);

impl ReplicaId {
    pub(crate) fn generate() -> Self {
        Self(Uuid::new_v4().to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for ReplicaId {
    type Err = SyncError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let invalid = || SyncError::Sync("Invalid local replica ID".into());
        let uuid = Uuid::parse_str(value).map_err(|_| invalid())?;
        if uuid.get_variant() != Variant::RFC4122
            || uuid.get_version() != Some(Version::Random)
            || uuid.hyphenated().to_string() != value
        {
            return Err(invalid());
        }
        Ok(Self(value.to_owned()))
    }
}

impl TryFrom<String> for ReplicaId {
    type Error = SyncError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

impl From<ReplicaId> for String {
    fn from(value: ReplicaId) -> Self {
        value.0
    }
}

impl fmt::Display for ReplicaId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::persistence::DatabaseIdentity;

    #[test]
    fn database_identity_keeps_its_legacy_json_shape() {
        let value = serde_json::json!({
            "libraryUuid": "11111111-2222-4333-8444-555555555555",
            "replicaId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        });
        let identity: DatabaseIdentity = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(
            identity.library_uuid.as_str(),
            value["libraryUuid"].as_str().unwrap()
        );
        assert_eq!(
            identity.replica_id.as_str(),
            value["replicaId"].as_str().unwrap()
        );
        assert_eq!(serde_json::to_value(identity).unwrap(), value);
    }

    #[test]
    fn identity_types_enforce_their_distinct_uuid_rules() {
        // A source UUID may be any supported RFC variant version, while the
        // device replica must be a random v4 UUID.
        for version in 1..=8 {
            let value = format!("aaaaaaaa-aaaa-{version}aaa-8aaa-aaaaaaaaaaaa");
            assert!(value.parse::<LibraryUuid>().is_ok());
            assert_eq!(value.parse::<ReplicaId>().is_ok(), version == 4);
        }
        for invalid in [
            "not-a-uuid",
            "00000000-0000-0000-0000-000000000000",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
            "aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa",
            "aaaaaaaa-aaaa-4aaa-7aaa-aaaaaaaaaaaa",
            "aaaaaaaa-aaaa-9aaa-8aaa-aaaaaaaaaaaa",
        ] {
            assert!(invalid.parse::<LibraryUuid>().is_err(), "{invalid}");
            assert!(invalid.parse::<ReplicaId>().is_err(), "{invalid}");
            assert!(serde_json::from_value::<LibraryUuid>(serde_json::json!(invalid)).is_err());
            assert!(serde_json::from_value::<ReplicaId>(serde_json::json!(invalid)).is_err());
        }
        let replica = ReplicaId::generate();
        assert_eq!(replica.as_str().parse::<ReplicaId>().unwrap(), replica);
    }
}
