use myreader_rust_components::{
    cancel_sync_task, ensure_sync_database_identity, mark_sync_database_schedule_succeeded,
    read_sync_database_schedule_state, read_sync_task_progress, release_sync_task,
    sync_contract_version, sync_library_sidecar, write_sync_database_schedule_state,
    SyncDatabaseScheduleState,
};
use rusqlite::Connection;

fn create_database() -> (tempfile::TempDir, String) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("myreader.db");
    let connection = Connection::open(&path).unwrap();
    for migration in [
        include_str!("../../../packages/db/drizzle/0000_initial.sql"),
        include_str!("../../../packages/db/drizzle/0001_add_book_reading_format.sql"),
        include_str!("../../../packages/db/drizzle/0002_add_favorite_books.sql"),
        include_str!("../../../packages/db/drizzle/0003_add_book_cover_thumbnail_cache.sql"),
        include_str!("../../../packages/db/drizzle/0004_add_bookmarks.sql"),
        include_str!("../../../packages/db/drizzle/0005_add_annotations.sql"),
        include_str!(
            "../../../packages/db/drizzle/0006_add_reading_progress_display_progression.sql"
        ),
        include_str!("../../../packages/db/drizzle/0007_add_reading_statistics.sql"),
        include_str!("../../../packages/db/drizzle/0008_add_library_sidecar_sync_kernel.sql"),
        include_str!("../../../packages/db/drizzle/0009_add_reading_progress_sync_clock.sql"),
        include_str!("../../../packages/db/drizzle/0010_add_favorite_sync_projection.sql"),
        include_str!("../../../packages/db/drizzle/0011_add_bookmark_sync_projection.sql"),
        include_str!("../../../packages/db/drizzle/0012_add_automerge_sync_storage.sql"),
        include_str!(
            "../../../packages/db/drizzle/0013_add_reading_position_conflict_projection.sql"
        ),
        include_str!("../../../packages/db/drizzle/0014_remove_legacy_sidecar_sync.sql"),
        include_str!("../../../packages/db/drizzle/0015_remove_hlc_projection_columns.sql"),
        include_str!("../../../packages/db/drizzle/0016_discard_legacy_sync_state.sql"),
        include_str!("../../../packages/db/drizzle/0017_square_toro.sql"),
    ] {
        connection.execute_batch(migration).unwrap();
    }
    (directory, path.to_string_lossy().into_owned())
}

#[test]
fn should_expose_current_sync_contract_version_when_bridge_loads() {
    assert_eq!(sync_contract_version(), 7);
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
