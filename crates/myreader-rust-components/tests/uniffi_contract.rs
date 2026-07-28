use myreader_rust_components::{
    begin_coordinated_sync, cancel_sync_task, count_calibre_books, create_sync_coordinator,
    dispose_sync_coordinator, fail_coordinated_sync, initialize_device_registry,
    list_book_cover_thumbnail_cache, migrate_library_database, read_sync_task_progress,
    register_device_library, release_sync_task, request_coordinated_sync, sync_contract_version,
    sync_library_sidecar, upsert_book_cover_thumbnail_cache,
};
use rusqlite::Connection;

fn create_database() -> (tempfile::TempDir, String) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("myreader.db");
    let database_path = path.to_string_lossy().into_owned();
    migrate_library_database(database_path.clone()).unwrap();
    (directory, database_path)
}

fn create_calibre_library() -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    let connection = Connection::open(directory.path().join("metadata.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE library_id (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE
             );
             INSERT INTO library_id (id, uuid)
             VALUES (1, '11111111-2222-4333-8444-555555555555');",
        )
        .unwrap();
    directory
}

#[test]
fn should_expose_current_sync_contract_version_when_bridge_loads() {
    assert_eq!(sync_contract_version(), 11);
}

#[test]
fn should_create_library_schema_when_native_bridge_migrates_database() {
    let (_database_directory, database_path) = create_database();
    let connection = Connection::open(database_path).unwrap();

    let table_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table' AND name = 'reading_progress'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(table_count, 1);
}

#[test]
fn should_return_catalog_count_when_native_bridge_reads_calibre_library() {
    let directory = tempfile::tempdir().unwrap();
    let connection = Connection::open(directory.path().join("metadata.db")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE books (
                id INTEGER PRIMARY KEY,
                title TEXT,
                sort TEXT,
                timestamp TEXT,
                pubdate TEXT,
                series_index REAL,
                author_sort TEXT,
                isbn TEXT,
                lccn TEXT,
                path TEXT,
                flags INTEGER,
                uuid TEXT,
                has_cover INTEGER,
                last_modified TEXT
             );
             INSERT INTO books (id) VALUES (1), (2);",
        )
        .unwrap();

    let count = count_calibre_books(directory.path().to_string_lossy().into_owned()).unwrap();

    assert_eq!(count, 2);
}

#[test]
fn should_round_trip_cover_manifest_when_native_bridge_owns_database() {
    let directory = tempfile::tempdir().unwrap();
    let sidecar_root = directory.path().to_string_lossy().into_owned();
    upsert_book_cover_thumbnail_cache(
        sidecar_root.clone(),
        serde_json::json!({
            "bookId": 42,
            "coverIdentity": "cover-v2",
            "thumbnailVersion": "v3",
            "widthPx": 180,
            "heightPx": 270,
            "fileName": "42.jpg",
            "fileSizeBytes": 2048
        })
        .to_string(),
    )
    .unwrap();

    let rows: serde_json::Value = serde_json::from_str(
        &list_book_cover_thumbnail_cache(sidecar_root, "v3".into(), 180, 270).unwrap(),
    )
    .unwrap();

    assert_eq!(rows[0]["bookId"], 42);
    assert_eq!(rows[0]["fileName"], "42.jpg");
}

#[test]
fn should_persist_registry_when_native_bridge_registers_library() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("registry.json");
    let path = path.to_string_lossy().into_owned();
    initialize_device_registry(path.clone(), None).unwrap();

    let registry_json = register_device_library(
        path.clone(),
        serde_json::json!({
            "id": "library",
            "name": "Library",
            "path": "/library",
            "bookCount": 0,
            "sourceType": "local"
        })
        .to_string(),
    )
    .unwrap();
    let persisted_json = initialize_device_registry(path, None).unwrap();

    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&registry_json).unwrap(),
        serde_json::from_str::<serde_json::Value>(&persisted_json).unwrap()
    );
}

#[test]
fn should_return_core_error_when_remote_credential_type_does_not_match_source() {
    let error = myreader_rust_components::test_remote_data_source(
        serde_json::json!({
            "type": "webdav",
            "id": "source",
            "name": "Source",
            "enabled": true,
            "endpoint": "https://example.com",
            "username": "reader",
            "hasPassword": true
        })
        .to_string(),
        serde_json::json!({
            "type": "onedrive",
            "accessToken": "token"
        })
        .to_string(),
    )
    .unwrap_err();

    assert!(
        error
            .to_string()
            .contains("DATASOURCE_CREDENTIAL_TYPE_MISMATCH"),
        "unexpected error: {error}"
    );
}

#[test]
fn should_report_missing_task_when_task_is_not_registered() {
    assert!(read_sync_task_progress("missing".to_owned()).is_none());
    assert!(!cancel_sync_task("missing".to_owned()));
    assert!(!release_sync_task("missing".to_owned()));
}

#[test]
fn should_run_sync_when_native_caller_has_no_tokio_runtime() {
    let sidecar_directory = tempfile::tempdir().unwrap();
    let library_directory = create_calibre_library();
    let remote_directory = tempfile::tempdir().unwrap();

    let report = sync_library_sidecar(
        "native-task".to_owned(),
        sidecar_directory.path().to_string_lossy().into_owned(),
        library_directory.path().to_string_lossy().into_owned(),
        "100".to_owned(),
        "full".to_owned(),
        serde_json::json!({
            "kind": "local-direct",
            "root": remote_directory.path(),
        })
        .to_string(),
    )
    .unwrap();

    assert!(report.pushed > 0);
    assert_eq!(report.pulled, 0);
    assert!(release_sync_task("native-task".to_owned()));
}

#[test]
fn should_own_retry_schedule_when_native_bridge_uses_sidecar_root() {
    let sidecar_directory = tempfile::tempdir().unwrap();
    let sidecar_root = sidecar_directory.path().to_string_lossy().into_owned();
    let coordinator_id = "coordinator-1".to_owned();
    assert!(create_sync_coordinator(coordinator_id.clone()));
    let requested = serde_json::from_str::<serde_json::Value>(
        &request_coordinated_sync(
            coordinator_id.clone(),
            "library-1".to_owned(),
            "full".to_owned(),
            "app_foregrounded".to_owned(),
            "immediate".to_owned(),
            "100".to_owned(),
        )
        .unwrap(),
    )
    .unwrap();
    let generation = requested["schedules"][0]["generation"].as_u64().unwrap();
    let begun = serde_json::from_str::<serde_json::Value>(
        &begin_coordinated_sync(coordinator_id.clone(), "library-1".to_owned(), generation)
            .unwrap(),
    )
    .unwrap();

    fail_coordinated_sync(
        coordinator_id.clone(),
        sidecar_root.clone(),
        begun["execution"].to_string(),
        "connectivity".to_owned(),
        "network unavailable".to_owned(),
        "200".to_owned(),
        0.5,
    )
    .unwrap();

    let connection = Connection::open(
        sidecar_directory
            .path()
            .join(".myreader")
            .join("myreader.db"),
    )
    .unwrap();
    let (next_retry_at, failure_count): (i64, i64) = connection
        .query_row(
            "SELECT next_retry_at, transient_failure_count
             FROM sync_schedule_state
             WHERE id = 'local'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(next_retry_at, 1_200);
    assert_eq!(failure_count, 1);
    dispose_sync_coordinator(coordinator_id).unwrap();
}

#[test]
fn should_preserve_failure_stage_when_native_sync_returns_original_cause() {
    let sidecar_directory = tempfile::tempdir().unwrap();
    let library_directory = create_calibre_library();

    let error = sync_library_sidecar(
        "failing-task".to_owned(),
        sidecar_directory.path().to_string_lossy().into_owned(),
        library_directory.path().to_string_lossy().into_owned(),
        "100".to_owned(),
        "full".to_owned(),
        serde_json::json!({ "kind": "local-direct", "root": "" }).to_string(),
    )
    .unwrap_err();

    assert!(error.to_string().contains("Local storage root is missing"));
    assert_eq!(
        read_sync_task_progress("failing-task".to_owned())
            .unwrap()
            .stage,
        "preparing_failed"
    );
    assert!(release_sync_task("failing-task".to_owned()));
}
