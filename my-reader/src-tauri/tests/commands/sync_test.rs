//! Command-layer integration tests for `src/commands/sync.rs`.

use serde_json::json;

use my_reader_lib::models::{AppConfig, LibraryConfig};

use crate::common::app::TestApp;
use crate::common::calibre::create_calibre_db;
use crate::common::ipc::{invoke_err, invoke_ok};

fn library_fixture(id: &str, path: &str) -> LibraryConfig {
    LibraryConfig {
        library_type: Default::default(),
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
    // A fresh sidecar publishes its canonical library identity before pulling.
    let calibre_dir = tempfile::tempdir().expect("tempdir");
    create_calibre_db(calibre_dir.path()).await;
    let path_str = calibre_dir.path().to_string_lossy().to_string();
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a", &path_str)],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let report: DbSyncReportView =
        invoke_ok(&app, "sync_db_for_library", json!({ "libraryId": "lib-a" }));

    assert_eq!(report.pushed, 1);
    assert_eq!(report.pulled, 0);
}
