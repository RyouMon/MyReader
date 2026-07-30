use myreader_rust_components::{
    begin_coordinated_sync, cancel_download_task, cancel_sync_task, claim_download_task,
    count_calibre_books, create_sync_coordinator, dispose_sync_coordinator, enqueue_download_task,
    fail_coordinated_sync, get_reading_position, initialize_device_registry,
    list_book_cover_thumbnail_cache, list_download_tasks, migrate_library_database,
    read_sync_task_progress, register_device_library, release_download_task, release_sync_task,
    report_download_task_progress, request_coordinated_sync, set_reading_position,
    sync_contract_version, sync_library_sidecar, upsert_book_cover_thumbnail_cache,
    NativeBookCoverThumbnailCachePatch, NativeDataSource, NativeLibrary, NativeRemoteCredential,
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
        NativeBookCoverThumbnailCachePatch {
            book_id: 42,
            cover_identity: "cover-v2".into(),
            thumbnail_version: "v3".into(),
            width_px: 180,
            height_px: 270,
            file_name: "42.jpg".into(),
            file_size_bytes: 2048,
        },
    )
    .unwrap();

    let rows = list_book_cover_thumbnail_cache(sidecar_root, "v3".into(), 180, 270).unwrap();

    assert_eq!(rows[0].book_id, 42);
    assert_eq!(rows[0].file_name, "42.jpg");
}

#[test]
fn should_return_typed_position_when_native_bridge_reads_locator_document() {
    let sidecar_directory = tempfile::tempdir().unwrap();
    let library_directory = create_calibre_library();
    let sidecar_root = sidecar_directory.path().to_string_lossy().into_owned();
    let library_root = library_directory.path().to_string_lossy().into_owned();
    set_reading_position(
        sidecar_root.clone(),
        library_root,
        42,
        "EPUB".into(),
        r#"{"href":"chapter.xhtml","type":"application/xhtml+xml"}"#.into(),
        Some(0.4),
        900,
    )
    .unwrap();

    let position = get_reading_position(sidecar_root, 42, "EPUB".into())
        .unwrap()
        .unwrap();

    assert_eq!(position.book_id, 42);
    assert_eq!(position.display_progression, Some(0.4));
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&position.locator_json).unwrap()["href"],
        "chapter.xhtml"
    );
}

#[test]
fn should_persist_registry_when_native_bridge_registers_library() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("registry.json");
    let path = path.to_string_lossy().into_owned();
    initialize_device_registry(path.clone(), None).unwrap();

    let registry = register_device_library(
        path.clone(),
        NativeLibrary {
            id: "library".into(),
            name: "Library".into(),
            path: "/library".into(),
            book_count: 0,
            metadata_uri: None,
            added_at: None,
            data_source_id: None,
            source_type: Some("local".into()),
            source_path: None,
            metadata_etag: None,
            security_scoped_bookmark: None,
        },
    )
    .unwrap();
    let persisted = initialize_device_registry(path, None).unwrap();

    assert_eq!(registry.active_library_id, persisted.active_library_id);
    assert_eq!(registry.libraries[0].id, persisted.libraries[0].id);
}

#[test]
fn should_return_core_error_when_remote_credential_type_does_not_match_source() {
    let error = myreader_rust_components::test_remote_data_source(
        NativeDataSource {
            source_type: "webdav".into(),
            id: "source".into(),
            name: "Source".into(),
            enabled: true,
            root_path: None,
            readonly: None,
            created_at: None,
            endpoint: Some("https://example.com".into()),
            username: Some("reader".into()),
            has_password: true,
            credential_reference: None,
            client_id: None,
            tenant_id: None,
            display_name: None,
            email: None,
            has_refresh_token: false,
        },
        NativeRemoteCredential {
            credential_type: "onedrive".into(),
            password: None,
            access_token: Some("token".into()),
        },
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

#[test]
fn should_apply_shared_download_state_when_native_bridge_reports_progress() {
    let task_id = "native-download-contract".to_owned();
    let enqueued = enqueue_download_task(
        task_id.clone(),
        "library-download-contract".to_owned(),
        Some("42".to_owned()),
        Some("epub".to_owned()),
        "Author/Book/book.epub".to_owned(),
        "Book".to_owned(),
    )
    .unwrap();

    assert!(enqueued.inserted);
    assert_eq!(enqueued.task.status, "queued");
    assert_eq!(
        claim_download_task(task_id.clone()).unwrap().status,
        "starting"
    );
    let progress = report_download_task_progress(task_id.clone(), 25, 100).unwrap();
    assert_eq!(progress.status, "downloading");
    assert_eq!(progress.progress, 0.25);
    assert!(cancel_download_task(task_id.clone()));
    assert_eq!(
        list_download_tasks()
            .into_iter()
            .find(|task| task.id == task_id)
            .unwrap()
            .status,
        "cancelled"
    );
    assert!(release_download_task(task_id));
}
