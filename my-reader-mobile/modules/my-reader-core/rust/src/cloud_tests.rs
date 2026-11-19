use crate::{data_source, storage, types, CoreFfiError};
use my_reader_core::models;
use serde_json::json;

fn source(kind: &str) -> models::DataSource {
    serde_json::from_value(json!({
        "type": kind, "id": format!("{kind}-1"), "name": "Reader", "enabled": false,
        "rootPath": "/Books", "readonly": true, "createdAt": 123.5,
        "endpoint": "https://storage.example", "username": "reader", "hasPassword": true,
        "clientId": "client", "tenantId": "consumers", "accountId": "account",
        "displayName": "Reader Account", "email": "reader@example.com", "hasRefreshToken": true,
        "rootFolderId": "folder-id", "credentialReference": "secure-reference",
        "bucket": "books", "region": "us-east-1", "virtualHostStyle": true, "hasCredentials": true
    }))
    .unwrap()
}

#[test]
fn source_records_preserve_provider_identity_and_credential_references() {
    for kind in ["local", "webdav", "onedrive", "gdrive", "dropbox", "s3"] {
        let original = source(kind);
        let record = types::DataSource::from(original.clone());
        assert_eq!(record.kind, kind);
        let restored = models::DataSource::try_from(record).unwrap();
        assert_eq!(
            serde_json::to_value(restored).unwrap(),
            serde_json::to_value(original).unwrap()
        );
    }
}

#[test]
fn invalid_cloud_records_fail_before_crossing_the_native_boundary() {
    for kind in ["gdrive", "dropbox"] {
        let mut record = types::DataSource::from(source(kind));
        record.client_id = None;
        assert!(models::DataSource::try_from(record)
            .unwrap_err()
            .to_string()
            .contains("clientId"));
    }
    let mut record = types::DataSource::from(source("s3"));
    record.bucket = None;
    assert!(models::DataSource::try_from(record)
        .unwrap_err()
        .to_string()
        .contains("bucket"));
}

#[test]
fn storage_records_preserve_scoped_roots_and_all_credential_fields() {
    for kind in [
        "local-direct",
        "webdav",
        "onedrive",
        "gdrive",
        "dropbox",
        "s3",
    ] {
        let original: models::LibraryStorageConfig = serde_json::from_value(json!({
            "kind": kind, "root": "/Books/Library", "endpoint": "https://storage.example",
            "username": "reader", "password": " password ", "accessToken": "token",
            "rootFolderId": "folder-id", "bucket": "books", "region": "us-east-1",
            "virtualHostStyle": true, "accessKeyId": "key", "secretAccessKey": " secret ", "sessionToken": "session"
        })).unwrap();
        let record = types::LibraryStorageConfig::from(original.clone());
        assert_eq!(record.kind, kind);
        assert_eq!(
            models::LibraryStorageConfig::try_from(record).unwrap(),
            original
        );
    }
}

fn credential(kind: &str) -> types::RemoteCredential {
    types::RemoteCredential {
        kind: kind.into(),
        password: Some("password".into()),
        access_token: Some("token".into()),
        access_key_id: Some("key".into()),
        secret_access_key: Some(" secret ".into()),
        session_token: Some("session".into()),
    }
}

#[test]
fn credentials_remain_typed_and_missing_tokens_are_rejected() {
    for kind in ["gdrive", "dropbox", "s3"] {
        let actual =
            serde_json::to_value(models::RemoteCredential::try_from(credential(kind)).unwrap())
                .unwrap();
        let expected = if kind == "s3" {
            json!({"type": "s3", "accessKeyId": "key", "secretAccessKey": " secret ", "sessionToken": "session"})
        } else {
            json!({"type": kind, "accessToken": "token"})
        };
        assert_eq!(actual, expected);
        let mut missing = credential(kind);
        missing.access_token = None;
        missing.secret_access_key = None;
        assert!(models::RemoteCredential::try_from(missing).is_err());
    }
}

#[tokio::test]
async fn storage_exports_round_trip_bytes_and_surface_missing_files() {
    let dir = tempfile::tempdir().unwrap();
    let config = types::LibraryStorageConfig::from(models::LibraryStorageConfig::LocalDirect {
        root: dir.path().to_string_lossy().into_owned(),
    });
    let path = "books/中文.epub".to_string();
    storage::storage_write(config.clone(), path.clone(), vec![0, 1, 255])
        .await
        .unwrap();
    assert_eq!(
        storage::storage_read(config.clone(), path.clone())
            .await
            .unwrap(),
        [0, 1, 255]
    );
    let stat = storage::storage_stat(config.clone(), path.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stat.size, 3.0);
    assert!(stat.mtime_ms > 0.0);
    assert!(storage::storage_list(config.clone(), "books/".into())
        .await
        .unwrap()
        .contains(&path));
    storage::storage_delete(config.clone(), path.clone())
        .await
        .unwrap();
    assert!(storage::storage_stat(config.clone(), path.clone())
        .await
        .unwrap()
        .is_none());
    assert!(storage::storage_read(config.clone(), path).await.is_err());
    assert!(storage::storage_stat(config.clone(), "../private".into())
        .await
        .is_err());
    assert!(
        storage::storage_download_request(config, "book.epub".into())
            .await
            .err()
            .unwrap()
            .to_string()
            .contains("NATIVE_DOWNLOAD_REQUEST_UNSUPPORTED")
    );
}

#[tokio::test]
async fn s3_download_exports_preserve_signature_and_session_token() {
    let config = types::LibraryStorageConfig::from(models::LibraryStorageConfig::S3 {
        endpoint: "https://s3.example.com".into(),
        bucket: "books".into(),
        region: "us-east-1".into(),
        root: Some("Library".into()),
        virtual_host_style: false,
        access_key_id: "key".into(),
        secret_access_key: "secret".into(),
        session_token: Some("session".into()),
    });
    let result = storage::storage_download_request(config, "a book.epub".into())
        .await
        .unwrap();
    assert!(result.url.contains("/books/Library/a%20book.epub"));
    assert!(result.url.contains("X-Amz-Signature="));
    assert!(result.url.contains("X-Amz-Security-Token=session"));
    assert!(!result.url.contains("secret"));
}

#[tokio::test]
async fn folder_creation_ffi_rejects_non_remote_sources_and_path_escape() {
    let dir = tempfile::tempdir().unwrap();
    let config = dir
        .path()
        .join("config.json")
        .to_string_lossy()
        .into_owned();
    let local: models::DataSource = serde_json::from_value(
        json!({"type": "local", "id": "local", "name": "Local", "rootPath": dir.path()}),
    )
    .unwrap();
    data_source::data_source_upsert(config.clone(), local.into())
        .await
        .unwrap();
    let error = data_source::data_source_create_directory(
        config.clone(),
        "local".into(),
        "/".into(),
        "New Books".into(),
        credential("webdav"),
    )
    .await
    .unwrap_err();
    assert!(error.to_string().contains("DATASOURCE_NOT_REMOTE"));
    assert!(!dir.path().join("New Books").exists());
    let error = data_source::data_source_create_directory(
        config,
        "local".into(),
        "/".into(),
        "../Outside".into(),
        credential("webdav"),
    )
    .await
    .unwrap_err();
    assert!(matches!(error, CoreFfiError::Config(_)));
}
