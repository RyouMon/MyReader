//! Command-layer integration tests for `src/commands/source.rs`.
//!
//! Tests cover the simple cases (list / add-local / remove) end-to-end through IPC.
//! WebDAV/OneDrive flows that need a network mock are intentionally only error-path
//! tested here — happy-path coverage for those lives in the inline `datasource_service`
//! tests where the `warp` mock + Graph client harness is already wired up.

use serde_json::{json, Value};

use my_reader_lib::models::{AppConfig, DataSourceConfig, DataSourceDetail};

use crate::common::app::TestApp;
use crate::common::config::read_persisted_config;
use crate::common::ipc::{invoke_err, invoke_ok};

#[tokio::test]
async fn list_data_sources_should_return_empty_when_config_has_none() {
    let app = TestApp::new();

    let sources: Value = invoke_ok(&app, "list_data_sources", json!({}));

    assert_eq!(
        sources.as_array().expect("sources should be array").len(),
        0
    );
}

#[tokio::test]
async fn list_data_sources_should_return_seeded_sources_when_config_has_entries() {
    let app = TestApp::with_config(AppConfig {
        data_sources: vec![DataSourceConfig {
            id: "ds-1".into(),
            name: "Local".into(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: "/books".into(),
            },
        }],
        ..Default::default()
    });

    let sources: Value = invoke_ok(&app, "list_data_sources", json!({}));

    let arr = sources.as_array().expect("sources should be array");
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], json!("ds-1"));
    assert_eq!(arr[0]["kind"], json!("local"));
}

#[tokio::test]
async fn add_local_data_source_should_add_and_persist_when_input_is_valid() {
    let app = TestApp::new();
    let temp = tempfile::tempdir().expect("tempdir");

    let dto: Value = invoke_ok(
        &app,
        "add_local_data_source",
        json!({
            "input": {
                "name": "Books",
                "rootPath": temp.path().to_string_lossy(),
            }
        }),
    );

    assert_eq!(dto["name"], json!("Books"));
    assert_eq!(dto["kind"], json!("local"));

    // Persisted to config.json.
    let persisted = read_persisted_config(&app).expect("config.json written");
    assert_eq!(persisted.data_sources.len(), 1);
    assert_eq!(persisted.data_sources[0].name, "Books");
}

#[tokio::test]
async fn remove_data_source_should_drop_entry_and_persist_when_id_exists() {
    let app = TestApp::with_config(AppConfig {
        data_sources: vec![DataSourceConfig {
            id: "ds-1".into(),
            name: "Local".into(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: "/books".into(),
            },
        }],
        ..Default::default()
    });

    let _: () = invoke_ok(&app, "remove_data_source", json!({ "id": "ds-1" }));

    let snapshot = app.config_snapshot();
    assert!(snapshot.data_sources.is_empty());

    let persisted = read_persisted_config(&app).expect("config.json written");
    assert!(persisted.data_sources.is_empty());
}

#[tokio::test]
async fn remove_data_source_should_return_not_found_when_id_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(&app, "remove_data_source", json!({ "id": "ds-missing" }));

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
}

#[tokio::test]
async fn webdav_list_folders_should_return_not_found_when_data_source_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "webdav_list_folders",
        json!({ "dataSourceId": "ds-missing", "path": "/" }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
}

#[tokio::test]
async fn onedrive_list_folders_should_return_not_found_when_data_source_is_unknown() {
    let app = TestApp::new();

    let err = invoke_err(
        &app,
        "onedrive_list_folders",
        json!({ "dataSourceId": "ds-missing", "path": "/" }),
    );

    assert!(err.is_kind("NotFound"), "kind was {}", err.kind);
}
