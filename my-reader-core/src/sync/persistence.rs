use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Mutex, OnceLock},
    time::Duration,
};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::{Uuid, Variant, Version};

use super::{
    document::{library_sidecar_snapshot_heads, CatalogBookValue, LIBRARY_SIDECAR_SCHEMA_VERSION},
    document_engine::{
        execute_document_command, execute_document_mutation, DocumentCommand,
        DocumentCommandRequest, DocumentCommandResult,
    },
    storage::{incremental_key, StorageKey},
    SyncError,
};

const PROJECTION_VERSION: i64 = 2;
const SIDECAR_PROTOCOL: &str = "library-sidecar-automerge-repo";

static WRITER: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseIdentity {
    pub library_uuid: String,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncScheduleState {
    pub last_successful_pull_at: Option<i64>,
    pub next_retry_at: Option<i64>,
    pub transient_failure_count: u32,
    pub suspended_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDatabaseCommand {
    pub command: DocumentCommand,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncOutboxEntry {
    pub storage_key: StorageKey,
    pub bytes: Vec<u8>,
    pub sha256: String,
    pub change_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncRemoteObject {
    pub storage_key: StorageKey,
    pub bytes: Vec<u8>,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyRemoteDatabaseResult {
    pub document: DocumentCommandResult,
    pub applied_objects: usize,
}

#[derive(Debug)]
struct PersistedState {
    snapshot_bytes: Vec<u8>,
    heads: Vec<String>,
    migration: Option<DocumentCommandResult>,
}

fn sync_error(message: impl Into<String>) -> SyncError {
    SyncError::Sync(message.into())
}

fn database_error(error: rusqlite::Error) -> SyncError {
    sync_error(format!("SQLite sync store failed: {error}"))
}

fn writer() -> &'static Mutex<()> {
    WRITER.get_or_init(|| Mutex::new(()))
}

fn open_connection(database_path: &str) -> Result<Connection, SyncError> {
    let connection = Connection::open(database_path).map_err(database_error)?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(database_error)?;
    Ok(connection)
}

fn new_id() -> String {
    Uuid::new_v4().as_simple().to_string()
}

fn parse_library_uuid(value: &str) -> Result<String, SyncError> {
    let uuid = Uuid::parse_str(value).map_err(|_| sync_error("Invalid library UUID"))?;
    if uuid.get_variant() != Variant::RFC4122
        || !(1..=8).contains(&uuid.get_version_num())
        || uuid.hyphenated().to_string() != value
    {
        return Err(sync_error("Invalid library UUID"));
    }
    Ok(uuid.hyphenated().to_string())
}

fn parse_replica_id(value: &str) -> Result<String, SyncError> {
    let uuid = Uuid::parse_str(value).map_err(|_| sync_error("Invalid local replica ID"))?;
    if uuid.get_variant() != Variant::RFC4122
        || uuid.get_version() != Some(Version::Random)
        || uuid.hyphenated().to_string() != value
    {
        return Err(sync_error("Invalid local replica ID"));
    }
    Ok(uuid.hyphenated().to_string())
}

fn validated_database_identity(
    protocol: String,
    library_uuid: String,
    replica_id: String,
) -> Result<DatabaseIdentity, SyncError> {
    if protocol != SIDECAR_PROTOCOL {
        return Err(sync_error("Local sidecar protocol is unsupported"));
    }
    Ok(DatabaseIdentity {
        library_uuid: parse_library_uuid(&library_uuid)?,
        replica_id: parse_replica_id(&replica_id)?,
    })
}

pub fn ensure_database_identity(
    database_path: &str,
    library_uuid: &str,
) -> Result<DatabaseIdentity, SyncError> {
    let library_uuid = parse_library_uuid(library_uuid)?;
    let _writer = writer()
        .lock()
        .map_err(|_| sync_error("SQLite sync writer lock is poisoned"))?;
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let existing = transaction
        .query_row(
            "SELECT protocol, library_uuid, replica_id
             FROM sync_local_meta
             LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?;
    let identity = if let Some((protocol, existing_library_uuid, replica_id)) = existing {
        let existing = validated_database_identity(protocol, existing_library_uuid, replica_id)?;
        if existing.library_uuid != library_uuid {
            return Err(sync_error(
                "Local sidecar identity does not match this library",
            ));
        }
        existing
    } else {
        let replica_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO sync_local_meta
                 (id, protocol, library_uuid, replica_id)
                 VALUES (?1, ?2, ?3, ?4)",
                params![new_id(), SIDECAR_PROTOCOL, library_uuid, replica_id],
            )
            .map_err(database_error)?;
        DatabaseIdentity {
            library_uuid,
            replica_id,
        }
    };
    transaction.commit().map_err(database_error)?;
    Ok(identity)
}

pub fn read_schedule_state(database_path: &str) -> Result<Option<SyncScheduleState>, SyncError> {
    let connection = open_connection(database_path)?;
    connection
        .query_row(
            "SELECT last_successful_pull_at, next_retry_at,
                    transient_failure_count, suspended_reason
             FROM sync_schedule_state
             WHERE id = 'local'",
            [],
            |row| {
                let transient_failure_count = row.get::<_, i64>(2)?;
                Ok(SyncScheduleState {
                    last_successful_pull_at: row.get(0)?,
                    next_retry_at: row.get(1)?,
                    transient_failure_count: u32::try_from(transient_failure_count).map_err(
                        |error| {
                            rusqlite::Error::FromSqlConversionFailure(
                                2,
                                rusqlite::types::Type::Integer,
                                Box::new(error),
                            )
                        },
                    )?,
                    suspended_reason: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(database_error)
}

fn write_schedule_state_in_transaction(
    transaction: &Transaction<'_>,
    state: &SyncScheduleState,
) -> Result<(), SyncError> {
    transaction
        .execute(
            "INSERT INTO sync_schedule_state
             (id, last_successful_pull_at, next_retry_at,
              transient_failure_count, suspended_reason)
             VALUES ('local', ?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
               last_successful_pull_at = excluded.last_successful_pull_at,
               next_retry_at = excluded.next_retry_at,
               transient_failure_count = excluded.transient_failure_count,
               suspended_reason = excluded.suspended_reason",
            params![
                state.last_successful_pull_at,
                state.next_retry_at,
                i64::from(state.transient_failure_count),
                state.suspended_reason,
            ],
        )
        .map(|_| ())
        .map_err(database_error)
}

pub fn write_schedule_state(
    database_path: &str,
    state: &SyncScheduleState,
) -> Result<(), SyncError> {
    let _writer = writer()
        .lock()
        .map_err(|_| sync_error("SQLite sync writer lock is poisoned"))?;
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    write_schedule_state_in_transaction(&transaction, state)?;
    transaction.commit().map_err(database_error)
}

pub fn mark_schedule_succeeded(
    database_path: &str,
    completed_pull_at: Option<i64>,
) -> Result<(), SyncError> {
    let _writer = writer()
        .lock()
        .map_err(|_| sync_error("SQLite sync writer lock is poisoned"))?;
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let previous_pull_at = transaction
        .query_row(
            "SELECT last_successful_pull_at
             FROM sync_schedule_state
             WHERE id = 'local'",
            [],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(database_error)?
        .flatten();
    let last_successful_pull_at = completed_pull_at.or(previous_pull_at);
    write_schedule_state_in_transaction(
        &transaction,
        &SyncScheduleState {
            last_successful_pull_at,
            next_retry_at: None,
            transient_failure_count: 0,
            suspended_reason: None,
        },
    )?;
    transaction.commit().map_err(database_error)
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn encode_storage_key(key: &[String]) -> Result<String, SyncError> {
    serde_json::to_string(key)
        .map_err(|error| sync_error(format!("Failed to encode Automerge storage key: {error}")))
}

fn decode_storage_key(value: &str) -> Result<StorageKey, SyncError> {
    serde_json::from_str(value)
        .map_err(|error| sync_error(format!("Stored Automerge storage key is invalid: {error}")))
}

fn request(
    identity: &DatabaseIdentity,
    base_heads: Vec<String>,
    command: DocumentCommand,
) -> DocumentCommandRequest {
    DocumentCommandRequest {
        replica_id: identity.replica_id.clone(),
        expected_library_uuid: Some(identity.library_uuid.clone()),
        base_heads,
        command,
    }
}

fn read_state(
    transaction: &Transaction<'_>,
    identity: &DatabaseIdentity,
) -> Result<Option<PersistedState>, SyncError> {
    let row = transaction
        .query_row(
            "SELECT schema_version, snapshot_bytes, heads_json
             FROM sync_automerge_state
             WHERE id = 'local'",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Vec<u8>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?;
    let Some((schema_version, snapshot_bytes, heads_json)) = row else {
        return Ok(None);
    };
    if !(1..=LIBRARY_SIDECAR_SCHEMA_VERSION as i64).contains(&schema_version) {
        return Err(sync_error(format!(
            "Unsupported persisted Automerge schema {schema_version}"
        )));
    }
    let heads = serde_json::from_str::<Vec<String>>(&heads_json)
        .map_err(|error| sync_error(format!("Persisted Automerge heads are invalid: {error}")))?;
    if library_sidecar_snapshot_heads(&snapshot_bytes)? != heads {
        return Err(sync_error(
            "Persisted Automerge heads do not match its snapshot",
        ));
    }
    let inspected = execute_document_command(
        Some(&snapshot_bytes),
        request(identity, heads.clone(), DocumentCommand::Inspect),
        None,
    )?;
    if schema_version == LIBRARY_SIDECAR_SCHEMA_VERSION as i64
        && (inspected.heads != heads || !inspected.changes.is_empty())
    {
        return Err(sync_error(
            "Persisted Automerge heads do not match its snapshot",
        ));
    }
    let migration =
        (schema_version != LIBRARY_SIDECAR_SCHEMA_VERSION as i64).then(|| inspected.clone());
    Ok(Some(PersistedState {
        snapshot_bytes: inspected.snapshot_bytes,
        heads: inspected.heads,
        migration,
    }))
}

fn write_state(
    transaction: &Transaction<'_>,
    result: &DocumentCommandResult,
    now_ms: i64,
) -> Result<String, SyncError> {
    let heads_json = serde_json::to_string(&result.heads)
        .map_err(|error| sync_error(format!("Failed to encode Automerge heads: {error}")))?;
    transaction
        .execute(
            "INSERT INTO sync_automerge_state
             (id, schema_version, snapshot_bytes, heads_json, updated_at)
             VALUES ('local', ?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
               schema_version = excluded.schema_version,
               snapshot_bytes = excluded.snapshot_bytes,
               heads_json = excluded.heads_json,
               updated_at = excluded.updated_at",
            params![
                result.schema_version as i64,
                result.snapshot_bytes,
                heads_json,
                now_ms
            ],
        )
        .map_err(database_error)?;
    Ok(heads_json)
}

fn insert_outbox(
    transaction: &Transaction<'_>,
    document_id: &str,
    result: &DocumentCommandResult,
) -> Result<(), SyncError> {
    if result.changes.is_empty() || result.incremental_bytes.is_empty() {
        return Ok(());
    }
    let sha256 = sha256_hex(&result.incremental_bytes);
    let storage_key = incremental_key(document_id, &sha256);
    let storage_key_json = encode_storage_key(&storage_key)?;
    let existing = transaction
        .query_row(
            "SELECT sha256 FROM sync_automerge_outbox WHERE storage_key_json = ?1",
            [&storage_key_json],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(database_error)?;
    if let Some(existing_sha256) = existing {
        if existing_sha256 != sha256 {
            return Err(sync_error("Automerge outbox storage key collision"));
        }
        return Ok(());
    }
    let change_count = i64::try_from(result.changes.len())
        .map_err(|_| sync_error("Automerge outbox change count exceeds SQLite INTEGER range"))?;
    transaction
        .execute(
            "INSERT INTO sync_automerge_outbox
             (id, storage_key_json, bytes, sha256, change_count)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                new_id(),
                storage_key_json,
                result.incremental_bytes,
                sha256,
                change_count
            ],
        )
        .map_err(database_error)?;
    Ok(())
}

fn project_document(
    transaction: &Transaction<'_>,
    result: &DocumentCommandResult,
) -> Result<(), SyncError> {
    let projection = &result.projection;
    let library_uuid = result
        .library_uuid
        .as_deref()
        .ok_or_else(|| sync_error("Cannot project a document without a library identity"))?;
    project_catalog(transaction, library_uuid, &projection.catalog_books)?;
    for position in &projection.reading_positions {
        let conflict_count = i64::try_from(position.conflict_count)
            .map_err(|_| sync_error("Too many reading position conflicts"))?;
        transaction
            .execute(
                "INSERT INTO reading_progress
                 (id, book_id, format, locator_json, display_progression, updated_at,
                  sync_conflict_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(book_id, format) DO UPDATE SET
                   locator_json = excluded.locator_json,
                   display_progression = excluded.display_progression,
                   updated_at = excluded.updated_at,
                   sync_conflict_count = excluded.sync_conflict_count",
                params![
                    new_id(),
                    position.book_id,
                    position.value.format,
                    position.value.locator_json,
                    position
                        .value
                        .display_progression_ppm
                        .map(|value| f64::from(value) / 1_000_000.0),
                    position.value.recorded_at,
                    conflict_count
                ],
            )
            .map_err(database_error)?;
    }
    for favorite in &projection.favorites {
        transaction
            .execute(
                "INSERT INTO favorite_books
                 (id, book_id, added_at, is_favorite)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(book_id) DO UPDATE SET
                   added_at = excluded.added_at,
                   is_favorite = excluded.is_favorite",
                params![
                    new_id(),
                    favorite.book_id,
                    favorite
                        .value
                        .added_at
                        .unwrap_or(favorite.value.recorded_at),
                    favorite.value.is_favorite
                ],
            )
            .map_err(database_error)?;
    }
    for bookmark in &projection.bookmarks {
        transaction
            .execute(
                "INSERT INTO bookmarks
                 (id, book_id, format, locator_key, locator_json,
                  created_at, updated_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(book_id, format, locator_key) DO UPDATE SET
                   id = excluded.id,
                   locator_json = excluded.locator_json,
                   created_at = excluded.created_at,
                   updated_at = excluded.updated_at,
                   deleted_at = excluded.deleted_at",
                params![
                    bookmark.id,
                    bookmark.book_id,
                    bookmark.format,
                    bookmark.locator_key,
                    bookmark.locator_json,
                    bookmark.created_at,
                    bookmark.recorded_at,
                    bookmark.deleted_at
                ],
            )
            .map_err(database_error)?;
    }
    for annotation in &projection.annotations {
        transaction
            .execute(
                "INSERT INTO annotations
                 (id, book_id, format, kind, locator_json, color, note,
                  created_at, updated_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                   book_id = excluded.book_id,
                   format = excluded.format,
                   kind = excluded.kind,
                   locator_json = excluded.locator_json,
                   color = excluded.color,
                   note = excluded.note,
                   created_at = excluded.created_at,
                   updated_at = excluded.updated_at,
                   deleted_at = excluded.deleted_at",
                params![
                    annotation.id,
                    annotation.book_id,
                    annotation.format,
                    annotation.kind,
                    annotation.locator_json,
                    annotation.color,
                    annotation.note,
                    annotation.created_at,
                    annotation.updated_at,
                    annotation.deleted_at
                ],
            )
            .map_err(database_error)?;
    }
    for session in &projection.reading_sessions {
        transaction
            .execute(
                "INSERT INTO reading_sessions
                 (id, book_id, format, local_day, started_at, duration_seconds, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                   book_id = excluded.book_id,
                   format = excluded.format,
                   local_day = excluded.local_day,
                   started_at = excluded.started_at,
                   duration_seconds = excluded.duration_seconds,
                   updated_at = excluded.updated_at",
                params![
                    session.id,
                    session.book_id,
                    session.format,
                    session.local_day,
                    session.started_at,
                    session.duration_seconds,
                    session.updated_at
                ],
            )
            .map_err(database_error)?;
    }
    for completion in &projection.reading_completions {
        transaction
            .execute(
                "INSERT INTO reading_completions
                 (id, book_id, format, local_day, completed_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(book_id) DO UPDATE SET
                   id = excluded.id,
                   format = excluded.format,
                   local_day = excluded.local_day,
                   completed_at = excluded.completed_at,
                   updated_at = excluded.updated_at",
                params![
                    completion.id,
                    completion.book_id,
                    completion.format,
                    completion.local_day,
                    completion.completed_at,
                    completion.updated_at
                ],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

fn project_catalog(
    transaction: &Transaction<'_>,
    library_uuid: &str,
    books: &[CatalogBookValue],
) -> Result<(), SyncError> {
    transaction
        .execute_batch(
            "DELETE FROM books_authors_link;
             DELETE FROM books_tags_link;
             DELETE FROM books_series_link;
             DELETE FROM books_publishers_link;
             DELETE FROM books_languages_link;
             DELETE FROM books_ratings_link;
             DELETE FROM comments;
             DELETE FROM identifiers;
             DELETE FROM data;
             DELETE FROM authors;
             DELETE FROM tags;
             DELETE FROM series;
             DELETE FROM publishers;
             DELETE FROM languages;
             DELETE FROM ratings;
             DELETE FROM books;
             DELETE FROM library_id;",
        )
        .map_err(database_error)?;
    transaction
        .execute(
            "INSERT INTO library_id (id, uuid) VALUES (1, ?1)",
            [library_uuid],
        )
        .map_err(database_error)?;

    let mut author_ids = BTreeMap::<String, i64>::new();
    let mut next_author_id = 1_i64;
    let mut next_author_link_id = 1_i64;
    let mut next_data_id = 1_i64;
    for book in books.iter().filter(|book| !book.deleted) {
        let author_sort = book.authors.join(" & ");
        transaction
            .execute(
                "INSERT INTO books
                 (id, title, sort, timestamp, pubdate, series_index, author_sort,
                  isbn, lccn, path, flags, uuid, has_cover, last_modified)
                 VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5,
                         NULL, NULL, ?6, 1, ?7, ?8, ?9)",
                params![
                    book.book_id,
                    book.title,
                    book.title,
                    book.timestamp,
                    author_sort,
                    book.path,
                    book.uuid,
                    book.has_cover,
                    book.last_modified
                ],
            )
            .map_err(database_error)?;

        let mut linked_author_ids = BTreeSet::new();
        for author in &book.authors {
            let author_id = match author_ids.get(author) {
                Some(id) => *id,
                None => {
                    let id = next_author_id;
                    next_author_id += 1;
                    transaction
                        .execute(
                            "INSERT INTO authors (id, name, sort, link)
                             VALUES (?1, ?2, ?2, NULL)",
                            params![id, author],
                        )
                        .map_err(database_error)?;
                    author_ids.insert(author.clone(), id);
                    id
                }
            };
            if !linked_author_ids.insert(author_id) {
                continue;
            }
            transaction
                .execute(
                    "INSERT INTO books_authors_link (id, book, author)
                     VALUES (?1, ?2, ?3)",
                    params![next_author_link_id, book.book_id, author_id],
                )
                .map_err(database_error)?;
            next_author_link_id += 1;
        }
        transaction
            .execute(
                "INSERT INTO data (id, book, format, uncompressed_size, name)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    next_data_id,
                    book.book_id,
                    book.format,
                    book.size,
                    book.name
                ],
            )
            .map_err(database_error)?;
        next_data_id += 1;
    }
    Ok(())
}

fn write_projection_meta(
    transaction: &Transaction<'_>,
    heads_json: &str,
    rebuilt_at: Option<i64>,
) -> Result<(), SyncError> {
    transaction
        .execute(
            "INSERT INTO sync_automerge_projection_meta
             (id, projection_version, heads_json, rebuilt_at)
             VALUES ('local', ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
               projection_version = excluded.projection_version,
               heads_json = excluded.heads_json,
               rebuilt_at = excluded.rebuilt_at",
            params![PROJECTION_VERSION, heads_json, rebuilt_at],
        )
        .map_err(database_error)?;
    Ok(())
}

fn projection_is_current(
    transaction: &Transaction<'_>,
    heads: &[String],
) -> Result<bool, SyncError> {
    let current = transaction
        .query_row(
            "SELECT projection_version, heads_json
             FROM sync_automerge_projection_meta
             WHERE id = 'local'",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(database_error)?;
    let Some((version, heads_json)) = current else {
        return Ok(false);
    };
    let expected_heads = serde_json::to_string(heads)
        .map_err(|error| sync_error(format!("Failed to encode Automerge heads: {error}")))?;
    Ok(version == PROJECTION_VERSION && heads_json == expected_heads)
}

fn rebuild_projection(
    transaction: &Transaction<'_>,
    result: &DocumentCommandResult,
    now_ms: i64,
) -> Result<(), SyncError> {
    if projection_is_current(transaction, &result.heads)? {
        return Ok(());
    }
    let heads_json = serde_json::to_string(&result.heads)
        .map_err(|error| sync_error(format!("Failed to encode Automerge heads: {error}")))?;
    project_document(transaction, result)?;
    write_projection_meta(transaction, &heads_json, Some(now_ms))
}

fn persist_local_result(
    transaction: &Transaction<'_>,
    identity: &DatabaseIdentity,
    result: &DocumentCommandResult,
    now_ms: i64,
    rebuilt_at: Option<i64>,
) -> Result<(), SyncError> {
    let heads_json = write_state(transaction, result, now_ms)?;
    insert_outbox(transaction, &identity.library_uuid, result)?;
    project_document(transaction, result)?;
    write_projection_meta(transaction, &heads_json, rebuilt_at)
}

fn persist_remote_result(
    transaction: &Transaction<'_>,
    identity: &DatabaseIdentity,
    result: &DocumentCommandResult,
    local_delta: &DocumentCommandResult,
    now_ms: i64,
) -> Result<(), SyncError> {
    let heads_json = write_state(transaction, result, now_ms)?;
    transaction
        .execute("DELETE FROM sync_automerge_outbox", [])
        .map_err(database_error)?;
    insert_outbox(transaction, &identity.library_uuid, local_delta)?;
    project_document(transaction, result)?;
    write_projection_meta(transaction, &heads_json, None)
}

fn initialize(
    transaction: &Transaction<'_>,
    identity: &DatabaseIdentity,
    now_ms: i64,
) -> Result<DocumentCommandResult, SyncError> {
    let genesis = execute_document_command(
        None,
        DocumentCommandRequest {
            replica_id: identity.replica_id.clone(),
            expected_library_uuid: None,
            base_heads: Vec::new(),
            command: DocumentCommand::Inspect,
        },
        None,
    )?;
    let initialized = execute_document_command(
        Some(&genesis.snapshot_bytes),
        DocumentCommandRequest {
            replica_id: identity.replica_id.clone(),
            expected_library_uuid: None,
            base_heads: genesis.heads,
            command: DocumentCommand::SetLibraryIdentity {
                library_uuid: identity.library_uuid.clone(),
                recorded_at: now_ms,
            },
        },
        None,
    )?;
    persist_local_result(transaction, identity, &initialized, now_ms, Some(now_ms))?;
    Ok(initialized)
}

pub fn execute_local_database_command(
    database_path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    command: SyncDatabaseCommand,
) -> Result<DocumentCommandResult, SyncError> {
    let _writer = writer()
        .lock()
        .map_err(|_| sync_error("SQLite sync writer lock is poisoned"))?;
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let current = match read_state(&transaction, identity)? {
        Some(state) => state,
        None => {
            let initialized = initialize(&transaction, identity, now_ms)?;
            PersistedState {
                snapshot_bytes: initialized.snapshot_bytes,
                heads: initialized.heads,
                migration: None,
            }
        }
    };
    if let Some(migration) = current.migration.as_ref() {
        persist_local_result(&transaction, identity, migration, now_ms, Some(now_ms))?;
    }
    let result = execute_document_command(
        Some(&current.snapshot_bytes),
        request(identity, current.heads, command.command),
        None,
    )?;
    if !result.changes.is_empty() {
        persist_local_result(&transaction, identity, &result, now_ms, None)?;
    } else {
        rebuild_projection(&transaction, &result, now_ms)?;
    }
    transaction.commit().map_err(database_error)?;
    Ok(result)
}

pub fn execute_local_database_mutation<F>(
    database_path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    mutate: F,
) -> Result<DocumentCommandResult, SyncError>
where
    F: FnOnce(&mut automerge::AutoCommit) -> Result<(), SyncError>,
{
    let _writer = writer()
        .lock()
        .map_err(|_| sync_error("SQLite sync writer lock is poisoned"))?;
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let current = match read_state(&transaction, identity)? {
        Some(state) => state,
        None => {
            let initialized = initialize(&transaction, identity, now_ms)?;
            PersistedState {
                snapshot_bytes: initialized.snapshot_bytes,
                heads: initialized.heads,
                migration: None,
            }
        }
    };
    if let Some(migration) = current.migration.as_ref() {
        persist_local_result(&transaction, identity, migration, now_ms, Some(now_ms))?;
    }
    let result = execute_document_mutation(
        &current.snapshot_bytes,
        &identity.replica_id,
        &identity.library_uuid,
        current.heads,
        mutate,
    )?;
    if !result.changes.is_empty() {
        persist_local_result(&transaction, identity, &result, now_ms, None)?;
    } else {
        rebuild_projection(&transaction, &result, now_ms)?;
    }
    transaction.commit().map_err(database_error)?;
    Ok(result)
}

pub fn ensure_database_document(
    database_path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
) -> Result<DocumentCommandResult, SyncError> {
    execute_local_database_command(
        database_path,
        identity,
        now_ms,
        SyncDatabaseCommand {
            command: DocumentCommand::Inspect,
        },
    )
}

#[cfg(test)]
pub fn list_pending_outbox(database_path: &str) -> Result<Vec<SyncOutboxEntry>, SyncError> {
    let connection = open_connection(database_path)?;
    read_pending_outbox(&connection)
}

pub fn list_publishable_outbox(
    database_path: &str,
) -> Result<Option<Vec<SyncOutboxEntry>>, SyncError> {
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(database_error)?;
    let blocked = transaction
        .query_row(
            "SELECT EXISTS (
               SELECT 1
               FROM pending_book_imports AS pending
               LEFT JOIN file_state AS file ON file.path = pending.relative_path
               WHERE file.id IS NULL OR file.local_state <> 'present'
             )",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(database_error)?;
    let pending = if blocked {
        None
    } else {
        Some(read_pending_outbox(&transaction)?)
    };
    transaction.commit().map_err(database_error)?;
    Ok(pending)
}

fn read_pending_outbox(connection: &Connection) -> Result<Vec<SyncOutboxEntry>, SyncError> {
    let mut statement = connection
        .prepare(
            "SELECT storage_key_json, bytes, sha256, change_count
             FROM sync_automerge_outbox
             ORDER BY rowid",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(database_error)?;
    rows.map(|row| {
        let (storage_key_json, bytes, sha256, change_count) = row.map_err(database_error)?;
        Ok(SyncOutboxEntry {
            storage_key: decode_storage_key(&storage_key_json)?,
            bytes,
            sha256,
            change_count: usize::try_from(change_count)
                .map_err(|_| sync_error("Stored Automerge change count is invalid"))?,
        })
    })
    .collect()
}

pub fn delete_outbox_entry(database_path: &str, storage_key: &[String]) -> Result<(), SyncError> {
    let storage_key_json = encode_storage_key(storage_key)?;
    let _writer = writer()
        .lock()
        .map_err(|_| sync_error("SQLite sync writer lock is poisoned"))?;
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    transaction
        .execute(
            "DELETE FROM sync_automerge_outbox
             WHERE storage_key_json = ?1",
            [storage_key_json],
        )
        .map_err(database_error)?;
    transaction.commit().map_err(database_error)
}

fn validate_remote_objects(objects: &[SyncRemoteObject]) -> Result<(), SyncError> {
    for object in objects {
        if sha256_hex(&object.bytes) != object.sha256 {
            return Err(sync_error("Remote Automerge object digest mismatch"));
        }
    }
    Ok(())
}

fn display_storage_key(key: &[String]) -> String {
    key.join("/")
}

pub fn apply_remote_database_objects(
    database_path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    objects: Vec<SyncRemoteObject>,
) -> Result<ApplyRemoteDatabaseResult, SyncError> {
    let _writer = writer()
        .lock()
        .map_err(|_| sync_error("SQLite sync writer lock is poisoned"))?;
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    let current = match read_state(&transaction, identity)? {
        Some(state) => state,
        None => {
            let initialized = initialize(&transaction, identity, now_ms)?;
            PersistedState {
                snapshot_bytes: initialized.snapshot_bytes,
                heads: initialized.heads,
                migration: None,
            }
        }
    };
    if let Some(migration) = current.migration.as_ref() {
        persist_local_result(&transaction, identity, migration, now_ms, Some(now_ms))?;
    }
    if objects.is_empty() {
        let document = execute_document_command(
            Some(&current.snapshot_bytes),
            request(identity, current.heads, DocumentCommand::Inspect),
            None,
        )?;
        transaction.commit().map_err(database_error)?;
        return Ok(ApplyRemoteDatabaseResult {
            document,
            applied_objects: 0,
        });
    }
    validate_remote_objects(&objects)?;
    let genesis = execute_document_command(
        None,
        DocumentCommandRequest {
            replica_id: identity.replica_id.clone(),
            expected_library_uuid: None,
            base_heads: Vec::new(),
            command: DocumentCommand::Inspect,
        },
        None,
    )?;
    let mut remote_snapshot = genesis.snapshot_bytes;
    for object in &objects {
        let applied = execute_document_command(
            Some(&remote_snapshot),
            request(identity, Vec::new(), DocumentCommand::ApplyIncremental),
            Some(&object.bytes),
        )
        .map_err(|error| SyncError::InvalidRemoteObject {
            object_path: display_storage_key(&object.storage_key),
            reason: error.to_string(),
        })?;
        remote_snapshot = applied.snapshot_bytes;
    }
    let remote = execute_document_command(
        Some(&remote_snapshot),
        request(
            identity,
            Vec::new(),
            DocumentCommand::InspectDependencies { heads: Vec::new() },
        ),
        None,
    )?;
    if !remote.missing_dependencies.is_empty() {
        return Err(SyncError::MissingDependencies {
            change_hashes: remote.missing_dependencies.join(","),
            object_paths: objects
                .iter()
                .map(|object| display_storage_key(&object.storage_key))
                .collect::<Vec<_>>()
                .join(","),
        });
    }
    let merged_bytes = objects
        .iter()
        .flat_map(|object| object.bytes.iter().copied())
        .collect::<Vec<_>>();
    let result = execute_document_command(
        Some(&current.snapshot_bytes),
        request(
            identity,
            current.heads.clone(),
            DocumentCommand::ApplyIncremental,
        ),
        Some(&merged_bytes),
    )?;
    let applied_changes = result.changes.len();
    let local_delta = execute_document_command(
        Some(&result.snapshot_bytes),
        request(identity, remote.heads, DocumentCommand::Inspect),
        None,
    )?;
    persist_remote_result(&transaction, identity, &result, &local_delta, now_ms)?;
    transaction.commit().map_err(database_error)?;
    Ok(ApplyRemoteDatabaseResult {
        document: result,
        applied_objects: applied_changes,
    })
}
