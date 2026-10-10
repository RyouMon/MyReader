use rusqlite::{types::Value, Connection};

use super::persistence_contract::{catalog_book, create_database, identity};
use crate::sync::{
    document::{
        add_reading_completion, create_catalog_book, set_favorite, set_reading_position,
        AnnotationValue, BookmarkValue, FavoriteValue, ReadingCompletionValue,
        ReadingPositionValue, ReadingSessionValue,
    },
    document_engine::{DocumentCommand, DocumentCommandResult},
    persistence::{
        apply_remote_database_objects, ensure_database_document, execute_local_database_command,
        execute_local_database_mutation, list_pending_outbox, SyncDatabaseCommand,
        SyncRemoteObject,
    },
};

const CATALOG_TABLES: &[&str] = &[
    "books",
    "authors",
    "books_authors_link",
    "data",
    "library_id",
];
const READING_TABLES: &[&str] = &[
    "reading_progress",
    "favorite_books",
    "bookmarks",
    "annotations",
    "reading_sessions",
    "reading_completions",
];

fn seed_catalog(path: &str) {
    execute_local_database_mutation(path, &identity(), 1, |doc| {
        create_catalog_book(doc, &catalog_book(), 1)?;
        Ok(())
    })
    .unwrap();
}

fn reject_writes(connection: &Connection, tables: &[&str]) {
    for table in tables {
        for action in ["INSERT", "UPDATE", "DELETE"] {
            connection
                .execute_batch(&format!(
                    "CREATE TRIGGER reject_{table}_{action} BEFORE {action} ON {table}
                     BEGIN SELECT RAISE(ABORT, 'unrelated projection was written'); END;"
                ))
                .unwrap();
        }
    }
}

fn allow_writes(connection: &Connection, tables: &[&str]) {
    for table in tables {
        for action in ["INSERT", "UPDATE", "DELETE"] {
            connection
                .execute_batch(&format!("DROP TRIGGER reject_{table}_{action}"))
                .unwrap();
        }
    }
}

fn rows(connection: &Connection, table: &str) -> Vec<Vec<Value>> {
    let mut statement = connection
        .prepare(&format!("SELECT * FROM {table} ORDER BY 1"))
        .unwrap();
    let columns = statement.column_count();
    statement
        .query_map([], |row| {
            (0..columns).map(|column| row.get(column)).collect()
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}

fn assert_matches_rebuild(path: &str) {
    let connection = Connection::open(path).unwrap();
    let tables = CATALOG_TABLES.iter().chain(READING_TABLES);
    let before: Vec<_> = tables
        .clone()
        .map(|table| rows(&connection, table))
        .collect();
    connection
        .execute("DELETE FROM sync_automerge_projection_meta", [])
        .unwrap();
    ensure_database_document(path, &identity(), 500).unwrap();
    let after: Vec<_> = tables.map(|table| rows(&connection, table)).collect();
    assert_eq!(
        before, after,
        "incremental projections must match a complete rebuild"
    );
}

fn position(replica: &str, time: i64) -> ReadingPositionValue {
    ReadingPositionValue {
        format: "EPUB".into(),
        locator_json: format!(r#"{{"href":"chapter-{time}.xhtml"}}"#),
        display_progression_ppm: Some(500_000),
        recorded_at: time,
        replica_id: replica.into(),
    }
}

fn completion() -> ReadingCompletionValue {
    ReadingCompletionValue {
        id: "dddddddddddd4ddd8ddddddddddddddd".into(),
        book_id: 42,
        format: "EPUB".into(),
        local_day: "2026-10-10".into(),
        completed_at: 10,
        updated_at: 10,
        replica_id: identity().replica_id,
    }
}

fn reading_commands() -> Vec<(&'static str, DocumentCommand)> {
    vec![
        (
            "reading_progress",
            DocumentCommand::SetReadingPosition {
                book_id: 42,
                value: position(&identity().replica_id, 10),
            },
        ),
        (
            "favorite_books",
            DocumentCommand::SetFavorite {
                book_id: 42,
                value: FavoriteValue {
                    is_favorite: true,
                    added_at: Some(10),
                    recorded_at: 10,
                    replica_id: identity().replica_id,
                },
            },
        ),
        (
            "bookmarks",
            DocumentCommand::SetBookmark {
                value: BookmarkValue {
                    id: "aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa".into(),
                    book_id: 42,
                    format: "EPUB".into(),
                    locator_key: "chapter-1".into(),
                    locator_json: r#"{"href":"chapter-1.xhtml"}"#.into(),
                    created_at: 10,
                    deleted_at: None,
                    recorded_at: 10,
                    replica_id: identity().replica_id,
                },
            },
        ),
        (
            "annotations",
            DocumentCommand::CreateAnnotation {
                value: AnnotationValue {
                    id: "bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb".into(),
                    book_id: 42,
                    format: "EPUB".into(),
                    kind: "highlight".into(),
                    locator_json: r#"{"href":"chapter-1.xhtml"}"#.into(),
                    created_at: 10,
                    color: "yellow".into(),
                    note: Some("note".into()),
                    updated_at: 10,
                    deleted: false,
                    deleted_at: None,
                },
            },
        ),
        (
            "reading_sessions",
            DocumentCommand::AddReadingSessionDuration {
                value: ReadingSessionValue {
                    id: "cccccccccccc4ccc8ccccccccccccccc".into(),
                    origin_replica_id: identity().replica_id,
                    book_id: 42,
                    format: "EPUB".into(),
                    local_day: "2026-10-10".into(),
                    started_at: 10,
                    duration_seconds: 5,
                    updated_at: 15,
                },
            },
        ),
        (
            "reading_completions",
            DocumentCommand::AddReadingCompletion {
                value: completion(),
            },
        ),
        (
            "annotations",
            DocumentCommand::UpdateAnnotation {
                id: "bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb".into(),
                color: "orange".into(),
                note: None,
                updated_at: 20,
            },
        ),
        (
            "annotations",
            DocumentCommand::DeleteAnnotation {
                id: "bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb".into(),
                deleted_at: 30,
            },
        ),
    ]
}

fn remote_objects(path: &str) -> Vec<SyncRemoteObject> {
    list_pending_outbox(path)
        .unwrap()
        .into_iter()
        .map(|entry| SyncRemoteObject {
            storage_key: entry.storage_key,
            bytes: entry.bytes,
            sha256: entry.sha256,
        })
        .collect()
}

fn install_snapshot(path: &str, snapshot: &DocumentCommandResult) {
    Connection::open(path)
        .unwrap()
        .execute(
            "INSERT INTO sync_automerge_state
         (id, schema_version, snapshot_bytes, heads_json, updated_at)
         VALUES ('local', ?1, ?2, ?3, 1)",
            rusqlite::params![
                snapshot.schema_version,
                snapshot.snapshot_bytes,
                serde_json::to_string(&snapshot.heads).unwrap()
            ],
        )
        .unwrap();
    ensure_database_document(path, &identity(), 1).unwrap();
}

#[test]
fn reading_mutation_should_leave_unrelated_projections_untouched() {
    let (_directory, path) = create_database();
    seed_catalog(&path);
    let connection = Connection::open(&path).unwrap();
    reject_writes(
        &connection,
        &[
            "books",
            "authors",
            "books_authors_link",
            "data",
            "library_id",
            "reading_progress",
            "bookmarks",
            "annotations",
            "reading_sessions",
            "reading_completions",
        ],
    );

    execute_local_database_mutation(&path, &identity(), 2, |doc| {
        set_favorite(
            doc,
            42,
            &FavoriteValue {
                is_favorite: true,
                added_at: Some(2),
                recorded_at: 2,
                replica_id: identity().replica_id,
            },
        )?;
        Ok(())
    })
    .unwrap();
    assert!(connection
        .query_row(
            "SELECT is_favorite FROM favorite_books WHERE book_id = 42",
            [],
            |row| { row.get::<_, bool>(0) }
        )
        .unwrap());
}

#[test]
fn each_reading_domain_should_match_a_rebuild_without_writing_other_domains() {
    let (_directory, path) = create_database();
    seed_catalog(&path);
    let connection = Connection::open(&path).unwrap();
    for (changed_table, command) in reading_commands() {
        let untouched: Vec<_> = CATALOG_TABLES
            .iter()
            .chain(READING_TABLES)
            .copied()
            .filter(|table| *table != changed_table)
            .collect();
        reject_writes(&connection, &untouched);
        execute_local_database_command(&path, &identity(), 100, SyncDatabaseCommand { command })
            .unwrap();
        assert!(!rows(&connection, changed_table).is_empty());
        allow_writes(&connection, &untouched);
        assert_matches_rebuild(&path);
    }
}

#[test]
fn one_mutation_should_project_both_position_and_completion() {
    let (_directory, path) = create_database();
    seed_catalog(&path);
    let connection = Connection::open(&path).unwrap();
    reject_writes(&connection, CATALOG_TABLES);
    execute_local_database_mutation(&path, &identity(), 10, |doc| {
        set_reading_position(doc, 42, &position(&identity().replica_id, 10))?;
        add_reading_completion(doc, &completion())?;
        Ok(())
    })
    .unwrap();
    assert_eq!(rows(&connection, "reading_progress").len(), 1);
    assert_eq!(rows(&connection, "reading_completions").len(), 1);
    allow_writes(&connection, CATALOG_TABLES);
    assert_matches_rebuild(&path);
}

#[test]
fn stale_projection_metadata_should_force_a_complete_rebuild_before_advancing_heads() {
    for invalidate in [
        "DELETE FROM sync_automerge_projection_meta",
        "UPDATE sync_automerge_projection_meta SET projection_version = 0",
        "UPDATE sync_automerge_projection_meta SET heads_json = '[]'",
    ] {
        let (_directory, path) = create_database();
        seed_catalog(&path);
        let connection = Connection::open(&path).unwrap();
        connection.execute("DELETE FROM books", []).unwrap();
        connection.execute(invalidate, []).unwrap();
        execute_local_database_command(
            &path,
            &identity(),
            100,
            SyncDatabaseCommand {
                command: reading_commands().remove(1).1,
            },
        )
        .unwrap();
        assert_eq!(rows(&connection, "books").len(), 1);
        assert_eq!(rows(&connection, "favorite_books").len(), 1);
        assert_matches_rebuild(&path);
    }
}

#[test]
fn failed_incremental_projection_should_roll_back_document_outbox_and_heads() {
    let (_directory, path) = create_database();
    seed_catalog(&path);
    let connection = Connection::open(&path).unwrap();
    let tables = [
        "sync_automerge_state",
        "sync_automerge_outbox",
        "sync_automerge_projection_meta",
        "favorite_books",
    ];
    let before: Vec<_> = tables
        .iter()
        .map(|table| rows(&connection, table))
        .collect();
    reject_writes(&connection, &["favorite_books"]);
    assert!(execute_local_database_command(
        &path,
        &identity(),
        100,
        SyncDatabaseCommand {
            command: reading_commands().remove(1).1,
        }
    )
    .is_err());
    let after: Vec<_> = tables
        .iter()
        .map(|table| rows(&connection, table))
        .collect();
    assert_eq!(before, after);
}

#[test]
fn remote_reading_changes_and_duplicate_delivery_should_not_rewrite_catalog() {
    let (_source_directory, source) = create_database();
    let (_target_directory, target) = create_database();
    seed_catalog(&source);
    let mut target_identity = identity();
    target_identity.replica_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb".into();
    apply_remote_database_objects(&target, &target_identity, 10, remote_objects(&source)).unwrap();
    let connection = Connection::open(&target).unwrap();
    reject_writes(&connection, CATALOG_TABLES);
    for (_, command) in reading_commands() {
        execute_local_database_command(&source, &identity(), 100, SyncDatabaseCommand { command })
            .unwrap();
        apply_remote_database_objects(&target, &target_identity, 100, remote_objects(&source))
            .unwrap();
    }
    reject_writes(&connection, READING_TABLES);
    let repeated =
        apply_remote_database_objects(&target, &target_identity, 200, remote_objects(&source))
            .unwrap();
    assert_eq!(repeated.applied_objects, 0);
    allow_writes(&connection, CATALOG_TABLES);
    allow_writes(&connection, READING_TABLES);
    assert_matches_rebuild(&target);
}

#[test]
fn losing_position_conflicts_should_update_candidates_and_resolve_without_catalog_writes() {
    let (_source_directory, source) = create_database();
    let (_target_directory, target) = create_database();
    seed_catalog(&source);
    let base = ensure_database_document(&source, &identity(), 1).unwrap();
    let shared_objects = remote_objects(&source);
    install_snapshot(&target, &base);
    let connection = Connection::open(&target).unwrap();
    reject_writes(&connection, CATALOG_TABLES);
    let mut target_identity = identity();
    target_identity.replica_id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd".into();
    // Deliver the winning actor first, followed by two losing values. The
    // visible locator stays unchanged while the conflict count grows to three.
    for (index, replica) in [
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]
    .iter()
    .enumerate()
    {
        let (_branch_directory, branch) = create_database();
        install_snapshot(&branch, &base);
        let mut replica_identity = identity();
        replica_identity.replica_id = (*replica).into();
        execute_local_database_command(
            &branch,
            &replica_identity,
            10,
            SyncDatabaseCommand {
                command: DocumentCommand::SetReadingPosition {
                    book_id: 42,
                    value: position(replica, 10 + index as i64),
                },
            },
        )
        .unwrap();
        let mut objects = shared_objects.clone();
        objects.extend(remote_objects(&branch));
        apply_remote_database_objects(&target, &target_identity, 100, objects).unwrap();
        let count: usize = connection
            .query_row(
                "SELECT sync_conflict_count FROM reading_progress WHERE book_id = 42",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, index + 1);
        let locator: String = connection
            .query_row(
                "SELECT locator_json FROM reading_progress WHERE book_id = 42",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(locator, position("", 10).locator_json);
    }
    let inspected = ensure_database_document(&target, &target_identity, 100).unwrap();
    assert_eq!(inspected.projection.reading_position_candidates.len(), 3);
    let chosen = &inspected.projection.reading_position_candidates[0];
    execute_local_database_command(
        &target,
        &target_identity,
        200,
        SyncDatabaseCommand {
            command: DocumentCommand::ResolveReadingPosition {
                book_id: 42,
                format: "EPUB".into(),
                operation_id: chosen.operation_id.clone(),
                recorded_at: 200,
            },
        },
    )
    .unwrap();
    let resolved = ensure_database_document(&target, &target_identity, 200).unwrap();
    assert_eq!(resolved.projection.reading_position_candidates.len(), 1);
    assert_eq!(
        resolved.projection.reading_positions[0].value.locator_json,
        chosen.value.locator_json
    );
    allow_writes(&connection, CATALOG_TABLES);
    assert_matches_rebuild(&target);
}

#[test]
fn catalog_metadata_and_deletion_should_preserve_reading_projections() {
    let (_directory, path) = create_database();
    seed_catalog(&path);
    for (_, command) in reading_commands() {
        execute_local_database_command(&path, &identity(), 100, SyncDatabaseCommand { command })
            .unwrap();
    }
    let connection = Connection::open(&path).unwrap();
    reject_writes(&connection, READING_TABLES);
    for command in [
        DocumentCommand::UpdateCatalogBookMetadata {
            uuid: catalog_book().uuid,
            title: "New title".into(),
            authors: vec!["First author".into(), "Second author".into()],
            last_modified: "2026-10-10T00:00:00Z".into(),
            recorded_at: 200,
        },
        DocumentCommand::DeleteCatalogBook {
            uuid: catalog_book().uuid,
            last_modified: "2026-10-10T01:00:00Z".into(),
            recorded_at: 300,
        },
    ] {
        execute_local_database_command(&path, &identity(), 300, SyncDatabaseCommand { command })
            .unwrap();
        allow_writes(&connection, READING_TABLES);
        assert_matches_rebuild(&path);
        reject_writes(&connection, READING_TABLES);
    }
    assert!(rows(&connection, "books").is_empty());
    assert!(rows(&connection, "authors").is_empty());
    assert!(rows(&connection, "data").is_empty());
    assert_eq!(rows(&connection, "reading_progress").len(), 1);
}

#[test]
fn no_op_should_skip_current_projections_but_rebuild_stale_ones() {
    let (_directory, path) = create_database();
    seed_catalog(&path);
    let connection = Connection::open(&path).unwrap();
    let tables: Vec<_> = CATALOG_TABLES
        .iter()
        .chain(READING_TABLES)
        .copied()
        .collect();
    reject_writes(&connection, &tables);
    execute_local_database_mutation(&path, &identity(), 100, |_| Ok(())).unwrap();
    allow_writes(&connection, &tables);
    connection.execute("DELETE FROM books", []).unwrap();
    connection
        .execute("DELETE FROM sync_automerge_projection_meta", [])
        .unwrap();
    execute_local_database_mutation(&path, &identity(), 200, |_| Ok(())).unwrap();
    assert_eq!(rows(&connection, "books").len(), 1);
    assert_matches_rebuild(&path);
}

#[test]
fn empty_and_duplicate_remote_pulls_should_repair_stale_projection_metadata() {
    let (_directory, path) = create_database();
    seed_catalog(&path);
    let connection = Connection::open(&path).unwrap();
    for objects in [Vec::new(), remote_objects(&path)] {
        connection.execute("DELETE FROM books", []).unwrap();
        connection
            .execute("DELETE FROM sync_automerge_projection_meta", [])
            .unwrap();
        let result = apply_remote_database_objects(&path, &identity(), 200, objects).unwrap();
        assert_eq!(result.applied_objects, 0);
        assert_eq!(rows(&connection, "books").len(), 1);
        assert_matches_rebuild(&path);
    }
}
