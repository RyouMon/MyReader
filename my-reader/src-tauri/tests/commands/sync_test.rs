//! Command-layer integration tests for `src/commands/sync.rs`.

use serde_json::json;

use my_reader_lib::models::{AppConfig, LibraryConfig};

use crate::common::app::TestApp;
use crate::common::ipc::{invoke_err, invoke_ok};

fn library_fixture(id: &str, path: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.into(),
        name: "Library".into(),
        path: path.into(),
        source_type: Some("local".into()),
        data_source_id: None,
        source_path: None,
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbSyncReportView {
    pushed: u64,
    pulled: u64,
}

#[tokio::test]
async fn sync_db_for_library_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "sync_db_for_library",
        json!({ "libraryId": "lib-ghost" }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("LIBRARY_NOT_FOUND"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn sync_db_for_library_should_return_report_when_local_library_has_no_remote_state() {
    // Local library, sidecar opens an empty sqlite DB, push/pull no-ops → report with 0/0.
    let calibre_dir = tempfile::tempdir().expect("tempdir");
    let path_str = calibre_dir.path().to_string_lossy().to_string();
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a", &path_str)],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let report: DbSyncReportView =
        invoke_ok(&app, "sync_db_for_library", json!({ "libraryId": "lib-a" }));

    assert_eq!(report.pushed, 0);
    assert_eq!(report.pulled, 0);
}
