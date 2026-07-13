//! Command-layer integration tests for `src/commands/reader.rs`.

use serde_json::{json, Value};

use my_reader_lib::models::{AppConfig, LibraryConfig};

use crate::common::app::TestApp;
use crate::common::ipc::{invoke_err, invoke_ok};

#[tokio::test]
async fn get_reader_ui_preferences_should_return_defaults_when_config_is_fresh() {
    let app = TestApp::new();

    let prefs: Value = invoke_ok(&app, "get_reader_ui_preferences", json!({}));

    // Defaults set by ReaderUiPreferences::default() — pinned here so a future bump
    // of the default version / values is a deliberate change.
    assert_eq!(prefs["version"], json!(7));
    assert_eq!(prefs["appTheme"], json!("system"));
    assert_eq!(prefs["appLanguage"], json!("system"));
    assert_eq!(prefs["libraryViewMode"], json!("grid"));
    assert_eq!(prefs["detailFullScreen"], json!(false));
}

#[tokio::test]
async fn set_then_get_reader_ui_preferences_should_round_trip_custom_values() {
    let app = TestApp::new();
    let custom = json!({
        "version": 7,
        "appTheme": "dark",
        "appLanguage": "en",
        "libraryViewMode": "list",
        "detailFullScreen": true,
        "fixedLayout": {},
        "reflowable": {},
    });

    let _: () = invoke_ok(
        &app,
        "set_reader_ui_preferences",
        json!({ "preferences": custom }),
    );

    let prefs: Value = invoke_ok(&app, "get_reader_ui_preferences", json!({}));
    assert_eq!(prefs["appTheme"], json!("dark"));
    assert_eq!(prefs["appLanguage"], json!("en"));
    assert_eq!(prefs["libraryViewMode"], json!("list"));
    assert_eq!(prefs["detailFullScreen"], json!(true));
}

#[tokio::test]
async fn prepare_book_source_should_return_not_found_when_no_active_library() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "prepare_book_source",
        json!({ "libraryId": null, "bookId": 1, "format": "EPUB" }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("NO_ACTIVE_LIBRARY"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn prepare_book_source_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
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
        "prepare_book_source",
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
async fn close_book_streamer_should_be_idempotent_when_no_session_exists() {
    let app = TestApp::new();

    // No session was opened — closing must still return Ok (idempotent close lets the
    // frontend always invoke close on unmount without coordinating with prepare state).
    let _: () = invoke_ok(
        &app,
        "close_book_streamer",
        json!({ "libraryId": "lib-a", "bookId": 7 }),
    );
}

#[tokio::test]
async fn write_epub_readium_manifest_should_block_when_dir_is_outside_reader_cache() {
    let app = TestApp::new();
    let outside = tempfile::tempdir().expect("tempdir");

    let err = invoke_err(
        &app,
        "write_epub_readium_manifest",
        json!({
            "dirPath": outside.path().to_string_lossy(),
            "manifest": { "title": "x" },
        }),
    );

    assert!(err.is_kind("Config"), "kind was {}", err.kind);
    assert!(
        err.message.contains("PATH_TRAVERSAL_BLOCKED"),
        "message was {}",
        err.message
    );
}
