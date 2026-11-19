use crate::{
    auth::credentials,
    models::{AppConfig, DataSourceConfig},
    storage,
};
use serde_json::json;
use std::collections::BTreeMap;

fn cloud_config(kind: &str, account: Option<&str>) -> DataSourceConfig {
    serde_json::from_value(json!({
        "kind": kind, "id": format!("{kind}-1"), "name": "Reader", "enabled": true,
        "client_id": "client", "account_id": "account", "credential_account": account,
        "root_path": "/Books", "root_folder_id": "folder-id", "user_name": "Reader Account", "user_email": "reader@example.com",
        "endpoint": "https://s3.example.com", "bucket": "books", "region": "us-east-1", "virtual_host_style": true
    })).unwrap()
}

#[tokio::test]
async fn cloud_storage_resolves_cached_tokens_and_deletes_only_its_own_credentials() {
    let _credentials = credentials::use_test_backend(credentials::MemoryBackend::default());
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let mut config = AppConfig::default();
    for kind in ["gdrive", "dropbox", "s3"] {
        let account = format!("secure-{kind}");
        let source = cloud_config(kind, Some(&account));
        credentials::save_remote_credentials(
            &account,
            &BTreeMap::from([
                ("accessToken".into(), "cached-token".into()),
                ("expiresAt".into(), u64::MAX.to_string()),
                ("accessKeyId".into(), "key".into()),
                ("secretAccessKey".into(), "secret".into()),
                ("sessionToken".into(), "session".into()),
            ]),
        )
        .unwrap();
        let credential = storage::core_remote_credential(&source).await.unwrap();
        let value = serde_json::to_value(credential).unwrap();
        assert_eq!(value["type"], kind);
        assert_eq!(
            value[if kind == "s3" {
                "sessionToken"
            } else {
                "accessToken"
            }],
            if kind == "s3" {
                "session"
            } else {
                "cached-token"
            }
        );
        let operator = storage::from_data_source_at_path(&source, Some("Library"))
            .await
            .unwrap();
        assert!(operator.info().root().ends_with("/Books/Library/"));
        config.data_sources.push(source);
    }
    for kind in ["gdrive", "dropbox", "s3"] {
        crate::services::datasource_service::DataSourceService::remove_data_source(
            &format!("{kind}-1"),
            &path,
            &mut config,
        )
        .unwrap();
        assert!(credentials::read_remote_credentials(&format!("secure-{kind}")).is_err());
    }
    assert!(config.data_sources.is_empty());
}
