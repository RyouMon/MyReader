use super::*;
use crate::api::datasource::DataSourceService;
use serde_json::{json, Value};

fn cloud_source(kind: &str) -> Value {
    json!({
        "type": kind, "id": "source", "name": " Reader ", "enabled": true,
        "clientId": " client ", "accountId": " account ", "displayName": " Reader Account ",
        "email": " reader@example.com ", "rootPath": " /Books//Library/ ", "rootFolderId": " folder-id ",
        "endpoint": " https://storage.example/ ", "bucket": " books ", "region": " us-east-1 ",
        "hasRefreshToken": true, "hasCredentials": true, "virtualHostStyle": true,
        "credentialReference": "secure-reference", "readonly": true, "createdAt": 123.5
    })
}

#[test]
fn cloud_sources_normalize_fields_and_deduplicate_by_account_and_root() {
    for kind in ["gdrive", "dropbox", "s3"] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let source = DataSourceService::prepare_for_upsert(
            &path,
            serde_json::from_value(cloud_source(kind)).unwrap(),
        )
        .unwrap();
        let normalized = serde_json::to_value(&source).unwrap();
        assert_eq!(normalized["name"], "Reader");
        assert_eq!(normalized["rootPath"], "Books/Library");
        if kind == "s3" {
            assert_eq!(normalized["endpoint"], "https://storage.example");
            assert_eq!(normalized["bucket"], "books");
            assert_eq!(normalized["region"], "us-east-1");
        } else {
            assert_eq!(normalized["clientId"], "client");
            assert_eq!(normalized["accountId"], "account");
            assert_eq!(normalized["displayName"], "Reader Account");
            assert_eq!(normalized["email"], "reader@example.com");
        }
        DataSourceService::upsert(&path, source.clone()).unwrap();
        let mut duplicate = normalized.clone();
        duplicate["id"] = json!("different-id");
        let error = DataSourceService::prepare_for_upsert(
            &path,
            serde_json::from_value(duplicate.clone()).unwrap(),
        )
        .unwrap_err();
        assert!(error.to_string().contains("DATASOURCE_ALREADY_EXISTS"));
        duplicate["rootPath"] = json!("Books/Other");
        assert!(DataSourceService::prepare_for_upsert(
            &path,
            serde_json::from_value(duplicate).unwrap()
        )
        .is_ok());
        let saved = ConfigService::load(&path).unwrap().unwrap();
        assert_eq!(
            serde_json::to_value(&saved.data_sources[0]).unwrap(),
            normalized
        );
        assert!(!std::fs::read_to_string(path)
            .unwrap()
            .contains("accessToken"));
    }
}

#[test]
fn desktop_save_preserves_mobile_creation_metadata_for_cloud_sources() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let mut config = AppConfig::empty();
    for kind in ["gdrive", "dropbox", "s3"] {
        let mut raw = cloud_source(kind);
        raw["id"] = json!(kind);
        config.data_sources.push(
            ConfigService::prepare_data_source(serde_json::from_value(raw).unwrap()).unwrap(),
        );
    }
    ConfigService::save(&path, config.clone()).unwrap();
    for source in &mut config.data_sources {
        let mut value = serde_json::to_value(&*source).unwrap();
        value["readonly"] = Value::Null;
        value["createdAt"] = Value::Null;
        value["name"] = json!("Renamed");
        *source = serde_json::from_value(value).unwrap();
    }
    let merged = ConfigService::write_desktop_state(&path, config).unwrap();
    for source in merged.data_sources {
        let value = serde_json::to_value(source).unwrap();
        assert_eq!(value["name"], "Renamed");
        assert_eq!(value["readonly"], true);
        assert_eq!(value["createdAt"], 123.5);
        assert_eq!(value["credentialReference"], "secure-reference");
    }
}

#[test]
fn cloud_validation_rejects_unsafe_roots_and_invalid_provider_configuration() {
    for (kind, field, invalid_value, expected) in [
        ("gdrive", "clientId", " ", "OAUTH_CLIENT_ID_REQUIRED"),
        ("dropbox", "clientId", " ", "OAUTH_CLIENT_ID_REQUIRED"),
        (
            "gdrive",
            "rootFolderId",
            "folder/child",
            "INVALID_GDRIVE_FOLDER_ID",
        ),
        ("gdrive", "rootPath", "../private", "INVALID_REMOTE_PATH"),
        (
            "dropbox",
            "rootPath",
            "Books/../private",
            "INVALID_REMOTE_PATH",
        ),
        ("s3", "rootPath", "../private", "INVALID_REMOTE_PATH"),
        ("s3", "endpoint", "not-a-url", "INVALID_S3_ENDPOINT"),
        (
            "s3",
            "endpoint",
            "ftp://storage.example",
            "INVALID_S3_ENDPOINT",
        ),
        (
            "s3",
            "endpoint",
            "https://user:password@storage.example",
            "INVALID_S3_ENDPOINT",
        ),
        (
            "s3",
            "endpoint",
            "https://storage.example?secret=token",
            "INVALID_S3_ENDPOINT",
        ),
        ("s3", "bucket", "bucket/nested", "INVALID_S3_BUCKET"),
        ("s3", "region", " ", "S3_REGION_REQUIRED"),
    ] {
        let mut value = cloud_source(kind);
        value[field] = json!(invalid_value);
        let error =
            ConfigService::prepare_data_source(serde_json::from_value(value).unwrap()).unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "{kind} {field}: {error}"
        );
    }
}
