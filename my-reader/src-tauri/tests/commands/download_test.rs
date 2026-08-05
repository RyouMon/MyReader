//! Command-layer integration tests for `src/commands/download.rs`.
//!
//! The download flow is a coordination puzzle: a cancel request can arrive *before*
//! `download_book_file` has spawned its background task (see memory note
//! `download-cancellation-race-condition.md`). The pivotal regression test here
//! asserts that a pre-start cancellation is recorded and observed by a later
//! `DownloadService::start()` call — closing the race that was the root cause of
//! "close reader → background download keeps running" reports.

use serde_json::{json, Value};
use tauri::Manager;

use my_reader_lib::models::{AppConfig, LibraryConfig};
use my_reader_lib::services::download_service::DownloadService;

use crate::common::app::TestApp;
use crate::common::calibre::seed_minimal_calibre_library;
use crate::common::ipc::{invoke_err, invoke_ok};

#[tokio::test]
async fn check_book_file_state_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-a".into(),
            name: "Lib".into(),
            path: "/path".into(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let err = invoke_err(
        &app,
        "check_book_file_state",
        json!({ "libraryId": "lib-ghost", "bookId": 1, "format": "EPUB" }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("LIBRARY_NOT_FOUND"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn check_book_file_state_should_report_present_when_local_library_has_book() {
    let dir = tempfile::tempdir().expect("tempdir");
    let seeded = seed_minimal_calibre_library(dir.path()).await;
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-a".into(),
            name: "Lib".into(),
            path: dir.path().to_string_lossy().to_string(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let dto: Value = invoke_ok(
        &app,
        "check_book_file_state",
        json!({ "libraryId": "lib-a", "bookId": seeded.book_id, "format": seeded.format }),
    );

    // Local libraries never need to download — the file is already where the repo
    // expects it. `local_state` strings come from `DownloadService::check_file_state`.
    assert_eq!(dto["localState"], json!("present"));
}

#[tokio::test]
async fn check_book_file_state_should_report_downloading_when_remote_file_is_active() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-remote".into(),
            name: "Remote".into(),
            path: "/remote/library".into(),
            source_type: Some("webdav".into()),
            data_source_id: Some("ds-a".into()),
            source_path: Some("/books".into()),
        }],
        active_library_id: Some("lib-remote".into()),
        ..Default::default()
    });
    let root = app.app_data_dir().join("libraries").join("lib-remote");
    tokio::fs::create_dir_all(&root)
        .await
        .expect("create remote library container");
    let seeded = seed_minimal_calibre_library(&root).await;
    tokio::fs::remove_file(&seeded.file_path)
        .await
        .expect("remote cache file should be absent");

    let service = app.app.state::<DownloadService>();
    let _rx = service
        .start("lib-remote", seeded.book_id, &seeded.format)
        .expect("download should be active");

    let dto: Value = invoke_ok(
        &app,
        "check_book_file_state",
        json!({ "libraryId": "lib-remote", "bookId": seeded.book_id, "format": seeded.format }),
    );

    assert_eq!(dto["localState"], json!("downloading"));
    service.finish("lib-remote", seeded.book_id, &seeded.format);
}

#[tokio::test]
async fn check_book_file_states_should_report_present_when_local_library_has_book() {
    let dir = tempfile::tempdir().expect("tempdir");
    let seeded = seed_minimal_calibre_library(dir.path()).await;
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-a".into(),
            name: "Lib".into(),
            path: dir.path().to_string_lossy().to_string(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let rows: Value = invoke_ok(
        &app,
        "check_book_file_states",
        json!({
            "libraryId": "lib-a",
            "requests": [{ "bookId": seeded.book_id, "format": seeded.format }]
        }),
    );

    assert_eq!(rows[0]["bookId"], json!(seeded.book_id));
    assert_eq!(rows[0]["format"], json!("EPUB"));
    assert_eq!(rows[0]["localState"], json!("present"));
}

#[tokio::test]
async fn check_book_file_states_should_report_downloading_when_remote_file_is_active() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-remote".into(),
            name: "Remote".into(),
            path: "/remote/library".into(),
            source_type: Some("webdav".into()),
            data_source_id: Some("ds-a".into()),
            source_path: Some("/books".into()),
        }],
        active_library_id: Some("lib-remote".into()),
        ..Default::default()
    });
    let root = app.app_data_dir().join("libraries").join("lib-remote");
    tokio::fs::create_dir_all(&root)
        .await
        .expect("create remote library container");
    let seeded = seed_minimal_calibre_library(&root).await;
    tokio::fs::remove_file(&seeded.file_path)
        .await
        .expect("remote cache file should be absent");

    let service = app.app.state::<DownloadService>();
    let _rx = service
        .start("lib-remote", seeded.book_id, &seeded.format)
        .expect("download should be active");

    let rows: Value = invoke_ok(
        &app,
        "check_book_file_states",
        json!({
            "libraryId": "lib-remote",
            "requests": [{ "bookId": seeded.book_id, "format": seeded.format }]
        }),
    );

    assert_eq!(rows[0]["localState"], json!("downloading"));
    service.finish("lib-remote", seeded.book_id, &seeded.format);
}

#[tokio::test]
async fn delete_local_book_file_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "delete_local_book_file",
        json!({ "libraryId": "lib-ghost", "bookId": 1, "format": "EPUB" }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
}

#[tokio::test]
async fn delete_local_book_file_should_reject_local_library() {
    let dir = tempfile::tempdir().expect("tempdir");
    let seeded = seed_minimal_calibre_library(dir.path()).await;
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-local".into(),
            name: "Local".into(),
            path: dir.path().to_string_lossy().to_string(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("lib-local".into()),
        ..Default::default()
    });

    let err = invoke_err(
        &app,
        "delete_local_book_file",
        json!({ "libraryId": "lib-local", "bookId": seeded.book_id, "format": seeded.format }),
    );

    assert!(err.is_kind("Config"), "kind was {}", err.kind);
    assert!(
        err.message
            .contains("LOCAL_LIBRARY_FILE_ACTION_NOT_ALLOWED"),
        "message was {}",
        err.message
    );
    assert!(
        seeded.file_path.exists(),
        "local Calibre source file must not be deleted"
    );
}

#[tokio::test]
async fn download_book_file_should_reject_local_library() {
    let dir = tempfile::tempdir().expect("tempdir");
    let seeded = seed_minimal_calibre_library(dir.path()).await;
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-local".into(),
            name: "Local".into(),
            path: dir.path().to_string_lossy().to_string(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("lib-local".into()),
        ..Default::default()
    });

    let err = invoke_err(
        &app,
        "download_book_file",
        json!({ "libraryId": "lib-local", "bookId": seeded.book_id, "format": seeded.format }),
    );

    assert!(err.is_kind("Config"), "kind was {}", err.kind);
    assert!(
        err.message
            .contains("LOCAL_LIBRARY_FILE_ACTION_NOT_ALLOWED"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn cancel_book_download_should_return_true_when_no_download_is_in_flight() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-a".into(),
            name: "Remote".into(),
            path: "/app-data/libraries/lib-a".into(),
            source_type: Some("webdav".into()),
            data_source_id: Some("ds-a".into()),
            source_path: Some("/books".into()),
        }],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    // No download was ever started. Cancel must still return `true` to record a
    // pending cancellation — otherwise the next `download_book_file` call would
    // race past the cancel and run to completion.
    let cancelled: bool = invoke_ok(
        &app,
        "cancel_book_download",
        json!({ "libraryId": "lib-a", "bookId": 1, "format": "EPUB" }),
    );

    assert!(
        cancelled,
        "pre-start cancel must register a pending cancellation"
    );
}

#[tokio::test]
async fn cancel_then_start_should_signal_receiver_before_download_runs() {
    // The regression case from `download-cancellation-race-condition.md`:
    // the reader window emits `cancel_book_download` on unmount, but the user may
    // close the window before the spawned download task has had a chance to register
    // itself with `DownloadService::start`. The pre-start cancel must be recorded
    // and replayed into the next `start()` call.
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-a".into(),
            name: "Remote".into(),
            path: "/app-data/libraries/lib-a".into(),
            source_type: Some("webdav".into()),
            data_source_id: Some("ds-a".into()),
            source_path: Some("/books".into()),
        }],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let _: bool = invoke_ok(
        &app,
        "cancel_book_download",
        json!({ "libraryId": "lib-a", "bookId": 42, "format": "EPUB" }),
    );

    // Now simulate `download_book_file` reaching `service.start(...)` — must observe
    // the pre-start cancellation immediately, not silently lose it.
    let service = app.app.state::<DownloadService>();
    let cancellation = service
        .start("lib-a", 42, "EPUB")
        .expect("start should register a fresh download");
    assert!(
        cancellation.is_cancelled(),
        "pre-start cancel must signal the task before it does any work",
    );

    // Clean up so the global download key isn't held by a borrowed receiver.
    service.finish("lib-a", 42, "EPUB");
}

#[tokio::test]
async fn cancel_book_download_should_reject_local_library() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-local".into(),
            name: "Local".into(),
            path: "/books".into(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("lib-local".into()),
        ..Default::default()
    });

    let err = invoke_err(
        &app,
        "cancel_book_download",
        json!({ "libraryId": "lib-local", "bookId": 1, "format": "EPUB" }),
    );

    assert!(err.is_kind("Config"), "kind was {}", err.kind);
    assert!(
        err.message
            .contains("LOCAL_LIBRARY_FILE_ACTION_NOT_ALLOWED"),
        "message was {}",
        err.message
    );
}
