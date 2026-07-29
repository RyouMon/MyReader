use std::collections::HashMap;
use std::io::Write;

use my_reader_core::models::FileStateUpdate;
use my_reader_core::test_support::entities::calibre::data;
use my_reader_lib::cache;
use my_reader_lib::models::AppConfig;
use my_reader_lib::services::reader_service::ReaderService;
use my_reader_lib::streamer::{EpubStreamer, StreamerState};
use sea_orm::{ActiveModelTrait, Database, Set};
use tokio::sync::RwLock;

use crate::common::calibre::seed_minimal_calibre_library;

#[tokio::test]
async fn reader_ui_preferences_should_round_trip_in_config() {
    let mut config = AppConfig::default();
    let mut prefs = ReaderService::get_reader_ui_preferences(&config);
    prefs.app_theme = "dark".into();
    prefs.library_view_mode = "list".into();

    ReaderService::set_reader_ui_preferences(&mut config, prefs.clone());

    let saved = ReaderService::get_reader_ui_preferences(&config);
    assert_eq!(saved.app_theme, "dark");
    assert_eq!(saved.library_view_mode, "list");
}

#[test]
fn write_epub_readium_manifest_should_write_inside_reader_cache_and_block_outside_paths() {
    cache::ensure_reader_cache_dirs().expect("cache dirs should exist");
    let cache_dir = cache::reader_cache_extracted_root().join(format!(
        "reader-service-manifest-{}",
        uuid::Uuid::new_v4().as_simple()
    ));
    std::fs::create_dir_all(&cache_dir).expect("create manifest dir");
    let manifest = serde_json::json!({"metadata": {"title": "Demo"}});

    ReaderService::write_epub_readium_manifest(&cache_dir.to_string_lossy(), &manifest)
        .expect("manifest write should succeed");

    let written = std::fs::read_to_string(cache_dir.join("manifest.json"))
        .expect("manifest file should exist");
    assert!(written.contains("\"title\": \"Demo\""));

    let outside = tempfile::tempdir().unwrap();
    let err =
        ReaderService::write_epub_readium_manifest(&outside.path().to_string_lossy(), &manifest)
            .expect_err("outside path should be blocked");
    assert!(format!("{err}").contains("PATH_TRAVERSAL_BLOCKED"));
}

#[tokio::test]
async fn prepare_book_source_should_return_existing_non_archive_file_without_extraction() {
    let lib_root = tempfile::tempdir().unwrap();
    let seeded = seed_minimal_calibre_library(lib_root.path()).await;
    add_format_to_seeded_book(lib_root.path(), seeded.book_id, 2, "PDF").await;

    let source = ReaderService::prepare_book_source(
        "lib-reader-pdf",
        &lib_root.path().to_string_lossy(),
        None,
        false,
        seeded.book_id,
        "pdf",
    )
    .await
    .expect("prepare should succeed");

    assert_eq!(source.format, "PDF");
    assert!(source.file_path.ends_with("It.pdf"));
    assert!(source.extracted_dir_path.is_none());
    assert!(source.extracted_entries.is_empty());
}

#[tokio::test]
async fn prepare_book_source_should_extract_epub_archives_into_reader_cache() {
    let lib_root = tempfile::tempdir().unwrap();
    let seeded = seed_minimal_calibre_library(lib_root.path()).await;
    write_zip(
        &seeded.file_path,
        &[("OEBPS/chapter.xhtml", b"<html></html>")],
    );

    let source = ReaderService::prepare_book_source(
        "lib-reader-epub",
        &lib_root.path().to_string_lossy(),
        None,
        false,
        seeded.book_id,
        "epub",
    )
    .await
    .expect("prepare should succeed");

    let extracted_dir = source
        .extracted_dir_path
        .as_ref()
        .expect("epub should be extracted");
    assert_eq!(source.format, "EPUB");
    assert_eq!(source.extracted_entries, vec!["OEBPS/chapter.xhtml"]);
    assert!(std::path::Path::new(extracted_dir)
        .join("OEBPS/chapter.xhtml")
        .is_file());

    let stale = std::path::Path::new(extracted_dir).join("stale.txt");
    std::fs::write(&stale, b"stale").expect("write stale extracted file");
    let source = ReaderService::prepare_book_source(
        "lib-reader-epub",
        &lib_root.path().to_string_lossy(),
        None,
        false,
        seeded.book_id,
        "epub",
    )
    .await
    .expect("second prepare should succeed");
    let extracted_dir = source.extracted_dir_path.expect("epub should be extracted");
    assert!(!std::path::Path::new(&extracted_dir)
        .join("stale.txt")
        .exists());
}

#[tokio::test]
async fn prepare_book_source_should_require_present_sidecar_row_for_remote_libraries() {
    let lib_root = tempfile::tempdir().unwrap();
    let sidecar_root = tempfile::tempdir().unwrap();
    let seeded = seed_minimal_calibre_library(lib_root.path()).await;
    add_format_to_seeded_book(lib_root.path(), seeded.book_id, 2, "PDF").await;

    let source = ReaderService::prepare_book_source(
        "lib-reader-remote",
        &lib_root.path().to_string_lossy(),
        None,
        true,
        seeded.book_id,
        "PDF",
    )
    .await
    .expect("remote file without sidecar should prepare when file exists");
    assert_eq!(source.format, "PDF");

    tokio::fs::remove_file(lib_root.path().join("It/It.pdf"))
        .await
        .expect("remove remote cached file");
    let err = ReaderService::prepare_book_source(
        "lib-reader-remote",
        &lib_root.path().to_string_lossy(),
        None,
        true,
        seeded.book_id,
        "PDF",
    )
    .await
    .expect_err("missing remote file should fail");
    assert!(format!("{err}").contains("BOOK_FORMAT_NOT_DOWNLOADED"));
    add_format_file(lib_root.path(), "PDF").await;

    let err = ReaderService::prepare_book_source(
        "lib-reader-remote",
        &lib_root.path().to_string_lossy(),
        Some(sidecar_root.path()),
        true,
        seeded.book_id,
        "PDF",
    )
    .await
    .expect_err("remote file without present state should fail");
    assert!(format!("{err}").contains("BOOK_FORMAT_NOT_DOWNLOADED"));

    my_reader_core::api::content::ContentService::upsert_file_state(
        sidecar_root.path(),
        "It/It.pdf",
        FileStateUpdate {
            local_state: "present".into(),
            local_blake3: None,
            local_size: Some(7),
            local_mtime: None,
        },
    )
    .await
    .expect("mark remote file present");

    let source = ReaderService::prepare_book_source(
        "lib-reader-remote",
        &lib_root.path().to_string_lossy(),
        Some(sidecar_root.path()),
        true,
        seeded.book_id,
        "PDF",
    )
    .await
    .expect("present remote file should prepare");

    assert_eq!(source.format, "PDF");
}

#[tokio::test]
async fn prepare_book_source_should_return_not_found_when_format_is_missing() {
    let lib_root = tempfile::tempdir().unwrap();
    let seeded = seed_minimal_calibre_library(lib_root.path()).await;

    let err = ReaderService::prepare_book_source(
        "lib-reader-missing",
        &lib_root.path().to_string_lossy(),
        None,
        false,
        seeded.book_id,
        "MOBI",
    )
    .await
    .expect_err("missing format should fail");

    assert!(format!("{err}").contains("BOOK_FORMAT_NOT_FOUND"));
}

#[tokio::test]
async fn close_streamer_should_remove_active_streamer() {
    let temp = tempfile::tempdir().unwrap();
    let (streamer, _url) = EpubStreamer::serve_dir(temp.path().to_path_buf())
        .await
        .expect("streamer should start");

    let state: StreamerState = StreamerState::new(RwLock::new(HashMap::new()));
    {
        let mut guard = state.write().await;
        guard.insert("lib-1-42".to_string(), streamer);
    }

    ReaderService::close_streamer(&state, "lib-1", 42).await;

    let guard = state.read().await;
    assert!(guard.is_empty(), "streamer should be removed from state");
}

async fn add_format_to_seeded_book(
    root: &std::path::Path,
    book_id: i64,
    data_id: i64,
    format: &str,
) {
    let db_path = root.join("metadata.db");
    let url = format!(
        "sqlite://{}?mode=rwc",
        db_path.to_str().expect("valid utf8")
    );
    let db = Database::connect(&url).await.expect("connect to setup db");
    data::ActiveModel {
        id: Set(data_id),
        book: Set(book_id),
        format: Set(format.to_string()),
        uncompressed_size: Set(7),
        name: Set("It".to_string()),
    }
    .insert(&db)
    .await
    .expect("insert format");

    add_format_file(root, format).await;
}

async fn add_format_file(root: &std::path::Path, format: &str) {
    let file_path = root
        .join("It")
        .join(format!("It.{}", format.to_lowercase()));
    tokio::fs::write(file_path, b"content")
        .await
        .expect("write format file");
}

fn write_zip(path: &std::path::Path, entries: &[(&str, &[u8])]) {
    let file = std::fs::File::create(path).expect("create zip file");
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    for (entry_path, bytes) in entries {
        zip.start_file(entry_path, options)
            .expect("start zip entry");
        zip.write_all(bytes).expect("write zip entry");
    }
    zip.finish().expect("finish zip");
}
