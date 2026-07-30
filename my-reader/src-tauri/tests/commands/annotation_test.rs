use serde_json::{json, Value};

use my_reader_lib::models::{AppConfig, LibraryConfig};

use crate::common::app::TestApp;
use crate::common::calibre::create_calibre_db;
use crate::common::ipc::invoke_ok;

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
struct AnnotationView {
    id: String,
    library_id: String,
    book_id: i64,
    format: String,
    kind: String,
    locator: Value,
    color: String,
    note: Option<String>,
}

#[tokio::test]
async fn should_round_trip_highlight_when_annotation_commands_are_invoked() {
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
        "text": {"highlight": "Selected text"}
    });

    let added: AnnotationView = invoke_ok(
        &app,
        "add_reader_annotation",
        json!({
            "libraryId": "lib-a",
            "bookId": 4,
            "format": "epub",
            "locator": locator,
            "color": "yellow",
            "note": " Initial note ",
        }),
    );
    assert_eq!(added.library_id, "lib-a");
    assert_eq!(added.book_id, 4);
    assert_eq!(added.format, "EPUB");
    assert_eq!(added.kind, "highlight");
    assert_eq!(added.locator, locator);
    assert_eq!(added.note.as_deref(), Some("Initial note"));

    let updated: AnnotationView = invoke_ok(
        &app,
        "update_reader_annotation",
        json!({
            "libraryId": "lib-a",
            "bookId": 4,
            "format": "EPUB",
            "id": added.id,
            "color": "green",
            "note": "Updated",
        }),
    );
    assert_eq!(updated.color, "green");
    assert_eq!(updated.note.as_deref(), Some("Updated"));
    assert_eq!(updated.locator, locator);

    let _: () = invoke_ok(
        &app,
        "delete_reader_annotation",
        json!({
            "libraryId": "lib-a",
            "bookId": 4,
            "format": "EPUB",
            "id": updated.id,
        }),
    );
    let rows: Vec<AnnotationView> = invoke_ok(
        &app,
        "list_reader_annotations",
        json!({"libraryId": "lib-a", "bookId": 4, "format": "EPUB"}),
    );
    assert!(rows.is_empty());
}
