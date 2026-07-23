use std::collections::HashSet;

use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::{Uuid, Variant};

use super::contract::{
    Change, DomainState, Segment, HASH_PREFIX_HEX_LENGTH, MAX_FUTURE_SKEW_MS,
    MAX_SESSION_DURATION_SECONDS, PROTOCOL,
};
use super::hlc::Hlc;

const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegmentErrorCode {
    ReplicaFork,
    FutureClock,
    MissingSequence,
    FileHashMismatch,
    InvalidJson,
    UnsupportedProtocol,
    UnsupportedDomain,
    LibraryMismatch,
    InvalidChange,
    ProjectionFailed,
}

#[derive(Debug, Error, PartialEq, Eq)]
#[error("{message}")]
pub struct SegmentError {
    pub code: SegmentErrorCode,
    message: String,
}

impl SegmentError {
    fn new(code: SegmentErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn external(code: SegmentErrorCode, message: impl Into<String>) -> Self {
        Self::new(code, message)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedSegment {
    pub sequence: String,
    pub path: String,
    pub bytes: Vec<u8>,
    pub sha256: String,
    pub change_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SegmentFileName {
    pub sequence: String,
    pub hash_prefix: String,
}

#[derive(Debug, Default)]
pub struct SegmentExpectations<'a> {
    pub library_uuid: Option<&'a str>,
    pub replica_id: Option<&'a str>,
    pub sequence: Option<&'a str>,
    pub now_ms: u64,
}

fn invalid(message: impl Into<String>) -> SegmentError {
    SegmentError::new(SegmentErrorCode::InvalidChange, message)
}

fn validate_uuid(
    value: &str,
    field: &str,
    version: Option<usize>,
    compact: bool,
) -> Result<Uuid, SegmentError> {
    let uuid = Uuid::parse_str(value).map_err(|_| invalid(format!("{field} must be a UUID")))?;
    if uuid.get_variant() != Variant::RFC4122
        || (version.is_none() && !(1..=8).contains(&uuid.get_version_num()))
        || version.is_some_and(|expected| uuid.get_version_num() != expected)
    {
        return Err(invalid(format!("{field} has an invalid UUID variant")));
    }
    let expected = if compact {
        uuid.as_simple().to_string()
    } else {
        uuid.hyphenated().to_string()
    };
    if value != expected {
        return Err(invalid(format!(
            "{field} must use lowercase canonical form"
        )));
    }
    Ok(uuid)
}

fn validate_sequence(value: &str) -> Result<u64, SegmentError> {
    let sequence = value
        .parse::<u64>()
        .map_err(|_| invalid("segment sequence must be a positive decimal"))?;
    if sequence == 0 || sequence.to_string() != value {
        return Err(invalid("segment sequence must be a positive decimal"));
    }
    Ok(sequence)
}

fn validate_safe_integer(value: u64, field: &str) -> Result<(), SegmentError> {
    if value > MAX_SAFE_INTEGER {
        return Err(invalid(format!(
            "{field} exceeds the JSON safe integer limit"
        )));
    }
    Ok(())
}

fn validate_format(value: &str, field: &str) -> Result<(), SegmentError> {
    if value.is_empty() || value != value.to_ascii_uppercase() {
        return Err(invalid(format!("{field} must be non-empty uppercase text")));
    }
    Ok(())
}

fn validate_local_day(value: &str, field: &str) -> Result<(), SegmentError> {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return Err(invalid(format!("{field} must use YYYY-MM-DD")));
    }
    Ok(())
}

fn validate_locator(locator: &super::contract::ReaderLocator) -> Result<(), SegmentError> {
    if locator.href.is_empty() || locator.media_type.is_empty() {
        return Err(invalid("locator href and type must be non-empty"));
    }
    if let Some(target) = locator.target {
        validate_safe_integer(target, "locator.target")?;
    }
    for value in [&locator.locations, &locator.text].into_iter().flatten() {
        if !value.is_object() {
            return Err(invalid("locator locations and text must be objects"));
        }
    }
    Ok(())
}

fn validate_clock(value: &str, field: &str, now_ms: u64) -> Result<Hlc, SegmentError> {
    let clock = Hlc::parse(value).map_err(|_| invalid(format!("{field} must be a valid HLC")))?;
    if clock.physical_ms > now_ms.saturating_add(MAX_FUTURE_SKEW_MS) {
        return Err(SegmentError::new(
            SegmentErrorCode::FutureClock,
            format!("{field} exceeds the future clock limit"),
        ));
    }
    Ok(clock)
}

fn validate_state(state: &DomainState, now_ms: u64) -> Result<(), SegmentError> {
    match state {
        DomainState::Favorite(value) => {
            validate_safe_integer(value.book_id, "state.bookId")?;
            if value.book_id == 0 {
                return Err(invalid("state.bookId must be positive"));
            }
            validate_clock(&value.register.clock, "state.register.clock", now_ms)?;
            if value.register.value.is_favorite != value.register.value.added_at_ms.is_some() {
                return Err(invalid("favorite addedAtMs must match isFavorite"));
            }
            if let Some(added_at_ms) = value.register.value.added_at_ms {
                validate_safe_integer(added_at_ms, "state.register.value.addedAtMs")?;
            }
        }
        DomainState::Position(value) => {
            validate_safe_integer(value.book_id, "state.bookId")?;
            if value.book_id == 0 {
                return Err(invalid("state.bookId must be positive"));
            }
            validate_format(&value.format, "state.format")?;
            validate_clock(&value.register.clock, "state.register.clock", now_ms)?;
            validate_locator(&value.register.value.locator)?;
            if value
                .register
                .value
                .display_progression
                .is_some_and(|progression| {
                    !progression.is_finite() || !(0.0..=1.0).contains(&progression)
                })
            {
                return Err(invalid("displayProgression must be between 0 and 1"));
            }
        }
        DomainState::Bookmark(value) => {
            validate_safe_integer(value.book_id, "state.bookId")?;
            if value.book_id == 0 || value.locator_key.is_empty() {
                return Err(invalid("bookmark identity is invalid"));
            }
            validate_format(&value.format, "state.format")?;
            validate_clock(&value.register.clock, "state.register.clock", now_ms)?;
            validate_uuid(&value.register.value.id, "bookmark.id", Some(4), true)?;
            validate_locator(&value.register.value.locator)?;
            validate_safe_integer(value.register.value.created_at_ms, "bookmark.createdAtMs")?;
            if let Some(deleted_at_ms) = value.register.value.deleted_at_ms {
                validate_safe_integer(deleted_at_ms, "bookmark.deletedAtMs")?;
            }
            if value.register.value.present == value.register.value.deleted_at_ms.is_some() {
                return Err(invalid("bookmark deletedAtMs must match present"));
            }
        }
        DomainState::Annotation(value) => {
            validate_uuid(&value.id, "annotation.id", Some(4), true)?;
            validate_safe_integer(value.header.book_id, "annotation.header.bookId")?;
            if value.header.book_id == 0 || value.header.kind.is_empty() {
                return Err(invalid("annotation header is invalid"));
            }
            validate_format(&value.header.format, "annotation.header.format")?;
            validate_locator(&value.header.locator)?;
            validate_safe_integer(value.header.created_at_ms, "annotation.header.createdAtMs")?;
            validate_clock(&value.color.clock, "annotation.color.clock", now_ms)?;
            if value.color.value.is_empty() {
                return Err(invalid("annotation color must be non-empty"));
            }
            validate_clock(&value.note.clock, "annotation.note.clock", now_ms)?;
            if let Some(tombstone) = &value.tombstone {
                validate_clock(&tombstone.clock, "annotation.tombstone.clock", now_ms)?;
                validate_safe_integer(tombstone.deleted_at_ms, "annotation.deletedAtMs")?;
            }
        }
        DomainState::ReadingSession(value) => {
            validate_uuid(&value.id, "session.id", Some(4), true)?;
            validate_uuid(
                &value.header.origin_replica_id,
                "session.originReplicaId",
                Some(4),
                false,
            )?;
            validate_safe_integer(value.header.book_id, "session.bookId")?;
            if value.header.book_id == 0 {
                return Err(invalid("session.bookId must be positive"));
            }
            validate_format(&value.header.format, "session.format")?;
            validate_local_day(&value.header.local_day, "session.localDay")?;
            validate_safe_integer(value.header.started_at_ms, "session.startedAtMs")?;
            validate_safe_integer(value.duration_seconds, "session.durationSeconds")?;
            if value.duration_seconds > MAX_SESSION_DURATION_SECONDS {
                return Err(invalid("session duration exceeds the limit"));
            }
        }
        DomainState::ReadingCompletion(value) => {
            validate_safe_integer(value.book_id, "completion.bookId")?;
            if value.book_id == 0 {
                return Err(invalid("completion.bookId must be positive"));
            }
            validate_uuid(&value.id, "completion.id", Some(4), true)?;
            validate_format(&value.format, "completion.format")?;
            validate_local_day(&value.local_day, "completion.localDay")?;
            validate_safe_integer(value.completed_at_ms, "completion.completedAtMs")?;
        }
    }
    Ok(())
}

fn validate_change(change: &Change, replica_id: &str, now_ms: u64) -> Result<(), SegmentError> {
    validate_uuid(&change.change_id, "change.changeId", Some(4), true)?;
    let clock = validate_clock(&change.clock, "change.clock", now_ms)?;
    if clock.replica_id.to_string() != replica_id {
        return Err(invalid("change clock must belong to segment replica"));
    }
    validate_state(&change.state, now_ms)?;
    change
        .state
        .assert_writer(replica_id)
        .map_err(|_| invalid("change writer is not allowed for this state"))
}

pub fn validate_segment(
    segment: &Segment,
    expectations: &SegmentExpectations<'_>,
) -> Result<(), SegmentError> {
    if segment.protocol != PROTOCOL {
        return Err(SegmentError::new(
            SegmentErrorCode::UnsupportedProtocol,
            "unsupported sidecar protocol",
        ));
    }
    validate_uuid(&segment.library_uuid, "segment.libraryUuid", None, false)?;
    if expectations
        .library_uuid
        .is_some_and(|expected| expected != segment.library_uuid)
    {
        return Err(SegmentError::new(
            SegmentErrorCode::LibraryMismatch,
            "segment belongs to another library",
        ));
    }
    validate_uuid(&segment.replica_id, "segment.replicaId", Some(4), false)?;
    if expectations
        .replica_id
        .is_some_and(|expected| expected != segment.replica_id)
    {
        return Err(invalid("segment replica does not match its directory"));
    }
    validate_sequence(&segment.sequence)?;
    if expectations
        .sequence
        .is_some_and(|expected| expected != segment.sequence)
    {
        return Err(invalid("segment sequence does not match its filename"));
    }
    if segment.changes.is_empty() {
        return Err(invalid("segment changes must not be empty"));
    }

    let mut change_ids = HashSet::new();
    for change in &segment.changes {
        validate_change(change, &segment.replica_id, expectations.now_ms)?;
        if !change_ids.insert(&change.change_id) {
            return Err(invalid("segment contains a duplicate changeId"));
        }
    }
    Ok(())
}

fn reject_unsupported_envelope(value: &Value) -> Result<(), SegmentError> {
    if value.get("protocol").and_then(Value::as_str) != Some(PROTOCOL) {
        return Err(SegmentError::new(
            SegmentErrorCode::UnsupportedProtocol,
            "unsupported sidecar protocol",
        ));
    }
    if let Some(changes) = value.get("changes").and_then(Value::as_array) {
        for change in changes {
            let Some(domain) = change
                .get("state")
                .and_then(|state| state.get("domain"))
                .and_then(Value::as_str)
            else {
                continue;
            };
            if !matches!(
                domain,
                "book_favorite.v1"
                    | "reading_position.v1"
                    | "bookmark.v1"
                    | "annotation.v1"
                    | "reading_session.v1"
                    | "reading_completion.v1"
            ) {
                return Err(SegmentError::new(
                    SegmentErrorCode::UnsupportedDomain,
                    format!("unsupported domain: {domain}"),
                ));
            }
        }
    }
    Ok(())
}

pub fn encode_segment(segment: &Segment, now_ms: u64) -> Result<Vec<u8>, SegmentError> {
    validate_segment(
        segment,
        &SegmentExpectations {
            now_ms,
            ..Default::default()
        },
    )?;
    serde_json::to_vec(segment).map_err(|error| invalid(error.to_string()))
}

pub fn decode_segment(
    bytes: &[u8],
    expectations: &SegmentExpectations<'_>,
) -> Result<Segment, SegmentError> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| {
        SegmentError::new(
            SegmentErrorCode::InvalidJson,
            "segment is not valid UTF-8 JSON",
        )
    })?;
    reject_unsupported_envelope(&value)?;
    let segment: Segment =
        serde_json::from_value(value).map_err(|error| invalid(error.to_string()))?;
    validate_segment(&segment, expectations)?;
    Ok(segment)
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn parse_segment_file_name(file_name: &str) -> Result<SegmentFileName, SegmentError> {
    let (sequence, suffix) = file_name
        .split_once('-')
        .ok_or_else(|| invalid("invalid segment filename"))?;
    let hash_prefix = suffix
        .strip_suffix(".json")
        .ok_or_else(|| invalid("invalid segment filename"))?;
    validate_sequence(sequence)?;
    if hash_prefix.len() != HASH_PREFIX_HEX_LENGTH
        || !hash_prefix
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid("invalid segment filename"));
    }
    Ok(SegmentFileName {
        sequence: sequence.to_owned(),
        hash_prefix: hash_prefix.to_owned(),
    })
}

pub fn prepare_segment(segment: &Segment, now_ms: u64) -> Result<PreparedSegment, SegmentError> {
    let bytes = encode_segment(segment, now_ms)?;
    let sha256 = sha256_hex(&bytes);
    let file_name = format!(
        "{}-{}.json",
        segment.sequence,
        &sha256[..HASH_PREFIX_HEX_LENGTH]
    );
    Ok(PreparedSegment {
        sequence: segment.sequence.clone(),
        path: format!(".myreader/changes-v4/{}/{}", segment.replica_id, file_name),
        bytes,
        sha256,
        change_ids: segment
            .changes
            .iter()
            .map(|change| change.change_id.clone())
            .collect(),
    })
}

pub fn decode_segment_file(
    file_name: &str,
    bytes: &[u8],
    library_uuid: &str,
    replica_id: &str,
    now_ms: u64,
) -> Result<Segment, SegmentError> {
    let parsed_name = parse_segment_file_name(file_name)?;
    let digest = sha256_hex(bytes);
    if digest[..HASH_PREFIX_HEX_LENGTH] != parsed_name.hash_prefix {
        return Err(SegmentError::new(
            SegmentErrorCode::FileHashMismatch,
            "segment hash does not match its filename",
        ));
    }
    decode_segment(
        bytes,
        &SegmentExpectations {
            library_uuid: Some(library_uuid),
            replica_id: Some(replica_id),
            sequence: Some(&parsed_name.sequence),
            now_ms,
        },
    )
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct EncodingFixture {
        sha256: String,
        file_name: String,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContractFixture {
        segment: Segment,
        segment_encoding: EncodingFixture,
    }

    fn fixture() -> ContractFixture {
        serde_json::from_str(include_str!("fixtures/contract.json"))
            .expect("shared sidecar fixture must parse")
    }

    #[test]
    fn should_produce_stable_bytes_and_path_when_segment_is_prepared() {
        let fixture = fixture();
        let prepared = prepare_segment(&fixture.segment, 1_771_836_263_919).unwrap();

        assert_eq!(prepared.sha256, fixture.segment_encoding.sha256);
        assert_eq!(
            prepared.path,
            format!(
                ".myreader/changes-v4/{}/{}",
                fixture.segment.replica_id, fixture.segment_encoding.file_name
            )
        );
        assert_eq!(
            prepared.change_ids,
            fixture
                .segment
                .changes
                .iter()
                .map(|change| change.change_id.clone())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn should_restore_segment_when_valid_bytes_are_decoded() {
        let fixture = fixture();
        let prepared = prepare_segment(&fixture.segment, 1_771_836_263_919).unwrap();

        assert_eq!(
            decode_segment_file(
                &fixture.segment_encoding.file_name,
                &prepared.bytes,
                &fixture.segment.library_uuid,
                &fixture.segment.replica_id,
                1_771_836_263_919,
            )
            .unwrap(),
            fixture.segment
        );
    }

    #[test]
    fn should_reject_segment_when_hash_does_not_match_filename() {
        let fixture = fixture();
        let mut prepared = prepare_segment(&fixture.segment, 1_771_836_263_919).unwrap();
        let last = prepared.bytes.len() - 1;
        prepared.bytes[last] ^= 1;

        assert_eq!(
            decode_segment_file(
                &fixture.segment_encoding.file_name,
                &prepared.bytes,
                &fixture.segment.library_uuid,
                &fixture.segment.replica_id,
                1_771_836_263_919,
            )
            .unwrap_err()
            .code,
            SegmentErrorCode::FileHashMismatch
        );
    }

    #[test]
    fn should_reject_segment_when_library_uuid_differs() {
        let fixture = fixture();

        assert_eq!(
            validate_segment(
                &fixture.segment,
                &SegmentExpectations {
                    library_uuid: Some("018f2f8d-980b-40ef-b72e-c6e86cb7cc20"),
                    now_ms: 1_771_836_263_919,
                    ..Default::default()
                },
            )
            .unwrap_err()
            .code,
            SegmentErrorCode::LibraryMismatch
        );
    }

    #[test]
    fn should_reject_segment_when_change_clock_is_in_future() {
        let fixture = fixture();

        assert_eq!(
            validate_segment(
                &fixture.segment,
                &SegmentExpectations {
                    now_ms: 1_700_000_000_000,
                    ..Default::default()
                },
            )
            .unwrap_err()
            .code,
            SegmentErrorCode::FutureClock
        );
    }

    #[test]
    fn should_order_sequence_filenames_by_numeric_value_when_names_arrive_out_of_order() {
        let mut names = [
            "10-00000000000000000000000000000000.json",
            "2-00000000000000000000000000000000.json",
            "1-00000000000000000000000000000000.json",
        ]
        .map(|name| parse_segment_file_name(name).unwrap());

        names.sort_by_key(|item| item.sequence.parse::<u64>().unwrap());

        assert_eq!(
            names.map(|item| item.sequence),
            ["1".to_owned(), "2".to_owned(), "10".to_owned()]
        );
    }

    #[test]
    fn should_reject_sequence_filename_when_it_exceeds_u64() {
        assert_eq!(
            parse_segment_file_name("18446744073709551616-00000000000000000000000000000000.json")
                .unwrap_err()
                .code,
            SegmentErrorCode::InvalidChange
        );
    }
}
