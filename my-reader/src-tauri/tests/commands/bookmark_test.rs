use serde_json::{json, Value};

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
struct BookmarkView {
    id: String,
    library_id: String,
    book_id: i64,
    format: String,
    locator_key: String,
    locator: Value,
    created_at: f64,
    updated_at: f64,
}

#[tokio::test]
async fn add_list_delete_should_round_trip_bookmark_when_commands_are_invoked() {
    let library_root = tempfile::tempdir().unwrap();
    create_calibre_db(library_root.path()).await;
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture(
            "lib-a",
            library_root.path().to_str().unwrap(),
        )],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });
    let locator = json!({
        "href": "OEBPS/chapter.xhtml",
        "type": "application/xhtml+xml",
        "locations": {"progression": 0.35},
        "text": {"highlight": "bookmark"}
    });

    let added: BookmarkView = invoke_ok(
        &app,
        "add_reader_bookmark",
        json!({
            "libraryId": "lib-a",
            "bookId": 4,
            "format": "epub",
            "locatorKey": "chapter.xhtml@0.35",
            "locator": locator,
        }),
    );
    assert!(!added.id.is_empty());
    assert_eq!(added.library_id, "lib-a");
    assert_eq!(added.book_id, 4);
    assert_eq!(added.format, "EPUB");
    assert_eq!(added.locator_key, "chapter.xhtml@0.35");
    assert_eq!(added.locator, locator);
    assert!(added.created_at > 0.0);
    assert!(added.updated_at >= added.created_at);

    let rows: Vec<BookmarkView> = invoke_ok(
        &app,
        "list_reader_bookmarks",
        json!({"libraryId": "lib-a", "bookId": 4, "format": "EPUB"}),
    );
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].locator, locator);

    let _: () = invoke_ok(
        &app,
        "delete_reader_bookmark",
        json!({
            "libraryId": "lib-a",
            "bookId": 4,
            "format": "EPUB",
            "locatorKey": "chapter.xhtml@0.35"
        }),
    );
    let rows: Vec<BookmarkView> = invoke_ok(
        &app,
        "list_reader_bookmarks",
        json!({"libraryId": "lib-a", "bookId": 4, "format": "EPUB"}),
    );
    assert!(rows.is_empty());
}

#[tokio::test]
async fn add_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let error = invoke_err(
        &app,
        "add_reader_bookmark",
        json!({
            "libraryId": "ghost",
            "bookId": 1,
            "format": "EPUB",
            "locatorKey": "chapter",
            "locator": {"href": "chapter.xhtml", "type": "application/xhtml+xml"}
        }),
    );

    assert!(error.is_kind("NotFound"));
    assert!(error.message.contains("LIBRARY_NOT_FOUND"));
}
