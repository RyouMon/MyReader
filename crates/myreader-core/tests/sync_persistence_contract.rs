use myreader_core::sync::document::{FavoriteValue, LIBRARY_SIDECAR_SCHEMA_VERSION};
use myreader_core::sync::document_engine::DocumentCommand;
use myreader_core::sync::persistence::{
    apply_remote_database_objects, ensure_database_document, ensure_database_identity,
    execute_local_database_command, list_pending_outbox, mark_schedule_succeeded,
    read_schedule_state, write_schedule_state, DatabaseIdentity, SyncDatabaseCommand,
    SyncRemoteObject, SyncScheduleState,
};
use rusqlite::Connection;

const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";
const REPLICA_ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

fn create_database() -> (tempfile::TempDir, String) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("myreader.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(
            r#"
            CREATE TABLE reading_progress (
                id TEXT PRIMARY KEY NOT NULL,
                book_id INTEGER NOT NULL,
                format TEXT NOT NULL,
                locator_json TEXT NOT NULL,
                display_progression REAL,
                updated_at REAL NOT NULL,
                sync_conflict_count INTEGER DEFAULT 0 NOT NULL,
                UNIQUE(book_id, format)
            );
            CREATE TABLE favorite_books (
                id TEXT PRIMARY KEY NOT NULL,
                book_id INTEGER NOT NULL UNIQUE,
                added_at REAL NOT NULL,
                is_favorite INTEGER DEFAULT 1 NOT NULL
            );
            CREATE TABLE bookmarks (
                id TEXT PRIMARY KEY NOT NULL,
                book_id INTEGER NOT NULL,
                format TEXT NOT NULL,
                locator_key TEXT NOT NULL,
                locator_json TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                deleted_at REAL,
                UNIQUE(book_id, format, locator_key)
            );
            CREATE TABLE annotations (
                id TEXT PRIMARY KEY NOT NULL,
                book_id INTEGER NOT NULL,
                format TEXT NOT NULL,
                kind TEXT NOT NULL,
                locator_json TEXT NOT NULL,
                color TEXT NOT NULL,
                note TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                deleted_at REAL
            );
            CREATE TABLE reading_sessions (
                id TEXT PRIMARY KEY NOT NULL,
                book_id INTEGER NOT NULL,
                format TEXT NOT NULL,
                local_day TEXT NOT NULL,
                started_at REAL NOT NULL,
                duration_seconds INTEGER NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE reading_completions (
                id TEXT PRIMARY KEY NOT NULL,
                book_id INTEGER NOT NULL UNIQUE,
                format TEXT NOT NULL,
                local_day TEXT NOT NULL,
                completed_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE TABLE sync_automerge_changes (
                id TEXT PRIMARY KEY NOT NULL,
                change_hash TEXT NOT NULL UNIQUE,
                actor_id TEXT NOT NULL,
                actor_sequence TEXT NOT NULL,
                bytes BLOB NOT NULL,
                origin TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(actor_id, actor_sequence)
            );
            CREATE TABLE sync_automerge_outbox (
                id TEXT PRIMARY KEY NOT NULL,
                object_path TEXT NOT NULL UNIQUE,
                bytes BLOB NOT NULL,
                sha256 TEXT NOT NULL,
                change_hashes_json TEXT NOT NULL,
                published_at INTEGER
            );
            CREATE TABLE sync_automerge_projection_meta (
                id TEXT PRIMARY KEY NOT NULL,
                projection_version INTEGER NOT NULL,
                heads_json TEXT NOT NULL,
                rebuilt_at INTEGER
            );
            CREATE TABLE sync_automerge_receipts (
                id TEXT PRIMARY KEY NOT NULL,
                object_path TEXT NOT NULL UNIQUE,
                sha256 TEXT NOT NULL,
                applied_at INTEGER NOT NULL
            );
            CREATE TABLE sync_automerge_state (
                id TEXT PRIMARY KEY NOT NULL,
                schema_version INTEGER NOT NULL,
                snapshot_bytes BLOB NOT NULL,
                heads_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE sync_local_meta (
                id TEXT PRIMARY KEY NOT NULL,
                protocol TEXT NOT NULL,
                library_uuid TEXT NOT NULL,
                replica_id TEXT NOT NULL
            );
            CREATE TABLE sync_schedule_state (
                id TEXT PRIMARY KEY NOT NULL,
                last_successful_pull_at INTEGER,
                next_retry_at INTEGER,
                transient_failure_count INTEGER DEFAULT 0 NOT NULL,
                suspended_reason TEXT
            );
            "#,
        )
        .unwrap();
    (directory, path.to_string_lossy().into_owned())
}

#[test]
fn should_reuse_replica_identity_when_database_identity_is_ensured_again() {
    let (_directory, path) = create_database();

    let first = ensure_database_identity(&path, LIBRARY_UUID).unwrap();
    let second = ensure_database_identity(&path, LIBRARY_UUID).unwrap();

    assert_eq!(first, second);
    assert_eq!(first.library_uuid, LIBRARY_UUID);
    assert_eq!(first.replica_id.len(), 36);
}

#[test]
fn should_reject_library_mismatch_when_database_identity_already_exists() {
    let (_directory, path) = create_database();
    ensure_database_identity(&path, LIBRARY_UUID).unwrap();

    let error =
        ensure_database_identity(&path, "22222222-3333-4444-8555-666666666666").unwrap_err();

    assert!(error
        .to_string()
        .contains("Local sidecar identity does not match this library"));
}

#[test]
fn should_preserve_last_pull_when_schedule_retry_is_cleared_after_push() {
    let (_directory, path) = create_database();
    write_schedule_state(
        &path,
        &SyncScheduleState {
            last_successful_pull_at: Some(100),
            next_retry_at: Some(200),
            transient_failure_count: 2,
            suspended_reason: Some("network".to_owned()),
        },
    )
    .unwrap();

    mark_schedule_succeeded(&path, None).unwrap();

    assert_eq!(
        read_schedule_state(&path).unwrap(),
        Some(SyncScheduleState {
            last_successful_pull_at: Some(100),
            next_retry_at: None,
            transient_failure_count: 0,
            suspended_reason: None,
        })
    );
}

fn identity() -> DatabaseIdentity {
    DatabaseIdentity {
        library_uuid: LIBRARY_UUID.to_owned(),
        replica_id: REPLICA_ID.to_owned(),
    }
}

fn favorite_command() -> SyncDatabaseCommand {
    SyncDatabaseCommand {
        command: DocumentCommand::SetFavorite {
            book_id: 42,
            value: FavoriteValue {
                is_favorite: true,
                added_at: Some(100),
                recorded_at: 100,
                replica_id: REPLICA_ID.to_owned(),
            },
        },
    }
}

#[test]
fn should_commit_projection_change_and_outbox_when_local_mutation_succeeds() {
    let (_directory, path) = create_database();

    let result =
        execute_local_database_command(&path, &identity(), 100, favorite_command()).unwrap();

    let connection = Connection::open(path).unwrap();
    let favorite: (i64, i64) = connection
        .query_row(
            "SELECT book_id, is_favorite FROM favorite_books",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(favorite, (42, 1));
    assert_eq!(result.schema_version, LIBRARY_SIDECAR_SCHEMA_VERSION);
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM sync_automerge_state", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
        1
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM sync_automerge_changes", [], |row| row
                .get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM sync_automerge_outbox", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
        2
    );
}

#[test]
fn should_roll_back_state_change_outbox_and_projection_when_projection_fails() {
    let (_directory, path) = create_database();
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(
            r#"
            CREATE TRIGGER fail_favorite_projection
            BEFORE INSERT ON favorite_books
            BEGIN SELECT RAISE(ABORT, 'projection failed'); END;
            "#,
        )
        .unwrap();
    drop(connection);

    assert!(execute_local_database_command(&path, &identity(), 100, favorite_command()).is_err());

    let connection = Connection::open(path).unwrap();
    for table in [
        "favorite_books",
        "sync_automerge_state",
        "sync_automerge_changes",
        "sync_automerge_outbox",
        "sync_automerge_projection_meta",
    ] {
        let count: i64 = connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0, "{table} should roll back");
    }
}

#[test]
fn should_project_remote_mutation_when_two_databases_exchange_outbox_objects() {
    let (_source_directory, source_path) = create_database();
    execute_local_database_command(&source_path, &identity(), 100, favorite_command()).unwrap();
    let source_objects = list_pending_outbox(&source_path).unwrap();
    assert_eq!(source_objects.len(), 2);

    let (_target_directory, target_path) = create_database();
    let target_identity = DatabaseIdentity {
        library_uuid: LIBRARY_UUID.to_owned(),
        replica_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb".to_owned(),
    };
    let objects = source_objects
        .into_iter()
        .map(|entry| {
            let head = entry
                .object_path
                .rsplit_once('-')
                .unwrap()
                .1
                .strip_suffix(".am")
                .unwrap()
                .to_owned();
            SyncRemoteObject {
                object_path: entry.object_path,
                bytes: entry.bytes,
                sha256: entry.sha256,
                head,
            }
        })
        .collect();

    let result =
        apply_remote_database_objects(&target_path, &target_identity, 200, objects).unwrap();

    assert_eq!(result.applied_objects, 2);
    let connection = Connection::open(target_path).unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT is_favorite FROM favorite_books WHERE book_id = 42",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM sync_automerge_receipts", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
        2
    );
}

#[test]
fn should_rebuild_projection_when_projection_metadata_is_missing() {
    let (_directory, path) = create_database();
    execute_local_database_command(&path, &identity(), 100, favorite_command()).unwrap();
    let connection = Connection::open(&path).unwrap();
    connection
        .execute("DELETE FROM favorite_books", [])
        .unwrap();
    connection
        .execute("DELETE FROM sync_automerge_projection_meta", [])
        .unwrap();
    drop(connection);

    ensure_database_document(&path, &identity(), 200).unwrap();

    let connection = Connection::open(path).unwrap();
    assert_eq!(
        connection
            .query_row(
                "SELECT is_favorite FROM favorite_books WHERE book_id = 42",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
        1
    );
    assert_eq!(
        connection
            .query_row(
                "SELECT rebuilt_at
                 FROM sync_automerge_projection_meta
                 WHERE id = 'local'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
        200
    );
}
