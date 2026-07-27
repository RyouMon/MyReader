use myreader_rust_components::{
    cancel_sync_task, ensure_sync_database_identity, mark_sync_database_schedule_succeeded,
    migrate_library_database, read_sync_database_schedule_state, read_sync_task_progress,
    release_sync_task, sync_contract_version, sync_library_sidecar,
    write_sync_database_schedule_state, SyncDatabaseScheduleState,
};
use rusqlite::Connection;

fn create_database() -> (tempfile::TempDir, String) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("myreader.db");
    let database_path = path.to_string_lossy().into_owned();
    migrate_library_database(database_path.clone()).unwrap();
    (directory, database_path)
}

#[test]
fn should_expose_current_sync_contract_version_when_bridge_loads() {
    assert_eq!(sync_contract_version(), 7);
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
fn should_report_missing_task_when_task_is_not_registered() {
    assert!(read_sync_task_progress("missing".to_owned()).is_none());
    assert!(!cancel_sync_task("missing".to_owned()));
    assert!(!release_sync_task("missing".to_owned()));
}

#[test]
fn should_run_sync_when_native_caller_has_no_tokio_runtime() {
    let (_database_directory, database_path) = create_database();
    let remote_directory = tempfile::tempdir().unwrap();

    let report = sync_library_sidecar(
        "native-task".to_owned(),
        database_path,
        "11111111-2222-4333-8444-555555555555".to_owned(),
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".to_owned(),
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
fn should_own_identity_and_schedule_when_native_bridge_uses_database() {
    let (_database_directory, database_path) = create_database();
    let identity = ensure_sync_database_identity(
        database_path.clone(),
        "11111111-2222-4333-8444-555555555555".to_owned(),
    )
    .unwrap();
    write_sync_database_schedule_state(
        database_path.clone(),
        SyncDatabaseScheduleState {
            last_successful_pull_at: Some(100),
            next_retry_at: Some(200),
            transient_failure_count: 2,
            suspended_reason: Some("network".to_owned()),
        },
    )
    .unwrap();

    mark_sync_database_schedule_succeeded(database_path.clone(), None).unwrap();

    assert_eq!(
        identity.library_uuid,
        "11111111-2222-4333-8444-555555555555"
    );
    assert_eq!(identity.replica_id.len(), 36);
    let state = read_sync_database_schedule_state(database_path)
        .unwrap()
        .unwrap();
    assert_eq!(state.last_successful_pull_at, Some(100));
    assert_eq!(state.next_retry_at, None);
    assert_eq!(state.transient_failure_count, 0);
    assert_eq!(state.suspended_reason, None);
}

#[test]
fn should_preserve_failure_stage_when_native_sync_returns_original_cause() {
    let (_database_directory, database_path) = create_database();

    let error = sync_library_sidecar(
        "failing-task".to_owned(),
        database_path,
        "11111111-2222-4333-8444-555555555555".to_owned(),
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".to_owned(),
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
