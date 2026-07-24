//! Command-layer integration tests for `src/commands/favorite.rs`.
//!
//! Covers the three favorite commands end-to-end through the Tauri mock runtime,
//! including library resolution, empty-state behavior, and round-trip add/list/remove.

use serde_json::json;
use tauri::Manager;

use my_reader_lib::models::{AppConfig, LibraryConfig};
use my_reader_lib::repositories::favorite_book_repo::SqliteFavoriteBookRepository;
use my_reader_lib::sync::kernel::ensure_replica_identity;

use crate::common::app::TestApp;
use crate::common::ipc::{invoke_err, invoke_ok};

const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";

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

async fn seed_replica_identity(app: &TestApp, library_id: &str) {
    let sidecar_root = app
        .app
        .path()
        .app_data_dir()
        .unwrap()
        .join("libraries")
        .join(library_id)
        .to_string_lossy()
        .to_string();
    let db = SqliteFavoriteBookRepository::open(&sidecar_root)
        .await
        .unwrap();
    ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
}

#[tokio::test]
async fn list_favorite_book_ids_should_return_not_found_when_no_active_library() {
    let app = TestApp::new();

    let err = invoke_err(&app, "list_favorite_book_ids", json!({ "libraryId": null }));

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("NO_ACTIVE_LIBRARY"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn list_favorite_book_ids_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "list_favorite_book_ids",
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
async fn list_favorite_book_ids_should_return_empty_when_no_favorites_exist() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let ids: Vec<i64> = invoke_ok(
        &app,
        "list_favorite_book_ids",
        json!({ "libraryId": "lib-a" }),
    );

    assert!(ids.is_empty());
}

#[tokio::test]
async fn add_and_list_favorite_books_should_round_trip_book_ids() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });
    seed_replica_identity(&app, "lib-a").await;

    let _: () = invoke_ok(
        &app,
        "add_favorite_book",
        json!({ "libraryId": "lib-a", "bookId": 7 }),
    );
    let _: () = invoke_ok(
        &app,
        "add_favorite_book",
        json!({ "libraryId": "lib-a", "bookId": 42 }),
    );

    let ids: Vec<i64> = invoke_ok(
        &app,
        "list_favorite_book_ids",
        json!({ "libraryId": "lib-a" }),
    );

    assert_eq!(ids, vec![7, 42]);
}

#[tokio::test]
async fn add_favorite_book_should_be_idempotent_when_book_already_favorited() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });
    seed_replica_identity(&app, "lib-a").await;

    let _: () = invoke_ok(
        &app,
        "add_favorite_book",
        json!({ "libraryId": "lib-a", "bookId": 7 }),
    );
    let _: () = invoke_ok(
        &app,
        "add_favorite_book",
        json!({ "libraryId": "lib-a", "bookId": 7 }),
    );

    let ids: Vec<i64> = invoke_ok(
        &app,
        "list_favorite_book_ids",
        json!({ "libraryId": "lib-a" }),
    );

    assert_eq!(ids, vec![7]);
}

#[tokio::test]
async fn remove_favorite_book_should_delete_record_and_be_idempotent() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });
    seed_replica_identity(&app, "lib-a").await;

    let _: () = invoke_ok(
        &app,
        "add_favorite_book",
        json!({ "libraryId": "lib-a", "bookId": 7 }),
    );
    let _: () = invoke_ok(
        &app,
        "remove_favorite_book",
        json!({ "libraryId": "lib-a", "bookId": 7 }),
    );
    let _: () = invoke_ok(
        &app,
        "remove_favorite_book",
        json!({ "libraryId": "lib-a", "bookId": 7 }),
    );

    let ids: Vec<i64> = invoke_ok(
        &app,
        "list_favorite_book_ids",
        json!({ "libraryId": "lib-a" }),
    );

    assert!(ids.is_empty());
}

#[tokio::test]
async fn favorite_book_commands_should_resolve_active_library_when_id_is_none() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });
    seed_replica_identity(&app, "lib-a").await;

    let _: () = invoke_ok(
        &app,
        "add_favorite_book",
        json!({ "libraryId": null, "bookId": 7 }),
    );
    let ids: Vec<i64> = invoke_ok(&app, "list_favorite_book_ids", json!({ "libraryId": null }));
    let _: () = invoke_ok(
        &app,
        "remove_favorite_book",
        json!({ "libraryId": null, "bookId": 7 }),
    );

    assert_eq!(ids, vec![7]);
}

#[tokio::test]
async fn add_favorite_book_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "add_favorite_book",
        json!({ "libraryId": "lib-ghost", "bookId": 7 }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("LIBRARY_NOT_FOUND"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn remove_favorite_book_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "remove_favorite_book",
        json!({ "libraryId": "lib-ghost", "bookId": 7 }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("LIBRARY_NOT_FOUND"),
        "message was {}",
        err.message
    );
}
