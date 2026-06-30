use my_reader_lib::models::{AppConfig, DataSourceConfig, DataSourceDetail, LibraryConfig};
use my_reader_lib::repositories::file_state_repo::SqliteFileStateRepository;
use my_reader_lib::services::download_service::DownloadService;
use opendal::services::Fs;
use opendal::Operator;
use tokio::sync::watch;

use crate::common::app::TestApp;
use crate::common::calibre::seed_minimal_calibre_library;

fn local_test_library(id: &str, root: &std::path::Path) -> LibraryConfig {
    LibraryConfig {
        id: id.into(),
        name: "Test".into(),
        path: root.to_string_lossy().to_string(),
        source_type: Some("local".into()),
        data_source_id: None,
        source_path: None,
    }
}

fn remote_test_library(id: &str) -> LibraryConfig {
    LibraryConfig {
        id: id.into(),
        name: "Remote".into(),
        path: "".into(),
        source_type: Some("webdav".into()),
        data_source_id: Some("ds-remote".into()),
        source_path: None,
    }
}

fn library_container_dir(app_data_dir: &std::path::Path, library_id: &str) -> std::path::PathBuf {
    app_data_dir.join("libraries").join(library_id)
}

#[tokio::test]
async fn is_book_file_present_should_require_existing_non_empty_file() {
    let dir = tempfile::tempdir().unwrap();
    let present = dir.path().join("book.epub");
    let empty = dir.path().join("empty.epub");
    let missing = dir.path().join("missing.epub");
    tokio::fs::write(&present, b"hello").await.unwrap();
    tokio::fs::write(&empty, b"").await.unwrap();

    assert!(DownloadService::is_book_file_present(&present).await);
    assert!(!DownloadService::is_book_file_present(&empty).await);
    assert!(!DownloadService::is_book_file_present(&missing).await);
}

#[test]
fn download_state_should_deduplicate_cancel_and_finish_by_key() {
    let service = DownloadService::new();
    assert!(service.start("lib", 1, "EPUB").is_some());
    assert!(service.start("lib", 1, "EPUB").is_none());
    assert!(service.is_active("lib", 1, "EPUB"));

    service.finish("lib", 1, "EPUB");
    assert!(service.start("lib", 1, "EPUB").is_some());

    let service = DownloadService::new();
    assert!(service.cancel("lib", 1, "EPUB"));
    assert!(service.cancel("lib", 1, "EPUB"));
    let rx = service.start("lib", 1, "EPUB").unwrap();
    assert!(*rx.borrow());

    let service = DownloadService::new();
    let clone = service.clone();
    let rx = service.start("lib", 2, "PDF").unwrap();
    assert!(clone.cancel("lib", 2, "PDF"));
    assert!(*rx.borrow());
}

#[test]
fn default_should_create_service_without_active_downloads() {
    let service = DownloadService::default();

    assert!(!service.is_active("lib", 1, "EPUB"));
}

#[tokio::test]
async fn build_operator_for_library_should_build_local_operator_or_report_missing_source() {
    let dir = tempfile::tempdir().unwrap();
    let config = AppConfig {
        data_sources: vec![DataSourceConfig {
            id: "ds-local".into(),
            name: "Local".into(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: dir.path().to_string_lossy().to_string(),
            },
        }],
        ..Default::default()
    };
    let lib = LibraryConfig {
        id: "lib".into(),
        name: "Test".into(),
        path: "".into(),
        source_type: Some("local".into()),
        data_source_id: Some("ds-local".into()),
        source_path: None,
    };

    let op = DownloadService::build_operator_for_library(&lib, &config)
        .await
        .expect("operator should build");
    op.write("test.txt", b"hello".to_vec()).await.unwrap();
    assert_eq!(op.read("test.txt").await.unwrap().to_vec(), b"hello");

    let missing_source = LibraryConfig {
        data_source_id: Some("missing".into()),
        ..lib
    };
    let err = DownloadService::build_operator_for_library(&missing_source, &AppConfig::default())
        .await
        .unwrap_err();
    assert!(format!("{err}").contains("DATASOURCE_NOT_FOUND"));

    let missing_source_id = LibraryConfig {
        data_source_id: None,
        ..remote_test_library("lib-missing-source-id")
    };
    let err = DownloadService::build_operator_for_library(&missing_source_id, &config)
        .await
        .unwrap_err();
    assert!(format!("{err}").contains("REMOTE_LIBRARY_MISSING_DATASOURCE"));
}

#[tokio::test]
async fn resolve_book_file_path_should_return_path_and_not_found_errors() {
    let lib_root = tempfile::tempdir().unwrap();
    let seeded = seed_minimal_calibre_library(lib_root.path()).await;
    let lib = local_test_library("lib-resolve", lib_root.path());

    let path = DownloadService::resolve_book_file_path(
        lib_root.path(),
        &lib,
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("resolve should succeed");
    assert_eq!(path, seeded.file_path);

    let err = DownloadService::resolve_book_file_path(lib_root.path(), &lib, 9999, &seeded.format)
        .await
        .expect_err("missing book should fail");
    assert!(format!("{err}").contains("BOOK_FORMAT_NOT_FOUND"));

    let err = DownloadService::resolve_book_file_path(lib_root.path(), &lib, seeded.book_id, "PDF")
        .await
        .expect_err("missing format should fail");
    assert!(format!("{err}").contains("BOOK_FORMAT_NOT_FOUND"));
}

#[tokio::test]
async fn check_file_state_should_cover_local_present_missing_and_sidecar_size() {
    let lib_root = tempfile::tempdir().unwrap();
    let app_data = tempfile::tempdir().unwrap();
    let seeded = seed_minimal_calibre_library(lib_root.path()).await;
    let lib = local_test_library("lib-state", lib_root.path());
    let config = AppConfig {
        libraries: vec![lib.clone()],
        ..Default::default()
    };

    let dto = DownloadService::check_file_state(
        app_data.path(),
        &config,
        "lib-state",
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("check should succeed");
    assert_eq!(dto.local_state, "present");
    assert_eq!(dto.path, "It/It.epub");

    let sidecar_root = library_container_dir(app_data.path(), &lib.id);
    let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy())
        .await
        .expect("open sidecar db");
    SqliteFileStateRepository::upsert(&db, "It/It.epub", "present", Some(12345), None)
        .await
        .expect("upsert state");
    let dto = DownloadService::check_file_state(
        app_data.path(),
        &config,
        "lib-state",
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("check should succeed");
    assert_eq!(dto.local_size, Some(12345));

    tokio::fs::remove_file(&seeded.file_path).await.unwrap();
    let dto = DownloadService::check_file_state(
        app_data.path(),
        &config,
        "lib-state",
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("check should succeed");
    assert_eq!(dto.local_state, "remote_only");
    assert!(dto.local_size.is_none());
}

#[tokio::test]
async fn check_file_state_should_require_present_sidecar_row_for_remote_libraries() {
    let app_data = tempfile::tempdir().unwrap();
    let lib = remote_test_library("lib-state-remote");
    let lib_root = library_container_dir(app_data.path(), &lib.id);
    tokio::fs::create_dir_all(&lib_root).await.unwrap();
    let seeded = seed_minimal_calibre_library(&lib_root).await;
    let config = AppConfig {
        libraries: vec![lib.clone()],
        ..Default::default()
    };

    let dto = DownloadService::check_file_state(
        app_data.path(),
        &config,
        &lib.id,
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("check should succeed");
    assert_eq!(dto.local_state, "remote_only");

    let sidecar_root = library_container_dir(app_data.path(), &lib.id);
    let db = SqliteFileStateRepository::open(&sidecar_root.to_string_lossy())
        .await
        .expect("open sidecar db");
    SqliteFileStateRepository::upsert(&db, "It/It.epub", "present", Some(12), None)
        .await
        .expect("upsert state");

    let dto = DownloadService::check_file_state(
        app_data.path(),
        &config,
        &lib.id,
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("check should succeed");
    assert_eq!(dto.local_state, "present");
    assert_eq!(dto.local_size, Some(12));

    SqliteFileStateRepository::upsert(&db, "It/It.epub", "remote_only", None, None)
        .await
        .expect("upsert state");
    let dto = DownloadService::check_file_state(
        app_data.path(),
        &config,
        &lib.id,
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("check should succeed");
    assert_eq!(dto.local_state, "remote_only");
}

#[tokio::test]
async fn check_file_state_with_active_download_should_overlay_downloading_state() {
    let app_data = tempfile::tempdir().unwrap();
    let lib = remote_test_library("lib-active-state");
    let lib_root = library_container_dir(app_data.path(), &lib.id);
    tokio::fs::create_dir_all(&lib_root).await.unwrap();
    let seeded = seed_minimal_calibre_library(&lib_root).await;
    tokio::fs::remove_file(&seeded.file_path).await.unwrap();
    let config = AppConfig {
        libraries: vec![lib.clone()],
        ..Default::default()
    };
    let service = DownloadService::new();
    let _rx = service
        .start(&lib.id, seeded.book_id, &seeded.format)
        .unwrap();

    let dto = service
        .check_file_state_with_active_download(
            app_data.path(),
            &config,
            &lib.id,
            seeded.book_id,
            &seeded.format,
        )
        .await
        .expect("check should succeed");

    assert_eq!(dto.local_state, "downloading");
}

#[tokio::test]
async fn delete_local_file_should_remove_remote_copy_and_reject_local_library() {
    let app_data = tempfile::tempdir().unwrap();
    let lib = remote_test_library("lib-delete");
    let lib_root = library_container_dir(app_data.path(), &lib.id);
    tokio::fs::create_dir_all(&lib_root).await.unwrap();
    let seeded = seed_minimal_calibre_library(&lib_root).await;
    let db = SqliteFileStateRepository::open(&lib_root.to_string_lossy())
        .await
        .expect("open sidecar db");
    SqliteFileStateRepository::upsert(&db, "It/It.epub", "present", Some(12), None)
        .await
        .expect("upsert state");

    let config = AppConfig {
        libraries: vec![lib.clone()],
        ..Default::default()
    };
    DownloadService::delete_local_file(
        app_data.path(),
        &config,
        &lib.id,
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("delete should succeed");

    assert!(!tokio::fs::try_exists(&seeded.file_path).await.unwrap());
    let row = SqliteFileStateRepository::get_by_path(&db, "It/It.epub")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.local_state, "remote_only");
    assert!(row.local_size.is_none());

    let local_root = tempfile::tempdir().unwrap();
    let local_seeded = seed_minimal_calibre_library(local_root.path()).await;
    let local_config = AppConfig {
        libraries: vec![local_test_library("lib-delete-local", local_root.path())],
        ..Default::default()
    };
    let err = DownloadService::delete_local_file(
        app_data.path(),
        &local_config,
        "lib-delete-local",
        local_seeded.book_id,
        &local_seeded.format,
    )
    .await
    .expect_err("local library deletion should be rejected");
    assert!(format!("{err}").contains("LOCAL_LIBRARY_FILE_ACTION_NOT_ALLOWED"));
    assert!(tokio::fs::try_exists(&local_seeded.file_path)
        .await
        .unwrap());
}

#[tokio::test]
async fn delete_local_book_file_should_emit_status_after_removing_remote_copy() {
    let test_app = TestApp::new();
    let app_data = tempfile::tempdir().unwrap();
    let lib = remote_test_library("lib-delete-wrapper");
    let lib_root = library_container_dir(app_data.path(), &lib.id);
    tokio::fs::create_dir_all(&lib_root).await.unwrap();
    let seeded = seed_minimal_calibre_library(&lib_root).await;
    let db = SqliteFileStateRepository::open(&lib_root.to_string_lossy())
        .await
        .expect("open sidecar db");
    SqliteFileStateRepository::upsert(&db, "It/It.epub", "present", Some(12), None)
        .await
        .expect("upsert state");
    let config = AppConfig {
        libraries: vec![lib.clone()],
        ..Default::default()
    };

    DownloadService::delete_local_book_file(
        test_app.app.handle(),
        app_data.path(),
        &config,
        &lib.id,
        seeded.book_id,
        &seeded.format,
    )
    .await
    .expect("delete wrapper should succeed");

    assert!(!tokio::fs::try_exists(&seeded.file_path).await.unwrap());
}

#[test]
fn cancel_book_download_should_signal_remote_download_and_reject_local_library() {
    let test_app = TestApp::new();
    let service = DownloadService::new();
    let remote_config = AppConfig {
        libraries: vec![remote_test_library("lib-cancel")],
        ..Default::default()
    };
    let rx = service.start("lib-cancel", 42, "EPUB").unwrap();

    let cancelled = service
        .cancel_book_download(
            test_app.app.handle(),
            &remote_config,
            "lib-cancel",
            42,
            "epub",
        )
        .expect("cancel should succeed");

    assert!(cancelled);
    assert!(*rx.borrow());

    let local_root = tempfile::tempdir().unwrap();
    let local_config = AppConfig {
        libraries: vec![local_test_library("lib-local", local_root.path())],
        ..Default::default()
    };
    let err = service
        .cancel_book_download(
            test_app.app.handle(),
            &local_config,
            "lib-local",
            42,
            "EPUB",
        )
        .expect_err("local cancel should fail");
    assert!(format!("{err}").contains("LOCAL_LIBRARY_FILE_ACTION_NOT_ALLOWED"));
}

#[test]
fn cancel_book_download_should_record_pending_cancel_when_no_download_is_active() {
    let test_app = TestApp::new();
    let service = DownloadService::new();
    let config = AppConfig {
        libraries: vec![remote_test_library("lib-cancel-missing")],
        ..Default::default()
    };

    let cancelled = service
        .cancel_book_download(
            test_app.app.handle(),
            &config,
            "lib-cancel-missing",
            42,
            "epub",
        )
        .expect("remote cancel should succeed");

    assert!(cancelled);
    let rx = service.start("lib-cancel-missing", 42, "EPUB").unwrap();
    assert!(*rx.borrow());
}

#[tokio::test]
async fn enqueue_and_execute_download_should_reject_local_libraries_without_leaking_active_state() {
    let test_app = TestApp::new();
    let service = DownloadService::new();
    let app_data = tempfile::tempdir().unwrap();
    let lib_root = tempfile::tempdir().unwrap();
    let seeded = seed_minimal_calibre_library(lib_root.path()).await;
    let config = AppConfig {
        libraries: vec![local_test_library("lib-local-enqueue", lib_root.path())],
        ..Default::default()
    };

    let err = service
        .enqueue_book_file_download(
            test_app.app.handle(),
            app_data.path(),
            &config,
            "lib-local-enqueue",
            seeded.book_id,
            &seeded.format,
        )
        .await
        .expect_err("local library download should be rejected");
    assert!(format!("{err}").contains("LOCAL_LIBRARY_FILE_ACTION_NOT_ALLOWED"));
    assert!(!service.is_active("lib-local-enqueue", seeded.book_id, &seeded.format));

    let (_tx, rx) = watch::channel(false);
    let err = DownloadService::execute_download(
        test_app.app.handle(),
        app_data.path(),
        &config,
        "lib-local-enqueue",
        seeded.book_id,
        &seeded.format,
        rx,
    )
    .await
    .expect_err("local library download should be rejected");
    assert!(format!("{err}").contains("LOCAL_LIBRARY_FILE_ACTION_NOT_ALLOWED"));
}

#[tokio::test]
async fn enqueue_book_file_download_should_return_empty_when_key_is_already_active() {
    let test_app = TestApp::new();
    let service = DownloadService::new();
    let app_data = tempfile::tempdir().unwrap();
    let config = AppConfig::default();
    let _rx = service.start("lib", 1, "EPUB").unwrap();

    let result = service
        .enqueue_book_file_download(
            test_app.app.handle(),
            app_data.path(),
            &config,
            "lib",
            1,
            "epub",
        )
        .await
        .expect("already-active download should be a no-op");

    assert_eq!(result, "");
}

#[tokio::test]
async fn enqueue_book_file_download_should_spawn_remote_download_and_finish_active_state() {
    let test_app = TestApp::new();
    let service = DownloadService::new();
    let original_root = tempfile::tempdir().unwrap();
    let app_data = tempfile::tempdir().unwrap();
    let book_dir = original_root.path().join("It");
    tokio::fs::create_dir_all(&book_dir).await.unwrap();
    tokio::fs::write(book_dir.join("It.epub"), b"remote book content")
        .await
        .unwrap();

    let lib = remote_test_library("lib-enqueue-remote");
    let container_root = library_container_dir(app_data.path(), &lib.id);
    tokio::fs::create_dir_all(&container_root).await.unwrap();
    let seeded = seed_minimal_calibre_library(&container_root).await;
    tokio::fs::remove_file(&seeded.file_path).await.unwrap();
    let config = AppConfig {
        libraries: vec![lib.clone()],
        data_sources: vec![DataSourceConfig {
            id: "ds-remote".into(),
            name: "Remote".into(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: original_root.path().to_string_lossy().to_string(),
            },
        }],
        ..Default::default()
    };

    let result = service
        .enqueue_book_file_download(
            test_app.app.handle(),
            app_data.path(),
            &config,
            &lib.id,
            seeded.book_id,
            &seeded.format,
        )
        .await
        .expect("enqueue should succeed");
    assert_eq!(result, "");

    let downloaded = container_root.join("It/It.epub");
    for _ in 0..100 {
        if tokio::fs::try_exists(&downloaded).await.unwrap()
            && !service.is_active(&lib.id, seeded.book_id, &seeded.format)
        {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }

    assert!(tokio::fs::try_exists(&downloaded).await.unwrap());
    assert_eq!(
        tokio::fs::read(&downloaded).await.unwrap(),
        b"remote book content"
    );
    assert!(!service.is_active(&lib.id, seeded.book_id, &seeded.format));
}

#[tokio::test]
async fn execute_download_should_download_remote_file_into_container_and_record_state() {
    let test_app = TestApp::new();
    let original_root = tempfile::tempdir().unwrap();
    let app_data = tempfile::tempdir().unwrap();

    let book_dir = original_root.path().join("It");
    tokio::fs::create_dir_all(&book_dir).await.unwrap();
    tokio::fs::write(book_dir.join("It.epub"), b"remote book content")
        .await
        .unwrap();

    let lib = remote_test_library("lib-remote-dl");
    let container_root = library_container_dir(app_data.path(), &lib.id);
    tokio::fs::create_dir_all(&container_root).await.unwrap();
    let seeded = seed_minimal_calibre_library(&container_root).await;
    tokio::fs::remove_file(&seeded.file_path).await.unwrap();

    let config = AppConfig {
        libraries: vec![lib.clone()],
        data_sources: vec![DataSourceConfig {
            id: "ds-remote".into(),
            name: "Remote".into(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: original_root.path().to_string_lossy().to_string(),
            },
        }],
        ..Default::default()
    };

    let (_tx, rx) = watch::channel(false);
    DownloadService::execute_download(
        test_app.app.handle(),
        app_data.path(),
        &config,
        &lib.id,
        seeded.book_id,
        &seeded.format,
        rx,
    )
    .await
    .expect("execute_download should succeed");

    let downloaded = container_root.join("It/It.epub");
    assert!(tokio::fs::try_exists(&downloaded).await.unwrap());
    assert_eq!(
        tokio::fs::read(&downloaded).await.unwrap(),
        b"remote book content"
    );

    let db = SqliteFileStateRepository::open(&container_root.to_string_lossy())
        .await
        .expect("open sidecar db");
    let row = SqliteFileStateRepository::get_by_path(&db, "It/It.epub")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.local_state, "present");
    assert_eq!(row.local_size, Some(19));
}

#[tokio::test]
async fn download_book_file_should_copy_remote_content_and_reset_state_on_error() {
    let test_app = TestApp::new();
    let remote_root = tempfile::tempdir().unwrap();
    let sidecar_root = tempfile::tempdir().unwrap();
    let local_root = tempfile::tempdir().unwrap();
    let op = fs_operator(remote_root.path());
    let large_remote_content = vec![7u8; 300 * 1024];
    op.write("Library/It/It.epub", large_remote_content.clone())
        .await
        .unwrap();
    let local_path = local_root.path().join("It/It.epub");

    DownloadService::download_book_file(
        test_app.app.handle(),
        &op,
        Some("/Library"),
        &local_path,
        "It/It.epub",
        "lib-direct",
        42,
        "EPUB",
        sidecar_root.path(),
        None,
    )
    .await
    .expect("download should succeed");
    assert_eq!(
        tokio::fs::read(&local_path).await.unwrap(),
        large_remote_content
    );

    let db = SqliteFileStateRepository::open(&sidecar_root.path().to_string_lossy())
        .await
        .expect("open sidecar db");
    let row = SqliteFileStateRepository::get_by_path(&db, "It/It.epub")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.local_state, "present");

    let missing_path = local_root.path().join("Missing/It.epub");
    let err = DownloadService::download_book_file(
        test_app.app.handle(),
        &op,
        Some("/Library"),
        &missing_path,
        "Missing/It.epub",
        "lib-direct",
        43,
        "EPUB",
        sidecar_root.path(),
        None,
    )
    .await
    .expect_err("missing remote file should fail");
    let message = format!("{err}");
    assert!(
        message.contains("REMOTE_BOOK_FILE_OPEN_FAILED")
            || message.contains("REMOTE_BOOK_FILE_READER_FAILED"),
        "message was {message}"
    );
    let row = SqliteFileStateRepository::get_by_path(&db, "Missing/It.epub")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.local_state, "remote_only");
}

#[tokio::test]
async fn download_book_file_should_skip_remote_read_when_sidecar_and_file_are_present() {
    let test_app = TestApp::new();
    let remote_root = tempfile::tempdir().unwrap();
    let sidecar_root = tempfile::tempdir().unwrap();
    let local_root = tempfile::tempdir().unwrap();
    let op = fs_operator(remote_root.path());
    let local_path = local_root.path().join("It/It.epub");
    tokio::fs::create_dir_all(local_path.parent().unwrap())
        .await
        .unwrap();
    tokio::fs::write(&local_path, b"cached").await.unwrap();
    let db = SqliteFileStateRepository::open(&sidecar_root.path().to_string_lossy())
        .await
        .expect("open sidecar db");
    SqliteFileStateRepository::upsert(&db, "It/It.epub", "present", Some(6), None)
        .await
        .expect("upsert state");

    let path = DownloadService::download_book_file(
        test_app.app.handle(),
        &op,
        Some("/Library"),
        &local_path,
        "It/It.epub",
        "lib-direct",
        42,
        "EPUB",
        sidecar_root.path(),
        None,
    )
    .await
    .expect("present file should skip download");

    assert_eq!(path, local_path);
    assert_eq!(tokio::fs::read(&local_path).await.unwrap(), b"cached");
}

#[tokio::test]
async fn download_book_file_should_cancel_before_open_and_mark_remote_only() {
    let test_app = TestApp::new();
    let remote_root = tempfile::tempdir().unwrap();
    let sidecar_root = tempfile::tempdir().unwrap();
    let local_root = tempfile::tempdir().unwrap();
    let op = fs_operator(remote_root.path());
    op.write("It/It.epub", b"remote".to_vec()).await.unwrap();
    let local_path = local_root.path().join("It/It.epub");
    let (tx, rx) = watch::channel(false);
    tx.send(true).unwrap();

    let err = DownloadService::download_book_file(
        test_app.app.handle(),
        &op,
        None,
        &local_path,
        "It/It.epub",
        "lib-cancel-direct",
        42,
        "EPUB",
        sidecar_root.path(),
        Some(rx),
    )
    .await
    .expect_err("cancelled download should fail");

    assert!(format!("{err}").contains("BOOK_DOWNLOAD_CANCELLED"));
    assert!(!tokio::fs::try_exists(&local_path).await.unwrap());
    let db = SqliteFileStateRepository::open(&sidecar_root.path().to_string_lossy())
        .await
        .expect("open sidecar db");
    let row = SqliteFileStateRepository::get_by_path(&db, "It/It.epub")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.local_state, "remote_only");
}

fn fs_operator(root: &std::path::Path) -> Operator {
    let builder = Fs::default().root(root.to_string_lossy().as_ref());
    Operator::new(builder).unwrap().finish()
}
