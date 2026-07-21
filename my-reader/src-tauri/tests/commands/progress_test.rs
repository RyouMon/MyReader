//! Command-layer integration tests for `src/commands/progress.rs`.

use serde_json::{json, Value};

use my_reader_lib::models::{AppConfig, LibraryConfig};

use crate::common::app::TestApp;
use crate::common::ipc::{invoke_err, invoke_ok};

fn library_fixture(id: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.into(),
        name: "Library".into(),
        path: "/path".into(),
        source_type: Some("local".into()),
        data_source_id: None,
        source_path: None,
    }
}

// `ReadingProgressDto` is `Serialize`-only on the Rust side. Read it via JSON shape.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProgressView {
    library_id: String,
    book_id: i64,
    format: String,
    locator: Value,
    display_progression: Option<f64>,
    updated_at: f64,
}

#[tokio::test]
async fn get_reading_progress_should_return_not_found_when_no_active_library() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "get_reading_progress",
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
async fn get_reading_progress_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "get_reading_progress",
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
async fn get_reading_progress_should_return_none_when_no_progress_recorded_for_book() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let result: Option<ProgressView> = invoke_ok(
        &app,
        "get_reading_progress",
        json!({ "libraryId": "lib-a", "bookId": 42, "format": "EPUB" }),
    );

    assert!(result.is_none());
}

#[tokio::test]
async fn set_then_get_reading_progress_should_round_trip_locator_and_metadata() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let locator = json!({ "href": "/chapter1.xhtml", "type": "application/xhtml+xml" });

    let _: () = invoke_ok(
        &app,
        "set_reading_progress",
        json!({
            "libraryId": "lib-a",
            "bookId": 7,
            "format": "EPUB",
            "locator": locator,
            "displayProgression": 1.0 / 3.0,
        }),
    );

    let progress: Option<ProgressView> = invoke_ok(
        &app,
        "get_reading_progress",
        json!({ "libraryId": "lib-a", "bookId": 7, "format": "EPUB" }),
    );

    let progress = progress.expect("progress should be present after set");
    assert_eq!(progress.library_id, "lib-a");
    assert_eq!(progress.book_id, 7);
    assert_eq!(progress.format, "EPUB");
    assert_eq!(progress.locator, locator);
    assert_eq!(progress.display_progression, Some(1.0 / 3.0));
    assert!(progress.updated_at > 0.0);
}

#[tokio::test]
async fn list_reading_progress_should_return_saved_rows() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let first = json!({ "href": "/chapter1.xhtml", "type": "application/xhtml+xml" });
    let second = json!({ "href": "/page-2", "type": "application/pdf" });

    let _: () = invoke_ok(
        &app,
        "set_reading_progress",
        json!({
            "libraryId": "lib-a",
            "bookId": 7,
            "format": "EPUB",
            "locator": first,
        }),
    );
    let _: () = invoke_ok(
        &app,
        "set_reading_progress",
        json!({
            "libraryId": "lib-a",
            "bookId": 8,
            "format": "PDF",
            "locator": second,
        }),
    );

    let rows: Vec<ProgressView> = invoke_ok(
        &app,
        "list_reading_progress",
        json!({ "libraryId": "lib-a" }),
    );

    assert_eq!(rows.len(), 2);
    assert!(rows
        .iter()
        .any(|row| row.book_id == 7 && row.locator == first));
    assert!(rows
        .iter()
        .any(|row| row.book_id == 8 && row.locator == second));
}
