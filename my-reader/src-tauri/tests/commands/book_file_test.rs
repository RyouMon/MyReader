use serde_json::{json, Value};

use my_reader_lib::models::{AppConfig, LibraryConfig, LibraryInfo};
use my_reader_lib::services::download_service::DownloadService;

use crate::common::app::TestApp;
use crate::common::calibre::seed_minimal_calibre_library;
use crate::common::ipc::{invoke_err, invoke_ok};

#[tokio::test]
async fn native_file_actions_should_reject_missing_file_before_using_system_services() {
    let root = tempfile::tempdir().unwrap();
    let seeded = seed_minimal_calibre_library(root.path()).await;
    let app = TestApp::with_config(AppConfig {
        libraries: vec![LibraryConfig {
            id: "local".into(),
            name: "Local".into(),
            path: root.path().to_string_lossy().into_owned(),
            library_type: Default::default(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        ..Default::default()
    });
    tokio::fs::remove_file(&seeded.file_path).await.unwrap();

    for command in [
        "copy_book_file_path",
        "reveal_book_file",
        "save_book_file_as",
    ] {
        let error = invoke_err(
            &app,
            command,
            json!({ "libraryId": "local", "bookId": seeded.book_id, "format": "EPUB" }),
        );
        assert!(error.is_kind("NotFound"));
        assert!(error.message.contains("BOOK_FILE_NOT_AVAILABLE_LOCALLY"));
    }
}

#[tokio::test]
async fn available_book_path_should_use_managed_library_imported_file() {
    let app = TestApp::new();
    let parent = tempfile::tempdir().unwrap();
    let library_root = parent.path().join("Managed Library");
    let source = parent.path().join("分享测试 & sample.epub");
    tokio::fs::write(&source, b"epub fixture").await.unwrap();
    let library: LibraryInfo = invoke_ok(
        &app,
        "create_myreader_library",
        json!({ "path": library_root.to_string_lossy(), "name": "Managed" }),
    );
    let imported: Value = invoke_ok(
        &app,
        "import_book",
        json!({
            "libraryId": library.id,
            "sourceFilePath": source.to_string_lossy(),
            "title": null,
            "authors": ["作者"],
        }),
    );
    let book_id = imported["book"]["id"].as_i64().unwrap();
    let path = DownloadService::new()
        .resolve_available_book_file_path(
            &app.app_data_dir(),
            &app.config_snapshot(),
            &library.id,
            book_id,
            "epub",
        )
        .await
        .unwrap();
    assert!(path.starts_with(dunce::canonicalize(library_root).unwrap()));
    assert_eq!(path.file_name(), source.file_name());
    assert_eq!(tokio::fs::read(path).await.unwrap(), b"epub fixture");
}
