//! Command-layer integration tests for `src/commands/book.rs`.
//!
//! All four read commands resolve a `lib_path` (via `LibraryService::resolve_library_path`)
//! then defer to `BookService`. Tests assert wire-up: the same `LIBRARY_NOT_FOUND`
//! propagates uniformly, and one happy-path test per command goes through a seeded
//! minimal Calibre library.

use serde_json::{json, Value};

use my_reader_lib::models::{AppConfig, LibraryConfig, LibraryInfo};

use crate::common::app::TestApp;
use crate::common::calibre::seed_minimal_calibre_library;
use crate::common::ipc::{invoke_err, invoke_ok};

/// Build a `TestApp` whose active library points at a seeded minimal Calibre tree.
async fn app_with_seeded_library() -> (TestApp, tempfile::TempDir, i64, String) {
    let dir = tempfile::tempdir().expect("tempdir");
    let seeded = seed_minimal_calibre_library(dir.path()).await;
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            library_type: Default::default(),
            id: "lib-a".into(),
            name: "Library".into(),
            path: dir.path().to_string_lossy().to_string(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });
    (app, dir, seeded.book_id, seeded.format)
}

#[tokio::test]
async fn get_books_should_return_not_found_when_no_active_library() {
    let app = TestApp::new();

    let err = invoke_err(&app, "get_books", json!({ "libraryId": null }));

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("NO_ACTIVE_LIBRARY"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn get_books_should_return_seeded_book_when_calibre_library_has_one_entry() {
    let (app, _dir, book_id, format) = app_with_seeded_library().await;

    let books: Value = invoke_ok(&app, "get_books", json!({ "libraryId": "lib-a" }));

    let arr = books.as_array().expect("books should be an array");
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], json!(book_id));
    assert_eq!(arr[0]["formats"], json!([format]));
}

#[tokio::test]
async fn get_books_page_should_paginate_results_when_library_has_books() {
    let (app, _dir, _book_id, _format) = app_with_seeded_library().await;

    let page: Value = invoke_ok(
        &app,
        "get_books_page",
        json!({
            "libraryId": "lib-a",
            "offset": 0,
            "limit": 10,
            "sortBy": null,
            "search": null,
        }),
    );

    assert_eq!(page["total"], json!(1));
    assert_eq!(
        page["items"]
            .as_array()
            .expect("items should be an array")
            .len(),
        1
    );
}

#[tokio::test]
async fn get_book_detail_should_return_format_sizes_when_book_exists() {
    let (app, _dir, book_id, format) = app_with_seeded_library().await;

    let detail: Value = invoke_ok(
        &app,
        "get_book_detail",
        json!({ "libraryId": "lib-a", "bookId": book_id }),
    );

    // `BookDetail` flattens `BookEntry`, so `id` lives at the top level.
    assert_eq!(detail["id"], json!(book_id));
    let formats = detail["formatSizes"]
        .as_array()
        .expect("formatSizes should be an array");
    assert_eq!(formats.len(), 1);
    assert_eq!(formats[0]["format"], json!(format));
}

#[tokio::test]
async fn get_book_detail_should_return_not_found_when_book_id_is_unknown() {
    let (app, _dir, _book_id, _format) = app_with_seeded_library().await;

    let err = invoke_err(
        &app,
        "get_book_detail",
        json!({ "libraryId": "lib-a", "bookId": 9999 }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
}

#[tokio::test]
async fn get_series_books_should_return_empty_when_series_has_no_matches() {
    let (app, _dir, _book_id, _format) = app_with_seeded_library().await;

    let books: Value = invoke_ok(
        &app,
        "get_series_books",
        json!({
            "libraryId": "lib-a",
            "seriesName": "Nonexistent Series",
            "excludeBookId": null,
        }),
    );

    assert_eq!(books.as_array().expect("books should be an array").len(), 0);
}

#[tokio::test]
async fn myreader_commands_should_import_edit_favorite_and_delete_one_file() {
    let app = TestApp::new();
    let parent = tempfile::tempdir().unwrap();
    let library_root = parent.path().join("Managed");
    let source_file = parent.path().join("A Wizard of Earthsea.epub");
    std::fs::write(&source_file, b"epub fixture").unwrap();
    let library: LibraryInfo = invoke_ok(
        &app,
        "create_myreader_library",
        json!({ "path": library_root.to_string_lossy(), "name": "Managed" }),
    );

    let imported: Value = invoke_ok(
        &app,
        "import_book",
        json!({
            "libraryId": library.id,
            "sourceFilePath": source_file.to_string_lossy(),
            "title": null,
            "authors": ["Ursula K. Le Guin"],
        }),
    );
    assert_eq!(imported["queued"], json!(false));
    let book = &imported["book"];
    let book_id = book["id"].as_i64().expect("book id");
    assert_eq!(book["title"], json!("A Wizard of Earthsea"));
    assert!(book_id <= 9_007_199_254_740_991);
    let book_path = book["path"].as_str().expect("book path");
    assert!(library_root.join(book_path).join("book.epub").is_file());

    let updated: Value = invoke_ok(
        &app,
        "update_book_metadata",
        json!({
            "libraryId": library.id,
            "bookId": book_id,
            "title": "地海巫师",
            "authors": ["厄休拉·勒古恩"],
        }),
    );
    assert_eq!(updated["title"], json!("地海巫师"));
    assert_eq!(updated["authors"], json!(["厄休拉·勒古恩"]));

    let _: () = invoke_ok(
        &app,
        "add_favorite_book",
        json!({ "libraryId": library.id, "bookId": book_id }),
    );
    let favorites: Vec<i64> = invoke_ok(
        &app,
        "list_favorite_book_ids",
        json!({ "libraryId": library.id }),
    );
    assert_eq!(favorites, vec![book_id]);

    let _: () = invoke_ok(
        &app,
        "delete_book",
        json!({ "libraryId": library.id, "bookId": book_id }),
    );
    let books: Value = invoke_ok(&app, "get_books", json!({ "libraryId": library.id }));
    assert_eq!(books, json!([]));
    assert!(!library_root.join(book_path).exists());
}
