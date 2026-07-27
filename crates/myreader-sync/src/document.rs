use automerge::{
    transaction::{CommitOptions, Transactable},
    ActorId, AutoCommit, ChangeHash, ObjType, ReadDoc, ScalarValue, Value, ROOT,
};
use serde::{Deserialize, Serialize};
use uuid::{Uuid, Variant, Version};

use crate::SyncError;

pub const LIBRARY_SIDECAR_SCHEMA_VERSION: u64 = 1;
pub const LIBRARY_SIDECAR_GENESIS_HEAD: &str =
    "ac137b1318ef97f275852452df5c683406ec657e68e1b51d3656ac5f684ce1f2";
pub const LIBRARY_SIDECAR_ROOTS: [&str; 6] = [
    "favorites",
    "positions",
    "bookmarks",
    "annotations",
    "sessions",
    "completions",
];

const GENESIS_BYTES: &[u8] =
    include_bytes!("../../../fixtures/library-sidecar-automerge/genesis.automerge");
#[cfg(test)]
const TYPESCRIPT_POSITION_INCREMENTAL: &[u8] =
    include_bytes!("../../../fixtures/library-sidecar-automerge/typescript-position.incremental");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPositionValue {
    pub format: String,
    pub locator_json: String,
    pub display_progression_ppm: Option<u32>,
    pub recorded_at: i64,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteValue {
    pub is_favorite: bool,
    pub added_at: Option<i64>,
    pub recorded_at: i64,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkValue {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    pub locator_key: String,
    pub locator_json: String,
    pub created_at: i64,
    pub deleted_at: Option<i64>,
    pub recorded_at: i64,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationValue {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    pub kind: String,
    pub locator_json: String,
    pub created_at: i64,
    pub color: String,
    pub note: Option<String>,
    pub updated_at: i64,
    pub deleted: bool,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSessionValue {
    pub id: String,
    pub origin_replica_id: String,
    pub book_id: i64,
    pub format: String,
    pub local_day: String,
    pub started_at: i64,
    pub duration_seconds: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingCompletionValue {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    pub local_day: String,
    pub completed_at: i64,
    pub updated_at: i64,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPositionCandidate {
    pub operation_id: String,
    pub value: ReadingPositionValue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPositionProjection {
    pub book_id: i64,
    pub value: ReadingPositionValue,
    pub conflict_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySidecarAutomergeChange {
    pub actor_id: String,
    pub sequence: u64,
    pub hash: String,
    pub bytes: Vec<u8>,
}

fn sync_error(message: impl Into<String>) -> SyncError {
    SyncError::Sync(message.into())
}

fn parse_replica_actor(replica_id: &str) -> Result<ActorId, SyncError> {
    let uuid =
        Uuid::parse_str(replica_id).map_err(|_| sync_error("Replica ID must be a UUIDv4"))?;
    if uuid.get_variant() != Variant::RFC4122
        || uuid.get_version() != Some(Version::Random)
        || uuid.hyphenated().to_string() != replica_id
    {
        return Err(sync_error("Replica ID must be a lowercase UUIDv4"));
    }
    Ok(ActorId::from(*uuid.as_bytes()))
}

fn map_object_id(doc: &AutoCommit, key: &str) -> Result<automerge::ObjId, SyncError> {
    let Some((value, object_id)) = doc
        .get(ROOT, key)
        .map_err(|error| sync_error(format!("Failed to read Automerge root {key}: {error}")))?
    else {
        return Err(sync_error(format!(
            "Canonical Automerge document is missing root {key}"
        )));
    };
    if value != Value::Object(ObjType::Map) {
        return Err(sync_error(format!(
            "Canonical Automerge root {key} is not a map"
        )));
    }
    Ok(object_id)
}

pub fn validate_library_sidecar_document(doc: &AutoCommit) -> Result<(), SyncError> {
    let schema = doc
        .get(ROOT, "schema")
        .map_err(|error| sync_error(format!("Failed to read Automerge schema: {error}")))?
        .and_then(|(value, _)| value.to_u64())
        .ok_or_else(|| sync_error("Canonical Automerge schema is missing or invalid"))?;
    if schema != LIBRARY_SIDECAR_SCHEMA_VERSION {
        return Err(sync_error(format!("Unsupported Automerge schema {schema}")));
    }
    for root in LIBRARY_SIDECAR_ROOTS {
        map_object_id(doc, root)?;
    }
    Ok(())
}

pub fn load_library_sidecar_document(replica_id: &str) -> Result<AutoCommit, SyncError> {
    load_library_sidecar_document_bytes(GENESIS_BYTES, replica_id)
}

pub fn load_library_sidecar_document_bytes(
    bytes: &[u8],
    replica_id: &str,
) -> Result<AutoCommit, SyncError> {
    let mut doc = AutoCommit::load(bytes)
        .map_err(|error| sync_error(format!("Failed to load Automerge document: {error}")))?;
    validate_library_sidecar_document(&doc)?;
    doc.set_actor(parse_replica_actor(replica_id)?);
    Ok(doc)
}

pub fn library_sidecar_heads(doc: &mut AutoCommit) -> Vec<String> {
    let mut heads = doc
        .get_heads()
        .into_iter()
        .map(|head| head.to_string())
        .collect::<Vec<_>>();
    heads.sort();
    heads
}

pub fn set_library_identity(
    doc: &mut AutoCommit,
    library_uuid: &str,
    recorded_at: i64,
) -> Result<ChangeHash, SyncError> {
    let library_uuid = Uuid::parse_str(library_uuid)
        .map_err(|_| sync_error("Library identity must be a UUID"))?
        .hyphenated()
        .to_string();
    validate_library_identity(doc, &library_uuid)?;
    doc.put(ROOT, "libraryUuid", library_uuid)
        .map_err(|error| sync_error(format!("Failed to write library identity: {error}")))?;
    doc.commit_with(
        CommitOptions::default()
            .with_message("myreader:set-library-identity")
            .with_time(recorded_at),
    )
    .ok_or_else(|| sync_error("Library identity change was empty"))
}

pub fn validate_library_identity(doc: &AutoCommit, library_uuid: &str) -> Result<(), SyncError> {
    if library_identity(doc)?.is_some_and(|identity| identity != library_uuid) {
        return Err(sync_error(
            "Automerge document belongs to a different library",
        ));
    }
    Ok(())
}

pub fn library_identity(doc: &AutoCommit) -> Result<Option<String>, SyncError> {
    let identities = doc
        .get_all(ROOT, "libraryUuid")
        .map_err(|error| sync_error(format!("Failed to read library identity: {error}")))?
        .into_iter()
        .map(|(value, _)| {
            value
                .to_str()
                .map(str::to_owned)
                .ok_or_else(|| sync_error("Library identity is invalid"))
        })
        .collect::<Result<std::collections::BTreeSet<_>, _>>()?;
    if identities.len() > 1 {
        return Err(sync_error(
            "Automerge document has conflicting library identities",
        ));
    }
    Ok(identities.into_iter().next())
}

pub fn library_sidecar_changes_since(
    doc: &mut AutoCommit,
    heads: &[ChangeHash],
) -> Vec<LibrarySidecarAutomergeChange> {
    doc.get_changes(heads)
        .into_iter()
        .map(|mut change| LibrarySidecarAutomergeChange {
            actor_id: change.actor_id().to_string(),
            sequence: change.seq(),
            hash: change.hash().to_string(),
            bytes: change.bytes().into_owned(),
        })
        .collect()
}

pub fn apply_library_sidecar_incremental(
    doc: &mut AutoCommit,
    bytes: &[u8],
) -> Result<(), SyncError> {
    doc.load_incremental(bytes)
        .map(|_| ())
        .map_err(|error| sync_error(format!("Failed to load Automerge incremental: {error}")))
}

pub fn save_library_sidecar_document(doc: &mut AutoCommit) -> Vec<u8> {
    doc.save()
}

pub fn save_library_sidecar_incremental(doc: &mut AutoCommit, heads: &[ChangeHash]) -> Vec<u8> {
    doc.save_after(heads)
}

pub fn library_sidecar_missing_dependencies(
    doc: &mut AutoCommit,
    heads: &[ChangeHash],
) -> Vec<String> {
    doc.get_missing_deps(heads)
        .into_iter()
        .map(|hash| hash.to_string())
        .collect()
}

pub fn set_reading_position(
    doc: &mut AutoCommit,
    book_id: i64,
    value: &ReadingPositionValue,
) -> Result<ChangeHash, SyncError> {
    if book_id < 1 {
        return Err(sync_error("Book ID must be positive"));
    }
    if !matches!(value.format.as_str(), "EPUB" | "PDF" | "CBZ") {
        return Err(sync_error("Reading position format is unsupported"));
    }
    if value
        .display_progression_ppm
        .is_some_and(|value| value > 1_000_000)
    {
        return Err(sync_error(
            "Reading position display progression is out of range",
        ));
    }
    parse_replica_actor(&value.replica_id)?;
    let positions = map_object_id(doc, "positions")?;
    let key = format!("{book_id}:{}", value.format);
    let encoded = serde_json::to_string(value)
        .map_err(|error| sync_error(format!("Failed to encode reading position: {error}")))?;
    doc.put(&positions, key, encoded)
        .map_err(|error| sync_error(format!("Failed to write reading position: {error}")))?;
    doc.commit_with(
        CommitOptions::default()
            .with_message("myreader:set-reading-position")
            .with_time(value.recorded_at),
    )
    .ok_or_else(|| sync_error("Reading position change was empty"))
}

pub fn reading_position_candidates(
    doc: &AutoCommit,
    book_id: i64,
    format: &str,
) -> Result<Vec<ReadingPositionCandidate>, SyncError> {
    let positions = map_object_id(doc, "positions")?;
    let key = format!("{book_id}:{format}");
    let mut candidates = doc
        .get_all(&positions, key)
        .map_err(|error| {
            sync_error(format!(
                "Failed to read reading position conflicts: {error}"
            ))
        })?
        .into_iter()
        .map(|(value, operation_id)| {
            let json = value
                .to_str()
                .ok_or_else(|| sync_error("Reading position value is not a string"))?;
            let value = serde_json::from_str(json).map_err(|error| {
                sync_error(format!("Reading position value is invalid: {error}"))
            })?;
            Ok(ReadingPositionCandidate {
                operation_id: operation_id.to_string(),
                value,
            })
        })
        .collect::<Result<Vec<_>, SyncError>>()?;
    candidates.sort_by(|left, right| left.operation_id.cmp(&right.operation_id));
    Ok(candidates)
}

pub fn reading_position_projections(
    doc: &AutoCommit,
) -> Result<Vec<ReadingPositionProjection>, SyncError> {
    let positions = map_object_id(doc, "positions")?;
    let mut projections = doc
        .keys(&positions)
        .map(|key| {
            let (book_id, format) = key
                .rsplit_once(':')
                .ok_or_else(|| sync_error("Reading position key is invalid"))?;
            let book_id = book_id
                .parse::<i64>()
                .map_err(|_| sync_error("Reading position book ID is invalid"))?;
            let selected = doc
                .get(&positions, &key)
                .map_err(|error| sync_error(format!("Failed to read reading position: {error}")))?
                .ok_or_else(|| sync_error("Reading position value is missing"))?;
            let json = selected
                .0
                .to_str()
                .ok_or_else(|| sync_error("Reading position value is not a string"))?;
            let value: ReadingPositionValue = serde_json::from_str(json).map_err(|error| {
                sync_error(format!("Reading position value is invalid: {error}"))
            })?;
            if value.format != format {
                return Err(sync_error("Reading position key does not match its value"));
            }
            let conflict_count = reading_position_candidates(doc, book_id, format)?
                .len()
                .max(1);
            Ok(ReadingPositionProjection {
                book_id,
                value,
                conflict_count,
            })
        })
        .collect::<Result<Vec<_>, SyncError>>()?;
    projections.sort_by(|left, right| {
        left.book_id
            .cmp(&right.book_id)
            .then_with(|| left.value.format.cmp(&right.value.format))
    });
    Ok(projections)
}

pub fn resolve_reading_position(
    doc: &mut AutoCommit,
    book_id: i64,
    format: &str,
    operation_id: &str,
    recorded_at: i64,
) -> Result<ChangeHash, SyncError> {
    let candidate = reading_position_candidates(doc, book_id, format)?
        .into_iter()
        .find(|candidate| candidate.operation_id == operation_id)
        .ok_or_else(|| sync_error("Reading position candidate does not exist"))?;
    let replica_id = Uuid::from_slice(doc.get_actor().to_bytes())
        .map_err(|_| sync_error("Automerge actor is not a UUID"))?
        .hyphenated()
        .to_string();
    let resolved = ReadingPositionValue {
        recorded_at,
        replica_id,
        ..candidate.value
    };
    set_reading_position(doc, book_id, &resolved)
}

fn put_json_register<T: Serialize>(
    doc: &mut AutoCommit,
    root: &str,
    key: &str,
    value: &T,
    message: &str,
    recorded_at: i64,
) -> Result<ChangeHash, SyncError> {
    let map = map_object_id(doc, root)?;
    let encoded = serde_json::to_string(value)
        .map_err(|error| sync_error(format!("Failed to encode {root} value: {error}")))?;
    doc.put(&map, key, encoded)
        .map_err(|error| sync_error(format!("Failed to write {root} value: {error}")))?;
    doc.commit_with(
        CommitOptions::default()
            .with_message(message)
            .with_time(recorded_at),
    )
    .ok_or_else(|| sync_error(format!("{root} change was empty")))
}

pub fn set_favorite(
    doc: &mut AutoCommit,
    book_id: i64,
    value: &FavoriteValue,
) -> Result<ChangeHash, SyncError> {
    if book_id < 1 {
        return Err(sync_error("Favorite book ID is invalid"));
    }
    parse_replica_actor(&value.replica_id)?;
    put_json_register(
        doc,
        "favorites",
        &book_id.to_string(),
        value,
        "myreader:set-favorite",
        value.recorded_at,
    )
}

pub fn favorite_projections(doc: &AutoCommit) -> Result<Vec<(i64, FavoriteValue)>, SyncError> {
    let favorites = map_object_id(doc, "favorites")?;
    let mut values = doc
        .keys(&favorites)
        .map(|key| {
            let book_id = key
                .parse::<i64>()
                .map_err(|_| sync_error("Favorite key is invalid"))?;
            let encoded = doc
                .get(&favorites, &key)
                .map_err(|error| sync_error(format!("Failed to read favorite: {error}")))?
                .and_then(|(value, _)| value.to_str().map(str::to_owned))
                .ok_or_else(|| sync_error("Favorite value is not a string"))?;
            let value: FavoriteValue = serde_json::from_str(&encoded)
                .map_err(|error| sync_error(format!("Favorite value is invalid: {error}")))?;
            parse_replica_actor(&value.replica_id)?;
            Ok((book_id, value))
        })
        .collect::<Result<Vec<_>, SyncError>>()?;
    values.sort_by_key(|(book_id, _)| *book_id);
    Ok(values)
}

fn bookmark_key(value: &BookmarkValue) -> Result<String, SyncError> {
    if value.book_id < 1
        || !matches!(value.format.as_str(), "EPUB" | "PDF" | "CBZ")
        || value.locator_key.is_empty()
    {
        return Err(sync_error("Bookmark identity is invalid"));
    }
    Ok(format!(
        "{}:{}:{}",
        value.book_id, value.format, value.locator_key
    ))
}

pub fn set_bookmark(doc: &mut AutoCommit, value: &BookmarkValue) -> Result<ChangeHash, SyncError> {
    parse_replica_actor(&value.replica_id)?;
    put_json_register(
        doc,
        "bookmarks",
        &bookmark_key(value)?,
        value,
        "myreader:set-bookmark",
        value.recorded_at,
    )
}

pub fn bookmark_projections(doc: &AutoCommit) -> Result<Vec<BookmarkValue>, SyncError> {
    let bookmarks = map_object_id(doc, "bookmarks")?;
    let mut values = doc
        .keys(&bookmarks)
        .map(|key| {
            let encoded = doc
                .get(&bookmarks, &key)
                .map_err(|error| sync_error(format!("Failed to read bookmark: {error}")))?
                .and_then(|(value, _)| value.to_str().map(str::to_owned))
                .ok_or_else(|| sync_error("Bookmark value is not a string"))?;
            let value: BookmarkValue = serde_json::from_str(&encoded)
                .map_err(|error| sync_error(format!("Bookmark value is invalid: {error}")))?;
            if bookmark_key(&value)? != key {
                return Err(sync_error("Bookmark key does not match its value"));
            }
            parse_replica_actor(&value.replica_id)?;
            Ok(value)
        })
        .collect::<Result<Vec<_>, SyncError>>()?;
    values.sort_by(|left, right| {
        left.book_id
            .cmp(&right.book_id)
            .then_with(|| left.format.cmp(&right.format))
            .then_with(|| left.locator_key.cmp(&right.locator_key))
    });
    Ok(values)
}

fn annotation_object(doc: &AutoCommit, id: &str) -> Result<automerge::ObjId, SyncError> {
    let annotations = map_object_id(doc, "annotations")?;
    doc.get(&annotations, id)
        .map_err(|error| sync_error(format!("Failed to read annotation: {error}")))?
        .filter(|(value, _)| *value == Value::Object(ObjType::Map))
        .map(|(_, object)| object)
        .ok_or_else(|| sync_error("Annotation does not exist"))
}

fn annotation_string(
    doc: &AutoCommit,
    object: &automerge::ObjId,
    key: &str,
) -> Result<String, SyncError> {
    doc.get(object, key)
        .map_err(|error| sync_error(format!("Failed to read annotation {key}: {error}")))?
        .and_then(|(value, _)| value.to_str().map(str::to_owned))
        .ok_or_else(|| sync_error(format!("Annotation {key} is invalid")))
}

fn annotation_i64(
    doc: &AutoCommit,
    object: &automerge::ObjId,
    key: &str,
) -> Result<i64, SyncError> {
    doc.get(object, key)
        .map_err(|error| sync_error(format!("Failed to read annotation {key}: {error}")))?
        .and_then(|(value, _)| value.to_i64())
        .ok_or_else(|| sync_error(format!("Annotation {key} is invalid")))
}

pub fn create_annotation(
    doc: &mut AutoCommit,
    value: &AnnotationValue,
) -> Result<ChangeHash, SyncError> {
    validate_compact_id(&value.id, "Annotation")?;
    if value.book_id < 1
        || !matches!(value.format.as_str(), "EPUB" | "PDF" | "CBZ")
        || value.kind != "highlight"
    {
        return Err(sync_error("Annotation value is invalid"));
    }
    let annotations = map_object_id(doc, "annotations")?;
    if doc
        .get(&annotations, &value.id)
        .map_err(|error| sync_error(format!("Failed to read annotation: {error}")))?
        .is_some()
    {
        return Err(sync_error("Annotation already exists"));
    }
    let object = doc
        .put_object(&annotations, &value.id, ObjType::Map)
        .map_err(|error| sync_error(format!("Failed to create annotation: {error}")))?;
    doc.put(&object, "id", value.id.as_str())
        .and_then(|_| doc.put(&object, "bookId", value.book_id))
        .and_then(|_| doc.put(&object, "format", value.format.as_str()))
        .and_then(|_| doc.put(&object, "kind", value.kind.as_str()))
        .and_then(|_| doc.put(&object, "locatorJson", value.locator_json.as_str()))
        .and_then(|_| doc.put(&object, "createdAt", value.created_at))
        .and_then(|_| doc.put(&object, "color", value.color.as_str()))
        .and_then(|_| match value.note.as_deref() {
            Some(note) => doc.put(&object, "note", note),
            None => doc.put(&object, "note", ScalarValue::Null),
        })
        .and_then(|_| doc.put(&object, "updatedAt", value.updated_at))
        .and_then(|_| doc.put(&object, "deleted", false))
        .and_then(|_| doc.put(&object, "deletedAt", ScalarValue::Null))
        .map_err(|error| sync_error(format!("Failed to write annotation: {error}")))?;
    doc.commit_with(
        CommitOptions::default()
            .with_message("myreader:create-annotation")
            .with_time(value.created_at),
    )
    .ok_or_else(|| sync_error("Annotation creation was empty"))
}

pub fn update_annotation(
    doc: &mut AutoCommit,
    id: &str,
    color: &str,
    note: Option<&str>,
    updated_at: i64,
) -> Result<ChangeHash, SyncError> {
    let object = annotation_object(doc, id)?;
    if annotation_string(doc, &object, "color")? != color {
        doc.put(&object, "color", color)
            .map_err(|error| sync_error(format!("Failed to update annotation color: {error}")))?;
    }
    let current_note = match doc
        .get(&object, "note")
        .map_err(|error| sync_error(format!("Failed to read annotation note: {error}")))?
        .map(|(value, _)| value)
    {
        Some(value) if value.is_null() => None,
        Some(value) => value.to_str().map(str::to_owned),
        None => None,
    };
    if current_note.as_deref() != note {
        match note {
            Some(note) => doc.put(&object, "note", note),
            None => doc.put(&object, "note", ScalarValue::Null),
        }
        .map_err(|error| sync_error(format!("Failed to update annotation note: {error}")))?;
    }
    doc.put(&object, "updatedAt", updated_at)
        .map_err(|error| sync_error(format!("Failed to update annotation: {error}")))?;
    doc.commit_with(
        CommitOptions::default()
            .with_message("myreader:update-annotation")
            .with_time(updated_at),
    )
    .ok_or_else(|| sync_error("Annotation update was empty"))
}

pub fn delete_annotation(
    doc: &mut AutoCommit,
    id: &str,
    deleted_at: i64,
) -> Result<ChangeHash, SyncError> {
    let object = annotation_object(doc, id)?;
    doc.put(&object, "deleted", true)
        .and_then(|_| doc.put(&object, "deletedAt", deleted_at))
        .and_then(|_| doc.put(&object, "updatedAt", deleted_at))
        .map_err(|error| sync_error(format!("Failed to delete annotation: {error}")))?;
    doc.commit_with(
        CommitOptions::default()
            .with_message("myreader:delete-annotation")
            .with_time(deleted_at),
    )
    .ok_or_else(|| sync_error("Annotation deletion was empty"))
}

pub fn annotation_projections(doc: &AutoCommit) -> Result<Vec<AnnotationValue>, SyncError> {
    let annotations = map_object_id(doc, "annotations")?;
    let mut values = doc
        .keys(&annotations)
        .map(|id| {
            let object = annotation_object(doc, &id)?;
            let deleted = doc
                .get_all(&object, "deleted")
                .map_err(|error| {
                    sync_error(format!("Failed to read annotation tombstone: {error}"))
                })?
                .iter()
                .any(|(value, _)| value.to_bool() == Some(true));
            let deleted_at = if deleted {
                doc.get_all(&object, "deletedAt")
                    .map_err(|error| {
                        sync_error(format!("Failed to read annotation deletion time: {error}"))
                    })?
                    .into_iter()
                    .filter_map(|(value, _)| value.to_i64())
                    .min()
            } else {
                None
            };
            let note = match doc
                .get(&object, "note")
                .map_err(|error| sync_error(format!("Failed to read annotation note: {error}")))?
                .map(|(value, _)| value)
            {
                Some(value) if value.is_null() => None,
                Some(value) => value.to_str().map(str::to_owned),
                None => None,
            };
            let value = AnnotationValue {
                id: annotation_string(doc, &object, "id")?,
                book_id: annotation_i64(doc, &object, "bookId")?,
                format: annotation_string(doc, &object, "format")?,
                kind: annotation_string(doc, &object, "kind")?,
                locator_json: annotation_string(doc, &object, "locatorJson")?,
                created_at: annotation_i64(doc, &object, "createdAt")?,
                color: annotation_string(doc, &object, "color")?,
                note,
                updated_at: annotation_i64(doc, &object, "updatedAt")?,
                deleted,
                deleted_at,
            };
            if value.id != id {
                return Err(sync_error("Annotation key is invalid"));
            }
            Ok(value)
        })
        .collect::<Result<Vec<_>, SyncError>>()?;
    values.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(values)
}

fn validate_compact_id(id: &str, name: &str) -> Result<(), SyncError> {
    let uuid = Uuid::parse_str(id).map_err(|_| sync_error(format!("{name} ID is invalid")))?;
    if uuid.get_variant() != Variant::RFC4122
        || uuid.get_version() != Some(Version::Random)
        || uuid.as_simple().to_string() != id
    {
        return Err(sync_error(format!("{name} ID is invalid")));
    }
    Ok(())
}

fn document_replica_id(doc: &AutoCommit) -> Result<String, SyncError> {
    Uuid::parse_str(&doc.get_actor().to_string())
        .map(|uuid| uuid.to_string())
        .map_err(|_| sync_error("Automerge actor is not a UUID"))
}

pub fn add_reading_session_duration(
    doc: &mut AutoCommit,
    interval: &ReadingSessionValue,
) -> Result<ChangeHash, SyncError> {
    validate_compact_id(&interval.id, "Reading session")?;
    parse_replica_actor(&interval.origin_replica_id)?;
    if interval.origin_replica_id != document_replica_id(doc)? {
        return Err(sync_error(
            "Only the origin replica can update a reading session",
        ));
    }
    if interval.book_id < 1
        || !matches!(interval.format.as_str(), "EPUB" | "PDF" | "CBZ")
        || interval.duration_seconds < 0
    {
        return Err(sync_error("Reading session value is invalid"));
    }
    let sessions = map_object_id(doc, "sessions")?;
    let current = doc
        .get(&sessions, &interval.id)
        .map_err(|error| sync_error(format!("Failed to read reading session: {error}")))?
        .map(|(value, _)| {
            value
                .to_str()
                .ok_or_else(|| sync_error("Reading session value is not a string"))
                .and_then(|encoded| {
                    serde_json::from_str::<ReadingSessionValue>(encoded).map_err(|error| {
                        sync_error(format!("Reading session value is invalid: {error}"))
                    })
                })
        })
        .transpose()?;
    if current.as_ref().is_some_and(|current| {
        current.origin_replica_id != interval.origin_replica_id
            || current.book_id != interval.book_id
            || current.format != interval.format
            || current.local_day != interval.local_day
            || current.started_at != interval.started_at
    }) {
        return Err(sync_error("Reading session header is immutable"));
    }
    let next_duration = current
        .as_ref()
        .map(|current| {
            current
                .duration_seconds
                .checked_add(interval.duration_seconds)
                .ok_or_else(|| sync_error("Reading session duration is out of range"))
        })
        .transpose()?
        .unwrap_or(interval.duration_seconds);
    let mut next = current.unwrap_or_else(|| interval.clone());
    next.duration_seconds = next_duration;
    next.updated_at = interval.updated_at;
    put_json_register(
        doc,
        "sessions",
        &interval.id,
        &next,
        "myreader:add-reading-session-duration",
        interval.updated_at,
    )
}

pub fn add_reading_completion(
    doc: &mut AutoCommit,
    completion: &ReadingCompletionValue,
) -> Result<Option<ChangeHash>, SyncError> {
    validate_compact_id(&completion.id, "Reading completion")?;
    parse_replica_actor(&completion.replica_id)?;
    if completion.replica_id != document_replica_id(doc)?
        || completion.book_id < 1
        || !matches!(completion.format.as_str(), "EPUB" | "PDF" | "CBZ")
    {
        return Err(sync_error("Reading completion value is invalid"));
    }
    let completions = map_object_id(doc, "completions")?;
    if doc
        .get(&completions, &completion.id)
        .map_err(|error| sync_error(format!("Failed to read reading completion: {error}")))?
        .is_some()
    {
        return Ok(None);
    }
    put_json_register(
        doc,
        "completions",
        &completion.id,
        completion,
        "myreader:add-reading-completion",
        completion.completed_at,
    )
    .map(Some)
}

pub fn reading_session_projections(
    doc: &AutoCommit,
) -> Result<Vec<ReadingSessionValue>, SyncError> {
    let sessions = map_object_id(doc, "sessions")?;
    let mut values = doc
        .keys(&sessions)
        .map(|id| {
            let encoded = doc
                .get(&sessions, &id)
                .map_err(|error| sync_error(format!("Failed to read reading session: {error}")))?
                .and_then(|(value, _)| value.to_str().map(str::to_owned))
                .ok_or_else(|| sync_error("Reading session value is not a string"))?;
            let value: ReadingSessionValue = serde_json::from_str(&encoded).map_err(|error| {
                sync_error(format!("Reading session value is invalid: {error}"))
            })?;
            validate_compact_id(&value.id, "Reading session")?;
            parse_replica_actor(&value.origin_replica_id)?;
            if value.id != id
                || value.book_id < 1
                || !matches!(value.format.as_str(), "EPUB" | "PDF" | "CBZ")
                || value.duration_seconds < 0
            {
                return Err(sync_error("Reading session value is invalid"));
            }
            Ok(value)
        })
        .collect::<Result<Vec<_>, SyncError>>()?;
    values.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(values)
}

pub fn reading_completion_records(
    doc: &AutoCommit,
) -> Result<Vec<ReadingCompletionValue>, SyncError> {
    let completions = map_object_id(doc, "completions")?;
    let mut values = doc
        .keys(&completions)
        .map(|id| {
            let encoded = doc
                .get(&completions, &id)
                .map_err(|error| sync_error(format!("Failed to read reading completion: {error}")))?
                .and_then(|(value, _)| value.to_str().map(str::to_owned))
                .ok_or_else(|| sync_error("Reading completion value is not a string"))?;
            let value: ReadingCompletionValue =
                serde_json::from_str(&encoded).map_err(|error| {
                    sync_error(format!("Reading completion value is invalid: {error}"))
                })?;
            validate_compact_id(&value.id, "Reading completion")?;
            parse_replica_actor(&value.replica_id)?;
            if value.id != id
                || value.book_id < 1
                || !matches!(value.format.as_str(), "EPUB" | "PDF" | "CBZ")
            {
                return Err(sync_error("Reading completion value is invalid"));
            }
            Ok(value)
        })
        .collect::<Result<Vec<_>, SyncError>>()?;
    values.sort_by(|left, right| {
        left.completed_at
            .cmp(&right.completed_at)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(values)
}

pub fn reading_completion_projections(
    doc: &AutoCommit,
) -> Result<Vec<ReadingCompletionValue>, SyncError> {
    let mut earliest = std::collections::BTreeMap::new();
    for completion in reading_completion_records(doc)? {
        earliest.entry(completion.book_id).or_insert(completion);
    }
    Ok(earliest.into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";
    const REPLICA_A: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const REPLICA_B: &str = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    fn position(replica_id: &str, progression: u32) -> ReadingPositionValue {
        ReadingPositionValue {
            format: "PDF".to_owned(),
            locator_json: format!(r#"{{"href":"page-{progression}"}}"#),
            display_progression_ppm: Some(progression),
            recorded_at: i64::from(progression),
            replica_id: replica_id.to_owned(),
        }
    }

    #[test]
    fn should_load_canonical_schema_when_replica_opens_document() {
        let mut doc = load_library_sidecar_document(REPLICA_A).unwrap();

        assert_eq!(
            library_sidecar_heads(&mut doc),
            vec![LIBRARY_SIDECAR_GENESIS_HEAD]
        );
        assert_eq!(doc.get_actor().to_string(), REPLICA_A.replace('-', ""));
        validate_library_sidecar_document(&doc).unwrap();
    }

    #[test]
    fn should_preserve_candidates_when_replicas_write_positions_concurrently() {
        let mut first = load_library_sidecar_document(REPLICA_A).unwrap();
        let mut second = load_library_sidecar_document(REPLICA_B).unwrap();
        set_library_identity(&mut first, LIBRARY_UUID, 1).unwrap();
        set_library_identity(&mut second, LIBRARY_UUID, 1).unwrap();
        set_reading_position(&mut first, 7, &position(REPLICA_A, 700_000)).unwrap();
        set_reading_position(&mut second, 7, &position(REPLICA_B, 300_000)).unwrap();

        first.merge(&mut second).unwrap();

        let candidates = reading_position_candidates(&first, 7, "PDF").unwrap();
        assert_eq!(candidates.len(), 2);
        assert_eq!(
            candidates
                .iter()
                .map(|candidate| candidate.value.display_progression_ppm)
                .collect::<std::collections::BTreeSet<_>>(),
            std::collections::BTreeSet::from([Some(300_000), Some(700_000)])
        );
        let projections = reading_position_projections(&first).unwrap();
        assert_eq!(projections.len(), 1);
        assert_eq!(projections[0].book_id, 7);
        assert_eq!(projections[0].conflict_count, 2);
    }

    #[test]
    fn should_hydrate_typescript_change_when_rust_imports_incremental_bytes() {
        let mut doc = load_library_sidecar_document(REPLICA_B).unwrap();

        doc.load_incremental(TYPESCRIPT_POSITION_INCREMENTAL)
            .unwrap();

        let candidates = reading_position_candidates(&doc, 7, "PDF").unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].value.display_progression_ppm, Some(700_000));
        assert_eq!(
            doc.get(ROOT, "libraryUuid")
                .unwrap()
                .and_then(|(value, _)| value.to_str().map(str::to_owned)),
            Some(LIBRARY_UUID.to_owned())
        );
        assert!(favorite_projections(&doc).unwrap()[0].1.is_favorite);
        assert_eq!(bookmark_projections(&doc).unwrap()[0].locator_key, "page-7");
        assert_eq!(
            annotation_projections(&doc).unwrap()[0].note.as_deref(),
            Some("fixture note")
        );
        assert_eq!(
            reading_session_projections(&doc).unwrap()[0].duration_seconds,
            120
        );
        assert_eq!(
            reading_completion_projections(&doc).unwrap()[0].completed_at,
            4000
        );
    }

    #[test]
    fn should_converge_when_three_actor_incrementals_arrive_repeatedly_in_any_order() {
        let genesis_head = LIBRARY_SIDECAR_GENESIS_HEAD.parse().unwrap();
        let actors = [REPLICA_A, REPLICA_B, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"];
        let incrementals = actors
            .iter()
            .enumerate()
            .map(|(index, actor)| {
                let mut source = load_library_sidecar_document(actor).unwrap();
                set_library_identity(&mut source, LIBRARY_UUID, 1).unwrap();
                set_reading_position(
                    &mut source,
                    7,
                    &position(actor, (index as u32 + 1) * 100_000),
                )
                .unwrap();
                source.save_after(&[genesis_head])
            })
            .collect::<Vec<_>>();
        let mut first = load_library_sidecar_document(REPLICA_A).unwrap();
        let mut second = load_library_sidecar_document(REPLICA_B).unwrap();

        for index in [2, 0, 1, 0, 2] {
            first.load_incremental(&incrementals[index]).unwrap();
        }
        for index in [1, 2, 1, 0] {
            second.load_incremental(&incrementals[index]).unwrap();
        }

        assert_eq!(
            library_sidecar_heads(&mut first),
            library_sidecar_heads(&mut second)
        );
        assert_eq!(
            reading_position_candidates(&first, 7, "PDF").unwrap(),
            reading_position_candidates(&second, 7, "PDF").unwrap()
        );
    }

    #[test]
    fn should_remove_conflict_when_user_selects_a_position_candidate() {
        let mut first = load_library_sidecar_document(REPLICA_A).unwrap();
        let mut second = load_library_sidecar_document(REPLICA_B).unwrap();
        set_library_identity(&mut first, LIBRARY_UUID, 1).unwrap();
        set_library_identity(&mut second, LIBRARY_UUID, 1).unwrap();
        set_reading_position(&mut first, 7, &position(REPLICA_A, 700_000)).unwrap();
        set_reading_position(&mut second, 7, &position(REPLICA_B, 300_000)).unwrap();
        first.merge(&mut second).unwrap();
        let selected = reading_position_candidates(&first, 7, "PDF")
            .unwrap()
            .into_iter()
            .find(|candidate| candidate.value.display_progression_ppm == Some(300_000))
            .unwrap();

        resolve_reading_position(&mut first, 7, "PDF", &selected.operation_id, 2).unwrap();

        let candidates = reading_position_candidates(&first, 7, "PDF").unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].value.display_progression_ppm, Some(300_000));
    }

    #[test]
    fn should_keep_causal_favorite_and_bookmark_updates_when_state_changes_again() {
        let mut doc = load_library_sidecar_document(REPLICA_A).unwrap();
        set_library_identity(&mut doc, LIBRARY_UUID, 1).unwrap();
        set_favorite(
            &mut doc,
            7,
            &FavoriteValue {
                is_favorite: true,
                added_at: Some(2),
                recorded_at: 2,
                replica_id: REPLICA_A.to_owned(),
            },
        )
        .unwrap();
        set_favorite(
            &mut doc,
            7,
            &FavoriteValue {
                is_favorite: false,
                added_at: Some(2),
                recorded_at: 3,
                replica_id: REPLICA_A.to_owned(),
            },
        )
        .unwrap();
        let mut bookmark = BookmarkValue {
            id: "11111111111141118111111111111111".to_owned(),
            book_id: 7,
            format: "PDF".to_owned(),
            locator_key: "page-7".to_owned(),
            locator_json: r#"{"href":"page-7"}"#.to_owned(),
            created_at: 2,
            deleted_at: None,
            recorded_at: 2,
            replica_id: REPLICA_A.to_owned(),
        };
        set_bookmark(&mut doc, &bookmark).unwrap();
        bookmark.deleted_at = Some(3);
        bookmark.recorded_at = 3;
        set_bookmark(&mut doc, &bookmark).unwrap();
        bookmark.deleted_at = None;
        bookmark.recorded_at = 4;
        set_bookmark(&mut doc, &bookmark).unwrap();

        assert!(!favorite_projections(&doc).unwrap()[0].1.is_favorite);
        assert!(bookmark_projections(&doc).unwrap()[0].deleted_at.is_none());
    }

    #[test]
    fn should_preserve_independent_annotation_fields_when_replicas_edit_concurrently() {
        let mut base = load_library_sidecar_document(REPLICA_A).unwrap();
        set_library_identity(&mut base, LIBRARY_UUID, 1).unwrap();
        create_annotation(
            &mut base,
            &AnnotationValue {
                id: "11111111111141118111111111111111".to_owned(),
                book_id: 7,
                format: "PDF".to_owned(),
                kind: "highlight".to_owned(),
                locator_json: r#"{"href":"page-7"}"#.to_owned(),
                created_at: 2,
                color: "yellow".to_owned(),
                note: None,
                updated_at: 2,
                deleted: false,
                deleted_at: None,
            },
        )
        .unwrap();
        let bytes = save_library_sidecar_document(&mut base);
        let mut first = load_library_sidecar_document_bytes(&bytes, REPLICA_A).unwrap();
        let mut second = load_library_sidecar_document_bytes(&bytes, REPLICA_B).unwrap();
        update_annotation(
            &mut first,
            "11111111111141118111111111111111",
            "orange",
            None,
            3,
        )
        .unwrap();
        update_annotation(
            &mut second,
            "11111111111141118111111111111111",
            "yellow",
            Some("A note"),
            4,
        )
        .unwrap();

        first.merge(&mut second).unwrap();

        let projection = &annotation_projections(&first).unwrap()[0];
        assert_eq!(projection.color, "orange");
        assert_eq!(projection.note.as_deref(), Some("A note"));
    }

    #[test]
    fn should_keep_annotation_deleted_when_delete_and_edit_are_concurrent() {
        let mut base = load_library_sidecar_document(REPLICA_A).unwrap();
        set_library_identity(&mut base, LIBRARY_UUID, 1).unwrap();
        create_annotation(
            &mut base,
            &AnnotationValue {
                id: "11111111111141118111111111111111".to_owned(),
                book_id: 7,
                format: "PDF".to_owned(),
                kind: "highlight".to_owned(),
                locator_json: r#"{"href":"page-7"}"#.to_owned(),
                created_at: 2,
                color: "yellow".to_owned(),
                note: None,
                updated_at: 2,
                deleted: false,
                deleted_at: None,
            },
        )
        .unwrap();
        let bytes = save_library_sidecar_document(&mut base);
        let mut first = load_library_sidecar_document_bytes(&bytes, REPLICA_A).unwrap();
        let mut second = load_library_sidecar_document_bytes(&bytes, REPLICA_B).unwrap();
        delete_annotation(&mut first, "11111111111141118111111111111111", 5).unwrap();
        update_annotation(
            &mut second,
            "11111111111141118111111111111111",
            "green",
            Some("Concurrent note"),
            6,
        )
        .unwrap();

        first.merge(&mut second).unwrap();

        let projection = &annotation_projections(&first).unwrap()[0];
        assert!(projection.deleted);
        assert_eq!(projection.deleted_at, Some(5));
    }

    #[test]
    fn should_accumulate_origin_session_and_choose_earliest_completion_when_records_repeat() {
        let mut doc = load_library_sidecar_document(REPLICA_A).unwrap();
        set_library_identity(&mut doc, LIBRARY_UUID, 1).unwrap();
        let mut interval = ReadingSessionValue {
            id: "11111111111141118111111111111111".to_owned(),
            origin_replica_id: REPLICA_A.to_owned(),
            book_id: 7,
            format: "PDF".to_owned(),
            local_day: "2026-07-25".to_owned(),
            started_at: 2,
            duration_seconds: 60,
            updated_at: 62,
        };
        add_reading_session_duration(&mut doc, &interval).unwrap();
        interval.duration_seconds = 30;
        interval.updated_at = 92;
        add_reading_session_duration(&mut doc, &interval).unwrap();
        for (id, completed_at) in [
            ("22222222222242228222222222222222", 200),
            ("33333333333343338333333333333333", 100),
        ] {
            add_reading_completion(
                &mut doc,
                &ReadingCompletionValue {
                    id: id.to_owned(),
                    book_id: 7,
                    format: "PDF".to_owned(),
                    local_day: "2026-07-25".to_owned(),
                    completed_at,
                    updated_at: completed_at,
                    replica_id: REPLICA_A.to_owned(),
                },
            )
            .unwrap();
        }

        assert_eq!(
            reading_session_projections(&doc).unwrap()[0].duration_seconds,
            90
        );
        assert_eq!(
            reading_completion_projections(&doc).unwrap()[0].completed_at,
            100
        );
    }

    #[test]
    fn should_reject_session_update_when_replica_is_not_origin() {
        let mut doc = load_library_sidecar_document(REPLICA_B).unwrap();
        set_library_identity(&mut doc, LIBRARY_UUID, 1).unwrap();

        let error = add_reading_session_duration(
            &mut doc,
            &ReadingSessionValue {
                id: "11111111111141118111111111111111".to_owned(),
                origin_replica_id: REPLICA_A.to_owned(),
                book_id: 7,
                format: "PDF".to_owned(),
                local_day: "2026-07-25".to_owned(),
                started_at: 2,
                duration_seconds: 60,
                updated_at: 62,
            },
        )
        .unwrap_err();

        assert!(error.to_string().contains("origin replica"));
    }
}
