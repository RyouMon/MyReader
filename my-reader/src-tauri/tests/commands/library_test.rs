//! Command-layer integration tests for `src/commands/library.rs`.
//!
//! Tests exercise commands through the IPC boundary (`tauri::test::get_ipc_response`).
//! No mocking of `LibraryService` — services run for real against tempdir-rooted state.
//! See `tests/integration.rs` for the privacy / scope policy.

use serde_json::json;
use std::fs;

use my_reader_lib::models::{
    AppConfig, DataSourceConfig, DataSourceDetail, LibraryConfig, LibraryInfo,
};

use crate::common::app::TestApp;
use crate::common::config::read_persisted_config;
use crate::common::ipc::{invoke_err, invoke_ok};

fn library_fixture(id: &str, name: &str, path: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.into(),
        name: name.into(),
        path: path.into(),
        source_type: Some("local".into()),
        data_source_id: None,
        source_path: None,
    }
}

/// Build a minimal directory that passes `CalibreBookRepository::validate_library`
/// (an empty `metadata.db` file is enough — open failures fall back to book_count=0).
fn minimal_calibre_dir() -> tempfile::TempDir {
    let dir = tempfile::tempdir().expect("tempdir");
    fs::write(dir.path().join("metadata.db"), b"").expect("write metadata.db");
    dir
}

#[tokio::test]
async fn list_libraries_should_return_empty_when_config_has_no_libraries() {
    let app = TestApp::new();

    let result: Vec<LibraryInfo> = invoke_ok(&app, "list_libraries", json!({}));

    assert!(result.is_empty());
}

#[tokio::test]
async fn list_libraries_should_return_seeded_libraries_with_zero_book_count_when_no_metadata_db() {
    let config = AppConfig {
        libraries: vec![
            library_fixture("lib-a", "Library A", "/nonexistent/path/a"),
            library_fixture("lib-b", "Library B", "/nonexistent/path/b"),
        ],
        ..Default::default()
    };
    let app = TestApp::with_config(config);

    let result: Vec<LibraryInfo> = invoke_ok(&app, "list_libraries", json!({}));

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].id, "lib-a");
    assert_eq!(result[0].name, "Library A");
    assert_eq!(result[0].book_count, 0); // no metadata.db at the fixture path
    assert_eq!(result[1].id, "lib-b");
}

#[tokio::test]
async fn get_active_library_id_should_return_none_when_no_library_active() {
    let app = TestApp::new();

    let result: Option<String> = invoke_ok(&app, "get_active_library_id", json!({}));

    assert_eq!(result, None);
}

#[tokio::test]
async fn get_active_library_id_should_return_the_id_when_one_is_active() {
    let config = AppConfig {
        libraries: vec![library_fixture("lib-a", "Library A", "/path/a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    };
    let app = TestApp::with_config(config);

    let result: Option<String> = invoke_ok(&app, "get_active_library_id", json!({}));

    assert_eq!(result, Some("lib-a".into()));
}

#[tokio::test]
async fn switch_library_should_update_active_id_and_persist_when_library_exists() {
    let config = AppConfig {
        libraries: vec![
            library_fixture("lib-a", "Library A", "/path/a"),
            library_fixture("lib-b", "Library B", "/path/b"),
        ],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    };
    let app = TestApp::with_config(config);

    let _: () = invoke_ok(&app, "switch_library", json!({ "id": "lib-b" }));

    // In-memory state updated.
    assert_eq!(
        app.config_snapshot().active_library_id,
        Some("lib-b".into())
    );
    // Persisted to disk.
    let persisted = read_persisted_config(&app).expect("config.json should be written");
    assert_eq!(persisted.active_library_id, Some("lib-b".into()));
}

#[tokio::test]
async fn switch_library_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a", "Library A", "/path/a")],
        ..Default::default()
    });

    let err = invoke_err(&app, "switch_library", json!({ "id": "lib-missing" }));

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("LIBRARY_NOT_FOUND"),
        "message was {}",
        err.message
    );
    // No on-disk write should have happened on the error path.
    assert!(read_persisted_config(&app).is_none());
}

#[tokio::test]
async fn remove_library_should_drop_entry_and_rollover_active_id() {
    let config = AppConfig {
        libraries: vec![
            library_fixture("lib-a", "Library A", "/path/a"),
            library_fixture("lib-b", "Library B", "/path/b"),
        ],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    };
    let app = TestApp::with_config(config);

    let _: () = invoke_ok(&app, "remove_library", json!({ "id": "lib-a" }));

    let snapshot = app.config_snapshot();
    assert_eq!(snapshot.libraries.len(), 1);
    assert_eq!(snapshot.libraries[0].id, "lib-b");
    // Active id rolls over to the first remaining library.
    assert_eq!(snapshot.active_library_id, Some("lib-b".into()));

    let persisted = read_persisted_config(&app).expect("config.json should be written");
    assert_eq!(persisted.libraries.len(), 1);
    assert_eq!(persisted.active_library_id, Some("lib-b".into()));
}

#[tokio::test]
async fn remove_library_should_clear_active_id_when_last_library_removed() {
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a", "Library A", "/path/a")],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let _: () = invoke_ok(&app, "remove_library", json!({ "id": "lib-a" }));

    assert_eq!(app.config_snapshot().active_library_id, None);
}

#[tokio::test]
async fn add_library_should_return_config_error_when_path_does_not_exist() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "add_library",
        json!({ "path": "/nonexistent/calibre/library", "name": null }),
    );

    assert!(err.is_kind("Config"), "kind was {}", err.kind);
    assert!(
        err.message.contains("INVALID_LIBRARY_PATH"),
        "message was {}",
        err.message
    );
    // No state mutation on the error path.
    assert!(app.config_snapshot().libraries.is_empty());
}

#[tokio::test]
async fn add_library_should_register_and_persist_when_calibre_dir_is_valid() {
    let app = TestApp::new();
    let calibre_dir = minimal_calibre_dir();

    let info: LibraryInfo = invoke_ok(
        &app,
        "add_library",
        json!({ "path": calibre_dir.path().to_string_lossy(), "name": "Fixture Library" }),
    );

    assert_eq!(info.name, "Fixture Library");
    assert_eq!(info.book_count, 0); // metadata.db is empty so open() falls back to 0
    assert_eq!(info.source_type, Some("local".into()));

    // First library added becomes active.
    let snapshot = app.config_snapshot();
    assert_eq!(snapshot.libraries.len(), 1);
    assert_eq!(snapshot.active_library_id, Some(info.id.clone()));

    // Persisted to disk under the same id.
    let persisted = read_persisted_config(&app).expect("config.json should be written");
    assert_eq!(persisted.libraries.len(), 1);
    assert_eq!(persisted.libraries[0].id, info.id);
}

#[tokio::test]
async fn remove_library_should_be_idempotent_when_library_id_is_unknown() {
    // `LibraryService::remove_library` uses `Vec::retain`, which is naturally idempotent:
    // removing a non-existent id returns Ok and leaves the library list unchanged. This
    // is intentional and pins the behavior against a future "tighten to NotFound" refactor.
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a", "Library A", "/path/a")],
        ..Default::default()
    });

    let _: () = invoke_ok(&app, "remove_library", json!({ "id": "lib-missing" }));

    assert_eq!(app.config_snapshot().libraries.len(), 1);
}

#[tokio::test]
async fn refresh_library_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(&app, "refresh_library", json!({ "id": "lib-ghost" }));

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("LIBRARY_NOT_FOUND"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn refresh_library_should_return_database_error_when_metadata_db_is_corrupt() {
    // Empty metadata.db passes `validate_library` (file existence check) but fails the
    // schema lookup inside `repo.get_all_books`. The happy-path test that exercises a
    // real Calibre fixture lands in Phase B once `create_minimal_calibre_library` is
    // promoted to `tests/common/calibre.rs`.
    let calibre_dir = minimal_calibre_dir();
    let path_str = calibre_dir.path().to_string_lossy().to_string();
    let app = TestApp::with_config(AppConfig {
        libraries: vec![library_fixture("lib-a", "Library A", &path_str)],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    });

    let err = invoke_err(&app, "refresh_library", json!({ "id": "lib-a" }));

    assert!(err.is_kind("Database"), "kind was {}", err.kind);
}

#[tokio::test]
async fn add_webdav_library_should_return_not_found_when_data_source_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "add_webdav_library",
        json!({
            "dataSourceId": "ds-missing",
            "remotePath": "/Books",
            "name": null,
        }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("DATASOURCE_NOT_FOUND"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn add_onedrive_library_should_return_not_found_when_data_source_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "add_onedrive_library",
        json!({
            "dataSourceId": "ds-missing",
            "remotePath": "/Books",
            "name": null,
        }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("DATASOURCE_NOT_FOUND"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn refresh_webdav_library_should_return_not_found_when_library_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(&app, "refresh_webdav_library", json!({ "id": "lib-ghost" }));

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("LIBRARY_NOT_FOUND"),
        "message was {}",
        err.message
    );
}

#[tokio::test]
async fn refresh_onedrive_library_should_return_not_found_when_library_id_is_unknown() {
    // Seed a fake WebDAV data source so the library lookup runs before the source lookup.
    let app = TestApp::with_config(AppConfig {
        data_sources: vec![DataSourceConfig {
            id: "ds-1".into(),
            name: "Fake".into(),
            enabled: true,
            detail: DataSourceDetail::Onedrive {
                client_id: "client".into(),
                tenant_id: "consumers".into(),
                credential_account: None,
                root_path: None,
                user_name: None,
                user_email: None,
            },
        }],
        ..Default::default()
    });

    let err = invoke_err(
        &app,
        "refresh_onedrive_library",
        json!({ "id": "lib-ghost" }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
    assert!(
        err.message.contains("LIBRARY_NOT_FOUND"),
        "message was {}",
        err.message
    );
}
