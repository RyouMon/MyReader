use sea_orm::{ConnectionTrait, Database};
use serde_json::json;

use my_reader_lib::models::{AppConfig, LibraryConfig};
use my_reader_lib::services::progress_service::ProgressService;

const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";

fn library_config(id: &str) -> LibraryConfig {
    LibraryConfig {
        library_type: Default::default(),
        id: id.into(),
        name: id.into(),
        path: "/unused".into(),
        source_type: Some("local".into()),
        data_source_id: None,
        source_path: None,
    }
}

async fn create_calibre_metadata(root: &std::path::Path) {
    let url = format!(
        "sqlite://{}?mode=rwc",
        root.join("metadata.db").to_string_lossy()
    );
    let db = Database::connect(&url).await.unwrap();
    db.execute_unprepared(&format!(
        "CREATE TABLE library_id (\
           id INTEGER PRIMARY KEY, uuid TEXT NOT NULL, UNIQUE(uuid)\
         );\
         INSERT INTO library_id (id, uuid) VALUES (1, '{LIBRARY_UUID}');"
    ))
    .await
    .unwrap();
}

#[tokio::test]
async fn progress_for_library_should_return_saved_progress() {
    let temp_dir = tempfile::tempdir().unwrap();
    let app_data_dir = temp_dir.path();
    let library_root = tempfile::tempdir().unwrap();
    create_calibre_metadata(library_root.path()).await;
    let mut lib = library_config("lib-progress-1");
    lib.path = library_root.path().to_string_lossy().to_string();
    let config = AppConfig {
        libraries: vec![lib.clone()],
        active_library_id: Some(lib.id.clone()),
        ..Default::default()
    };
    let locator = json!({
        "href": "OEBPS/chapter1.xhtml",
        "type": "application/xhtml+xml",
        "locations": {"progression": 0.5}
    });

    ProgressService::set_reading_progress_for_library(
        app_data_dir,
        &config,
        Some(&lib.id),
        7,
        "EPUB",
        &locator,
        Some(0.5),
    )
    .await
    .expect("set should succeed");

    let dto = ProgressService::get_reading_progress_for_library(
        app_data_dir,
        &config,
        Some(&lib.id),
        7,
        "EPUB",
    )
    .await
    .expect("get should succeed")
    .expect("progress should exist");

    assert_eq!(dto.library_id, lib.id);
    assert_eq!(dto.book_id, 7);
    assert_eq!(dto.format, "EPUB");
    assert_eq!(dto.locator, locator);
}

#[tokio::test]
async fn progress_for_library_should_resolve_active_library_when_id_is_none() {
    let temp = tempfile::tempdir().unwrap();
    let library_root = tempfile::tempdir().unwrap();
    create_calibre_metadata(library_root.path()).await;
    let mut lib = library_config("lib-progress-active");
    lib.path = library_root.path().to_string_lossy().to_string();
    let config = AppConfig {
        libraries: vec![lib.clone()],
        active_library_id: Some(lib.id.clone()),
        ..Default::default()
    };
    let locator = json!({"href": "chapter.xhtml", "type": "application/pdf"});

    ProgressService::set_reading_progress_for_library(
        temp.path(),
        &config,
        None,
        8,
        "PDF",
        &locator,
        None,
    )
    .await
    .expect("set should succeed");

    let dto =
        ProgressService::get_reading_progress_for_library(temp.path(), &config, None, 8, "PDF")
            .await
            .expect("get should succeed")
            .expect("progress should exist");

    assert_eq!(dto.library_id, lib.id);
    assert_eq!(dto.locator, locator);
}

#[tokio::test]
async fn progress_for_library_should_return_not_found_for_missing_active_or_unknown_library() {
    let temp = tempfile::tempdir().unwrap();
    let empty_config = AppConfig::default();
    let locator = json!({"href": "chapter.xhtml"});

    let err = ProgressService::get_reading_progress_for_library(
        temp.path(),
        &empty_config,
        None,
        1,
        "EPUB",
    )
    .await
    .expect_err("should fail without active library");
    assert!(format!("{err}").contains("NO_ACTIVE_LIBRARY"));

    let err = ProgressService::set_reading_progress_for_library(
        temp.path(),
        &empty_config,
        None,
        1,
        "EPUB",
        &locator,
        None,
    )
    .await
    .expect_err("should fail without active library");
    assert!(format!("{err}").contains("NO_ACTIVE_LIBRARY"));

    let lib = library_config("lib-progress");
    let config = AppConfig {
        libraries: vec![lib],
        active_library_id: Some("lib-progress".into()),
        ..Default::default()
    };
    let err = ProgressService::get_reading_progress_for_library(
        temp.path(),
        &config,
        Some("ghost"),
        1,
        "EPUB",
    )
    .await
    .expect_err("should fail for unknown library");
    assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));
}
