use crate::common::{
    app::TestApp,
    config::read_persisted_config,
    ipc::{invoke_err, invoke_ok},
    s3::MockS3,
};
use my_reader_core::models::DataSource;
use my_reader_lib::{
    auth::test_support as credentials,
    models::{DataSourceConfig, DataSourceDto},
};
use serde_json::{json, Value};

fn s3_input(endpoint: &str) -> Value {
    json!({"name": "Archive", "endpoint": endpoint, "bucket": "books", "region": "us-east-1", "rootPath": "/Library", "virtualHostStyle": false, "accessKeyId": "test-key", "secretAccessKey": "test-secret", "sessionToken": "session"})
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn s3_commands_test_access_persist_securely_create_and_browse_folders_and_remove_source() {
    let app = TestApp::new();
    let _credentials = credentials::use_test_backend(credentials::MemoryBackend::default());
    let server = MockS3::start().await;
    server
        .objects
        .lock()
        .unwrap()
        .insert("Library/Existing/book.epub".into(), vec![1]);
    let dto: Value = invoke_ok(
        &app,
        "add_s3_source",
        json!({"input": s3_input(&server.endpoint)}),
    );
    assert_eq!(dto["kind"], "s3");
    assert_eq!(dto["has_credentials"], true);
    assert!(!dto.to_string().contains("test-secret"));
    let id = dto["id"].as_str().unwrap();
    let config = read_persisted_config(&app).unwrap();
    assert_eq!(config.data_sources.len(), 1);
    assert!(!serde_json::to_string(&config)
        .unwrap()
        .contains("test-secret"));
    let account = format!("remote-{id}");
    assert_eq!(
        credentials::read_remote_credential_field(&account, "sessionToken")
            .unwrap()
            .as_deref(),
        Some("session")
    );
    let initial: Vec<Value> = invoke_ok(
        &app,
        "remote_list_folders",
        json!({"dataSourceId": id, "path": "/"}),
    );
    assert_eq!(initial, [json!({"name": "Existing", "path": "/Existing"})]);
    let created: Value = invoke_ok(
        &app,
        "remote_create_folder",
        json!({"dataSourceId": id, "parentPath": "/", "name": "Created"}),
    );
    assert_eq!(created, json!({"name": "Created", "path": "/Created"}));
    assert!(server
        .objects
        .lock()
        .unwrap()
        .contains_key("Library/Created/"));
    let folders: Vec<Value> = invoke_ok(
        &app,
        "remote_list_folders",
        json!({"dataSourceId": id, "path": "/"}),
    );
    assert!(folders.contains(&created));
    let error = invoke_err(
        &app,
        "remote_create_folder",
        json!({"dataSourceId": id, "parentPath": "/", "name": "Created"}),
    );
    assert!(
        error.message.contains("REMOTE_DIRECTORY_ALREADY_EXISTS"),
        "{error:?}"
    );
    let error = invoke_err(
        &app,
        "remote_create_folder",
        json!({"dataSourceId": id, "parentPath": "/", "name": "../Outside"}),
    );
    assert!(error.message.contains("INVALID_REMOTE_DIRECTORY_NAME"));
    let _: () = invoke_ok(&app, "remove_data_source", json!({"id": id}));
    assert!(read_persisted_config(&app).unwrap().data_sources.is_empty());
    assert!(credentials::read_remote_credentials(&account).is_err());
    assert!(server
        .objects
        .lock()
        .unwrap()
        .contains_key("Library/Existing/book.epub"));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn rejected_s3_credentials_do_not_create_a_source() {
    let app = TestApp::new();
    let _credentials = credentials::use_test_backend(credentials::MemoryBackend::default());
    let server = MockS3::start().await;
    let mut input = s3_input(&server.endpoint);
    input["accessKeyId"] = json!("wrong-key");
    let error = invoke_err(&app, "add_s3_source", json!({"input": input}));
    assert!(error.is_kind("Credential"), "{error:?}");
    assert!(app.config_snapshot().data_sources.is_empty());
}

fn cloud_config(kind: &str, account: Option<&str>) -> DataSourceConfig {
    serde_json::from_value(json!({
        "kind": kind, "id": format!("{kind}-1"), "name": "Reader", "enabled": true,
        "client_id": "client", "account_id": "account", "credential_account": account,
        "root_path": "/Books", "root_folder_id": "folder-id", "user_name": "Reader Account", "user_email": "reader@example.com",
        "endpoint": "https://s3.example.com", "bucket": "books", "region": "us-east-1", "virtual_host_style": true
    })).unwrap()
}

#[tokio::test]
async fn cloud_dtos_round_trip_account_fields_without_exposing_credential_references() {
    let _credentials = credentials::use_test_backend(credentials::MemoryBackend::default());
    for kind in ["gdrive", "dropbox", "s3"] {
        for reference in [None, Some(" "), Some("secure-reference")] {
            let config = cloud_config(kind, reference);
            let core: DataSource = (&config).into();
            let restored = DataSourceConfig::from(&core);
            assert_eq!(
                serde_json::to_value(&restored).unwrap(),
                serde_json::to_value(&config).unwrap()
            );
            let dto = serde_json::to_value(DataSourceDto::from(&restored)).unwrap();
            assert_eq!(
                dto[if kind == "s3" {
                    "has_credentials"
                } else {
                    "has_refresh_token"
                }],
                reference.is_some_and(|value| !value.trim().is_empty())
            );
            assert!(dto.get("credential_account").is_none());
            assert!(!dto.to_string().contains("secure-reference"));
            if kind != "s3" {
                assert_eq!(dto["user_email"], "reader@example.com");
            }
        }
    }
}
