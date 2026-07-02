use serde_json::json;

use my_reader_lib::models::{AppConfig, LibraryConfig};
use my_reader_lib::services::progress_service::ProgressService;

fn library_config(id: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.into(),
        name: id.into(),
        path: "/unused".into(),
        source_type: Some("local".into()),
        data_source_id: None,
        source_path: None,
    }
}

#[tokio::test]
async fn direct_progress_operations_should_round_trip_locator() {
    let temp = tempfile::tempdir().unwrap();
    let sidecar_root = temp.path().to_string_lossy().to_string();
    let locator = json!({"href": "chapter.xhtml", "locations": {"progression": 0.25}});

    ProgressService::set_reading_progress(&sidecar_root, 7, "EPUB", &locator)
        .await
        .expect("set should succeed");

    let dto = ProgressService::get_reading_progress(&sidecar_root, "ignored", 7, "EPUB")
        .await
        .expect("get should succeed")
        .expect("progress should exist");

    assert_eq!(dto.book_id, 7);
    assert_eq!(dto.format, "EPUB");
    assert_eq!(dto.locator, locator);
}

#[tokio::test]
async fn get_reading_progress_should_return_none_when_row_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let sidecar_root = temp.path().to_string_lossy().to_string();

    let dto = ProgressService::get_reading_progress(&sidecar_root, "lib", 404, "EPUB")
        .await
        .expect("get should succeed");

    assert!(dto.is_none());
}

#[tokio::test]
async fn list_reading_progress_should_return_all_rows_for_library() {
    let temp = tempfile::tempdir().unwrap();
    let sidecar_root = temp.path().to_string_lossy().to_string();
    let first = json!({"href": "chapter.xhtml", "locations": {"progression": 0.25}});
    let second = json!({"href": "page-2", "locations": {"position": 2}});

    ProgressService::set_reading_progress(&sidecar_root, 7, "EPUB", &first)
        .await
        .expect("first set should succeed");
    ProgressService::set_reading_progress(&sidecar_root, 8, "PDF", &second)
        .await
        .expect("second set should succeed");

    let rows = ProgressService::list_reading_progress(&sidecar_root, "lib-list")
        .await
        .expect("list should succeed");

    assert_eq!(rows.len(), 2);
    assert!(rows.iter().any(|row| {
        row.library_id == "lib-list"
            && row.book_id == 7
            && row.format == "EPUB"
            && row.locator == first
    }));
    assert!(rows.iter().any(|row| {
        row.library_id == "lib-list"
            && row.book_id == 8
            && row.format == "PDF"
            && row.locator == second
    }));
}

#[tokio::test]
async fn progress_for_library_should_return_saved_progress() {
    let temp_dir = tempfile::tempdir().unwrap();
    let app_data_dir = temp_dir.path();
    let lib = library_config("lib-progress-1");
    let config = AppConfig {
        libraries: vec![lib.clone()],
        active_library_id: Some(lib.id.clone()),
        ..Default::default()
    };
    let locator = json!({"href": "OEBPS/chapter1.xhtml", "locations": {"progression": 0.5}});

    ProgressService::set_reading_progress_for_library(
        app_data_dir,
        &config,
        Some(&lib.id),
        7,
        "EPUB",
        &locator,
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
    let lib = library_config("lib-progress-active");
    let config = AppConfig {
        libraries: vec![lib.clone()],
        active_library_id: Some(lib.id.clone()),
        ..Default::default()
    };
    let locator = json!({"href": "chapter.xhtml"});

    ProgressService::set_reading_progress_for_library(
        temp.path(),
        &config,
        None,
        8,
        "PDF",
        &locator,
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
