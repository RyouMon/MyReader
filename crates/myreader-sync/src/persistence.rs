use std::{
    sync::{Mutex, OnceLock},
    time::Duration,
};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    document::LIBRARY_SIDECAR_SCHEMA_VERSION,
    document_engine::{
        execute_document_command, DocumentCommand, DocumentCommandRequest, DocumentCommandResult,
        DocumentProjection,
    },
    SyncError,
};

const PROJECTION_VERSION: i64 = 1;
const REMOTE_CHANGES_ROOT: &str = ".myreader/automerge/changes";

static WRITER: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseIdentity {
    pub library_uuid: String,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDatabaseCommand {
    pub command: DocumentCommand,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncOutboxEntry {
    pub object_path: String,
    pub bytes: Vec<u8>,
    pub sha256: String,
    pub change_hashes_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncRemoteObject {
    pub object_path: String,
    pub head: String,
    pub bytes: Vec<u8>,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplyRemoteDatabaseResult {
    pub document: DocumentCommandResult,
    pub applied_objects: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncDatabaseDiagnostics {
    pub schema_version: Option<i64>,
    pub heads: Vec<String>,
    pub changes: i64,
    pub pending_outbox: i64,
    pub receipts: i64,
    pub projection_version: Option<i64>,
}

#[derive(Debug)]
struct PersistedState {
    snapshot_bytes: Vec<u8>,
    heads: Vec<String>,
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

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn outbox_path(actor_id: &str, sequence: u64, hash: &str) -> String {
    format!("{REMOTE_CHANGES_ROOT}/{actor_id}/{sequence:020}-{hash}.am")
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
    if schema_version != LIBRARY_SIDECAR_SCHEMA_VERSION as i64 {
        return Err(sync_error(format!(
            "Unsupported persisted Automerge schema {schema_version}"
        )));
    }
    let heads = serde_json::from_str::<Vec<String>>(&heads_json)
        .map_err(|error| sync_error(format!("Persisted Automerge heads are invalid: {error}")))?;
    let inspected = execute_document_command(
        Some(&snapshot_bytes),
        request(identity, Vec::new(), DocumentCommand::Inspect),
        None,
    )?;
    if inspected.heads != heads {
        return Err(sync_error(
            "Persisted Automerge heads do not match its snapshot",
        ));
    }
    Ok(Some(PersistedState {
        snapshot_bytes,
        heads,
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

fn insert_changes(
    transaction: &Transaction<'_>,
    result: &DocumentCommandResult,
    origin: &str,
    now_ms: i64,
) -> Result<(), SyncError> {
    for change in &result.changes {
        let existing = transaction
            .query_row(
                "SELECT change_hash
                 FROM sync_automerge_changes
                 WHERE change_hash = ?1
                    OR (actor_id = ?2 AND actor_sequence = ?3)
                 LIMIT 1",
                params![change.hash, change.actor_id, change.sequence.to_string()],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(database_error)?;
        if let Some(existing_hash) = existing {
            if existing_hash != change.hash {
                return Err(sync_error(format!(
                    "Automerge actor {} sequence {} is a fork",
                    change.actor_id, change.sequence
                )));
            }
            continue;
        }
        transaction
            .execute(
                "INSERT INTO sync_automerge_changes
                 (id, change_hash, actor_id, actor_sequence, bytes, origin, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    new_id(),
                    change.hash,
                    change.actor_id,
                    change.sequence.to_string(),
                    change.bytes,
                    origin,
                    now_ms
                ],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

fn insert_outbox(
    transaction: &Transaction<'_>,
    result: &DocumentCommandResult,
) -> Result<(), SyncError> {
    let Some(last_change) = result.changes.last() else {
        return Ok(());
    };
    let path = outbox_path(
        &last_change.actor_id,
        last_change.sequence,
        &last_change.hash,
    );
    let sha256 = sha256_hex(&result.incremental_bytes);
    let existing = transaction
        .query_row(
            "SELECT sha256 FROM sync_automerge_outbox WHERE object_path = ?1",
            [&path],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(database_error)?;
    if let Some(existing_sha256) = existing {
        if existing_sha256 != sha256 {
            return Err(sync_error(format!(
                "Automerge outbox path collision: {path}"
            )));
        }
        return Ok(());
    }
    let change_hashes_json = serde_json::to_string(
        &result
            .changes
            .iter()
            .map(|change| change.hash.as_str())
            .collect::<Vec<_>>(),
    )
    .map_err(|error| sync_error(format!("Failed to encode change hashes: {error}")))?;
    transaction
        .execute(
            "INSERT INTO sync_automerge_outbox
             (id, object_path, bytes, sha256, change_hashes_json, published_at)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL)",
            params![
                new_id(),
                path,
                result.incremental_bytes,
                sha256,
                change_hashes_json
            ],
        )
        .map_err(database_error)?;
    Ok(())
}

fn project_document(
    transaction: &Transaction<'_>,
    projection: &DocumentProjection,
) -> Result<(), SyncError> {
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
    project_document(transaction, &result.projection)?;
    write_projection_meta(transaction, &heads_json, Some(now_ms))
}

fn persist_local_result(
    transaction: &Transaction<'_>,
    result: &DocumentCommandResult,
    now_ms: i64,
    rebuilt_at: Option<i64>,
) -> Result<(), SyncError> {
    let heads_json = write_state(transaction, result, now_ms)?;
    insert_changes(transaction, result, "local", now_ms)?;
    insert_outbox(transaction, result)?;
    project_document(transaction, &result.projection)?;
    write_projection_meta(transaction, &heads_json, rebuilt_at)
}

fn persist_remote_result(
    transaction: &Transaction<'_>,
    result: &DocumentCommandResult,
    objects: &[SyncRemoteObject],
    now_ms: i64,
) -> Result<(), SyncError> {
    let heads_json = write_state(transaction, result, now_ms)?;
    insert_changes(transaction, result, "remote", now_ms)?;
    for object in objects {
        transaction
            .execute(
                "INSERT INTO sync_automerge_receipts
                 (id, object_path, sha256, applied_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(object_path) DO UPDATE SET
                   sha256 = excluded.sha256,
                   applied_at = excluded.applied_at",
                params![new_id(), object.object_path, object.sha256, now_ms],
            )
            .map_err(database_error)?;
    }
    project_document(transaction, &result.projection)?;
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
    persist_local_result(transaction, &initialized, now_ms, Some(now_ms))?;
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
            }
        }
    };
    let result = execute_document_command(
        Some(&current.snapshot_bytes),
        request(identity, current.heads, command.command),
        None,
    )?;
    if !result.changes.is_empty() {
        persist_local_result(&transaction, &result, now_ms, None)?;
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

pub fn list_pending_outbox(database_path: &str) -> Result<Vec<SyncOutboxEntry>, SyncError> {
    let connection = open_connection(database_path)?;
    let mut statement = connection
        .prepare(
            "SELECT object_path, bytes, sha256, change_hashes_json
             FROM sync_automerge_outbox
             WHERE published_at IS NULL
             ORDER BY object_path",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok(SyncOutboxEntry {
                object_path: row.get(0)?,
                bytes: row.get(1)?,
                sha256: row.get(2)?,
                change_hashes_json: row.get(3)?,
            })
        })
        .map_err(database_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(database_error)
}

pub fn mark_outbox_published(
    database_path: &str,
    object_path: &str,
    published_at: i64,
) -> Result<(), SyncError> {
    let _writer = writer()
        .lock()
        .map_err(|_| sync_error("SQLite sync writer lock is poisoned"))?;
    let mut connection = open_connection(database_path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(database_error)?;
    transaction
        .execute(
            "UPDATE sync_automerge_outbox
             SET published_at = ?1
             WHERE object_path = ?2",
            params![published_at, object_path],
        )
        .map_err(database_error)?;
    transaction.commit().map_err(database_error)
}

pub fn has_receipt(database_path: &str, object_path: &str) -> Result<bool, SyncError> {
    let connection = open_connection(database_path)?;
    connection
        .query_row(
            "SELECT 1
             FROM sync_automerge_receipts
             WHERE object_path = ?1
             LIMIT 1",
            [object_path],
            |_| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(database_error)
}

fn unreceived_remote_objects(
    transaction: &Transaction<'_>,
    objects: Vec<SyncRemoteObject>,
) -> Result<Vec<SyncRemoteObject>, SyncError> {
    let mut unreceived = Vec::new();
    for object in objects {
        if sha256_hex(&object.bytes) != object.sha256 {
            return Err(sync_error(format!(
                "Remote Automerge object digest mismatch: {}",
                object.object_path
            )));
        }
        let receipt_sha256 = transaction
            .query_row(
                "SELECT sha256
                 FROM sync_automerge_receipts
                 WHERE object_path = ?1",
                [&object.object_path],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(database_error)?;
        match receipt_sha256 {
            Some(value) if value == object.sha256 => continue,
            Some(_) => {
                return Err(sync_error(format!(
                    "Remote Automerge object changed: {}",
                    object.object_path
                )));
            }
            None => unreceived.push(object),
        }
    }
    Ok(unreceived)
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
            }
        }
    };
    let objects = unreceived_remote_objects(&transaction, objects)?;
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
    let base_heads = current.heads;
    let mut snapshot = current.snapshot_bytes;
    for object in &objects {
        let applied = execute_document_command(
            Some(&snapshot),
            request(
                identity,
                base_heads.clone(),
                DocumentCommand::ApplyIncremental,
            ),
            Some(&object.bytes),
        )?;
        snapshot = applied.snapshot_bytes;
    }
    let result = execute_document_command(
        Some(&snapshot),
        request(
            identity,
            base_heads,
            DocumentCommand::InspectDependencies {
                heads: objects.iter().map(|object| object.head.clone()).collect(),
            },
        ),
        None,
    )?;
    if !result.missing_dependencies.is_empty() {
        return Err(sync_error(
            "Remote Automerge objects have missing dependencies",
        ));
    }
    persist_remote_result(&transaction, &result, &objects, now_ms)?;
    transaction.commit().map_err(database_error)?;
    Ok(ApplyRemoteDatabaseResult {
        document: result,
        applied_objects: objects.len(),
    })
}

pub fn read_database_diagnostics(
    database_path: &str,
) -> Result<SyncDatabaseDiagnostics, SyncError> {
    let connection = open_connection(database_path)?;
    connection
        .query_row(
            "SELECT
               (SELECT schema_version FROM sync_automerge_state WHERE id = 'local'),
               (SELECT heads_json FROM sync_automerge_state WHERE id = 'local'),
               (SELECT COUNT(*) FROM sync_automerge_changes),
               (SELECT COUNT(*) FROM sync_automerge_outbox WHERE published_at IS NULL),
               (SELECT COUNT(*) FROM sync_automerge_receipts),
               (SELECT projection_version
                FROM sync_automerge_projection_meta
                WHERE id = 'local')",
            [],
            |row| {
                let heads_json = row.get::<_, Option<String>>(1)?;
                let heads = heads_json
                    .as_deref()
                    .map(serde_json::from_str::<Vec<String>>)
                    .transpose()
                    .map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            1,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?
                    .unwrap_or_default();
                Ok(SyncDatabaseDiagnostics {
                    schema_version: row.get(0)?,
                    heads,
                    changes: row.get(2)?,
                    pending_outbox: row.get(3)?,
                    receipts: row.get(4)?,
                    projection_version: row.get(5)?,
                })
            },
        )
        .map_err(database_error)
}
