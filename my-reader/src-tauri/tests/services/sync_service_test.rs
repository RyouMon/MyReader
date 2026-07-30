use my_reader_core::test_support::entities::app::sync_local_meta;
use my_reader_lib::models::{AppConfig, LibraryConfig};
use my_reader_lib::services::sync_service::SyncService;
use sea_orm::{Database, EntityTrait};

use crate::common::calibre::create_calibre_db;

fn local_library(id: &str, original_path: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.to_owned(),
        name: "Local".to_owned(),
        path: original_path.to_owned(),
        source_type: Some("local".to_owned()),
        data_source_id: None,
        source_path: None,
    }
}

fn remote_library(id: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.to_owned(),
        name: "WebDAV".to_owned(),
        path: String::new(),
        source_type: Some("webdav".to_owned()),
        data_source_id: Some("missing-source".to_owned()),
        source_path: Some("/books".to_owned()),
    }
}

#[tokio::test]
async fn should_initialize_automerge_replica_when_local_library_syncs() {
    let app_data = tempfile::tempdir().unwrap();
    let original = tempfile::tempdir().unwrap();
    create_calibre_db(original.path()).await;
    let mut config = AppConfig {
        libraries: vec![local_library(
            "lib-local",
            original.path().to_str().unwrap(),
        )],
        ..Default::default()
    };

    let report = SyncService::sync_db_for_library(app_data.path(), &mut config, "lib-local")
        .await
        .expect("local sync should succeed");
    let sidecar = app_data.path().join("libraries").join("lib-local");
    let db = Database::connect(format!(
        "sqlite://{}?mode=ro",
        sidecar.join(".myreader").join("myreader.db").display()
    ))
    .await
    .unwrap();
    let identity = sync_local_meta::Entity::find()
        .one(&db)
        .await
        .unwrap()
        .unwrap();

    assert_eq!(report.pushed, 1);
    assert_eq!(report.pulled, 0);
    assert_eq!(identity.protocol, "library-sidecar-automerge-repo");
    assert_eq!(
        identity.library_uuid,
        "018f2f8d-980b-40ef-b72e-c6e86cb7cc28"
    );
}

#[tokio::test]
async fn should_return_not_found_when_remote_library_data_source_is_missing() {
    let app_data = tempfile::tempdir().unwrap();
    let cached_root = app_data.path().join("libraries").join("lib-remote");
    std::fs::create_dir_all(&cached_root).unwrap();
    create_calibre_db(&cached_root).await;
    let mut config = AppConfig {
        libraries: vec![remote_library("lib-remote")],
        ..Default::default()
    };

    let error = SyncService::sync_db_for_library(app_data.path(), &mut config, "lib-remote")
        .await
        .expect_err("missing data source should fail");

    assert!(error.to_string().contains("DATASOURCE_NOT_FOUND"));
}

#[tokio::test]
async fn should_return_not_found_when_library_is_unknown() {
    let app_data = tempfile::tempdir().unwrap();
    let mut config = AppConfig::default();

    let error = SyncService::sync_db_for_library(app_data.path(), &mut config, "ghost")
        .await
        .expect_err("unknown library should fail");

    assert!(error.to_string().contains("LIBRARY_NOT_FOUND"));
}
