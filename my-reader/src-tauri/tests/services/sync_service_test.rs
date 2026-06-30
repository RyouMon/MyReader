use my_reader_lib::models::{AppConfig, LibraryConfig};
use my_reader_lib::services::sync_service::SyncService;

fn local_library(id: &str, original_path: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.to_string(),
        name: "Local".to_string(),
        path: original_path.to_string(),
        source_type: Some("local".to_string()),
        data_source_id: None,
        source_path: None,
    }
}

fn remote_library(id: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.to_string(),
        name: "WebDAV".to_string(),
        path: "".to_string(),
        source_type: Some("webdav".to_string()),
        data_source_id: Some("ds-webdav".to_string()),
        source_path: Some("/books".to_string()),
    }
}

#[tokio::test]
async fn sync_db_for_library_should_sync_remote_library_inside_container() {
    let app_data = tempfile::tempdir().unwrap();
    let mut config = AppConfig::default();
    config.libraries.push(remote_library("lib-remote"));

    let report = SyncService::sync_db_for_library(app_data.path(), &mut config, "lib-remote")
        .await
        .expect("remote sync should succeed");

    assert_eq!(report.pushed, 0);
    assert_eq!(report.pulled, 0);
    assert!(config.device_id.is_some());
}

#[tokio::test]
async fn sync_db_for_library_should_mirror_container_changes_to_original_for_local_library() {
    let app_data = tempfile::tempdir().unwrap();
    let original = tempfile::tempdir().unwrap();
    let mut config = AppConfig::default();
    config.libraries.push(local_library(
        "lib-local",
        original.path().to_str().unwrap(),
    ));

    SyncService::sync_db_for_library(app_data.path(), &mut config, "lib-local")
        .await
        .expect("first sync should initialize sidecar");
    let device_id = config.device_id.clone().expect("device id generated");

    let change_path = app_data
        .path()
        .join("libraries/lib-local/.myreader/changes")
        .join(&device_id)
        .join("1.jsonl");
    tokio::fs::create_dir_all(change_path.parent().unwrap())
        .await
        .expect("create change dir");
    tokio::fs::write(&change_path, b"{}")
        .await
        .expect("write change file");

    let report = SyncService::sync_db_for_library(app_data.path(), &mut config, "lib-local")
        .await
        .expect("second sync should mirror changes");

    assert_eq!(report.pushed, 0);
    let original_change = original
        .path()
        .join(".myreader/changes")
        .join(&device_id)
        .join("1.jsonl");
    assert!(tokio::fs::try_exists(&original_change).await.unwrap());
}

#[tokio::test]
async fn sync_db_for_library_should_return_not_found_when_library_is_unknown() {
    let app_data = tempfile::tempdir().unwrap();
    let mut config = AppConfig::default();

    let err = SyncService::sync_db_for_library(app_data.path(), &mut config, "ghost")
        .await
        .expect_err("unknown library should fail");

    assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));
}
