use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL: &str = "library-sidecar-v4";
pub const MAX_FUTURE_SKEW_MS: u64 = 5 * 60 * 1000;
pub const HASH_PREFIX_HEX_LENGTH: usize = 32;
pub const MAX_SESSION_DURATION_SECONDS: u64 = 25 * 60 * 60;
pub const PROTOCOL_ERRORS: [&str; 10] = [
    "replica_fork",
    "future_clock",
    "missing_sequence",
    "file_hash_mismatch",
    "invalid_json",
    "unsupported_protocol",
    "unsupported_domain",
    "library_mismatch",
    "invalid_change",
    "projection_failed",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderLocator {
    pub href: String,
    #[serde(rename = "type")]
    pub media_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locations: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Lww<T> {
    pub clock: String,
    pub value: T,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteValue {
    pub is_favorite: bool,
    pub added_at_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteState {
    pub book_id: u64,
    pub register: Lww<FavoriteValue>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionValue {
    pub locator: ReaderLocator,
    pub display_progression: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionState {
    pub book_id: u64,
    pub format: String,
    pub register: Lww<PositionValue>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkValue {
    pub present: bool,
    pub id: String,
    pub locator: ReaderLocator,
    pub created_at_ms: u64,
    pub deleted_at_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkState {
    pub book_id: u64,
    pub format: String,
    pub locator_key: String,
    pub register: Lww<BookmarkValue>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationHeader {
    pub book_id: u64,
    pub format: String,
    pub kind: String,
    pub locator: ReaderLocator,
    pub created_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationTombstone {
    pub clock: String,
    pub deleted_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnnotationState {
    pub id: String,
    pub header: AnnotationHeader,
    pub color: Lww<String>,
    pub note: Lww<Option<String>>,
    pub tombstone: Option<AnnotationTombstone>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSessionHeader {
    pub origin_replica_id: String,
    pub book_id: u64,
    pub format: String,
    pub local_day: String,
    pub started_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSessionState {
    pub id: String,
    pub header: ReadingSessionHeader,
    pub duration_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingCompletionState {
    pub book_id: u64,
    pub id: String,
    pub format: String,
    pub local_day: String,
    pub completed_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "domain")]
pub enum DomainState {
    #[serde(rename = "book_favorite.v1")]
    Favorite(FavoriteState),
    #[serde(rename = "reading_position.v1")]
    Position(PositionState),
    #[serde(rename = "bookmark.v1")]
    Bookmark(BookmarkState),
    #[serde(rename = "annotation.v1")]
    Annotation(AnnotationState),
    #[serde(rename = "reading_session.v1")]
    ReadingSession(ReadingSessionState),
    #[serde(rename = "reading_completion.v1")]
    ReadingCompletion(ReadingCompletionState),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub change_id: String,
    pub clock: String,
    pub state: DomainState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub protocol: String,
    pub library_uuid: String,
    pub replica_id: String,
    pub sequence: String,
    pub changes: Vec<Change>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReplicaDeviceMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReplicaSystemMetadata {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicaAppMetadata {
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub build_number: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplicaMetadata {
    pub schema_version: u8,
    pub replica_id: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<ReplicaDeviceMetadata>,
    pub system: ReplicaSystemMetadata,
    pub app: ReplicaAppMetadata,
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;
    use uuid::Uuid;

    use super::*;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContractFixture {
        protocol_errors: Vec<String>,
        segment: Segment,
        replica_metadata: ReplicaMetadata,
        locator: ReaderLocator,
    }

    fn fixture() -> ContractFixture {
        serde_json::from_str(include_str!("fixtures/contract.json"))
            .expect("shared sidecar fixture must parse")
    }

    #[test]
    fn should_preserve_json_contract_when_shared_fixtures_are_round_tripped() {
        let fixture = fixture();
        let segment = serde_json::to_string(&fixture.segment).unwrap();
        assert_eq!(
            serde_json::from_str::<Segment>(&segment).unwrap(),
            fixture.segment
        );
        assert_eq!(fixture.segment.protocol, PROTOCOL);
        assert_eq!(fixture.segment.sequence, "42");
        let library_uuid = Uuid::parse_str(&fixture.segment.library_uuid).unwrap();
        assert!((1..=8).contains(&library_uuid.get_version_num()));
        assert_eq!(
            library_uuid.hyphenated().to_string(),
            fixture.segment.library_uuid
        );
        let replica_id = Uuid::parse_str(&fixture.segment.replica_id).unwrap();
        assert_eq!(replica_id.get_version_num(), 4);
        assert_eq!(
            replica_id.hyphenated().to_string(),
            fixture.segment.replica_id
        );
        let change_id = &fixture.segment.changes[0].change_id;
        let change_uuid = Uuid::parse_str(change_id).unwrap();
        assert_eq!(change_uuid.get_version_num(), 4);
        assert_eq!(change_uuid.as_simple().to_string(), *change_id);
        assert_eq!(MAX_SESSION_DURATION_SECONDS, 90_000);

        let metadata = serde_json::to_string(&fixture.replica_metadata).unwrap();
        assert_eq!(
            serde_json::from_str::<ReplicaMetadata>(&metadata).unwrap(),
            fixture.replica_metadata
        );
        assert_eq!(
            fixture.protocol_errors,
            PROTOCOL_ERRORS.map(str::to_owned).to_vec()
        );
        assert_eq!(HASH_PREFIX_HEX_LENGTH, 32);
    }

    #[test]
    fn should_preserve_locator_when_json_is_round_tripped() {
        let locator = fixture().locator;
        let json = serde_json::to_string(&locator).unwrap();
        assert_eq!(
            serde_json::from_str::<ReaderLocator>(&json).unwrap(),
            locator
        );
    }
}
