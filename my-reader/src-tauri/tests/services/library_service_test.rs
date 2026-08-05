use std::path::{Path, PathBuf};

use my_reader_lib::auth::test_support as credentials;
use my_reader_lib::models::{AppConfig, DataSourceConfig, DataSourceDetail, LibraryConfig};
use my_reader_lib::services::library_service::LibraryService;
use warp::Filter;

use crate::common::app::TestApp;
use crate::common::calibre::seed_minimal_calibre_library;

fn local_library(id: &str, path: &Path) -> LibraryConfig {
    LibraryConfig {
        library_type: Default::default(),
        id: id.into(),
        name: "Local".into(),
        path: path.to_string_lossy().to_string(),
        source_type: Some("local".into()),
        data_source_id: None,
        source_path: None,
    }
}

fn webdav_library(id: &str) -> LibraryConfig {
    LibraryConfig {
        library_type: Default::default(),
        id: id.into(),
        name: "WebDAV".into(),
        path: "/app-data/libraries/lib-webdav".into(),
        source_type: Some("webdav".into()),
        data_source_id: Some("ds-1".into()),
        source_path: Some("/books".into()),
    }
}

fn remote_library(
    id: &str,
    source_type: &str,
    data_source_id: Option<&str>,
    source_path: Option<&str>,
) -> LibraryConfig {
    LibraryConfig {
        library_type: Default::default(),
        id: id.into(),
        name: "Remote".into(),
        path: format!("/app-data/libraries/{id}"),
        source_type: Some(source_type.into()),
        data_source_id: data_source_id.map(str::to_string),
        source_path: source_path.map(str::to_string),
    }
}

fn webdav_data_source(id: &str, endpoint: &str) -> DataSourceConfig {
    let account = credentials::webdav_password_account(id);
    credentials::save_webdav_password(&account, "password").unwrap();
    DataSourceConfig {
        id: id.into(),
        name: "Remote Root".into(),
        enabled: true,
        detail: DataSourceDetail::Webdav {
            endpoint: endpoint.into(),
            username: "reader".into(),
            credential_account: Some(account),
            root_path: None,
        },
    }
}

fn start_webdav_file_server(metadata: Vec<u8>) -> std::net::SocketAddr {
    let route = warp::any().and(warp::method()).and(warp::path::full()).map(
        move |method: warp::http::Method, path: warp::path::FullPath| {
            if method == warp::http::Method::GET && path.as_str().ends_with("/metadata.db") {
                warp::http::Response::builder()
                    .status(200)
                    .body(metadata.clone())
                    .unwrap()
            } else {
                warp::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            }
        },
    );
    let (address, server) = warp::serve(route).bind_ephemeral(([127, 0, 0, 1], 0));
    tokio::spawn(server);
    address
}

#[tokio::test]
async fn list_libraries_should_include_book_count_and_source_fields() {
    let app_data = tempfile::tempdir().unwrap();
    let lib_root = tempfile::tempdir().unwrap();
    seed_minimal_calibre_library(lib_root.path()).await;
    let missing_root = tempfile::tempdir().unwrap();
    let config = AppConfig {
        libraries: vec![
            local_library("lib-ok", lib_root.path()),
            local_library("lib-missing-db", missing_root.path()),
        ],
        active_library_id: Some("lib-ok".into()),
        ..Default::default()
    };

    let infos = LibraryService::list_libraries(app_data.path(), &config)
        .await
        .expect("list should succeed");

    assert_eq!(infos.len(), 2);
    assert_eq!(infos[0].id, "lib-ok");
    assert_eq!(infos[0].book_count, 1);
    assert_eq!(infos[0].source_type.as_deref(), Some("local"));
    assert_eq!(infos[1].id, "lib-missing-db");
    assert_eq!(infos[1].book_count, 0);
}

#[tokio::test]
async fn add_library_should_validate_calibre_library_default_name_and_set_active_id() {
    let app_data = tempfile::tempdir().unwrap();
    let lib_root = tempfile::tempdir().unwrap();
    seed_minimal_calibre_library(lib_root.path()).await;
    let mut config = AppConfig::default();

    let info = LibraryService::add_library(
        app_data.path(),
        &lib_root.path().to_string_lossy(),
        None,
        &mut config,
    )
    .await
    .expect("add should succeed");

    assert_eq!(info.book_count, 1);
    assert_eq!(
        info.name,
        lib_root.path().file_name().unwrap().to_string_lossy()
    );
    assert_eq!(info.source_type.as_deref(), Some("local"));
    assert_eq!(config.libraries.len(), 1);
    assert_eq!(config.active_library_id.as_deref(), Some(info.id.as_str()));
}

#[tokio::test]
async fn add_library_should_reject_missing_metadata_and_duplicate_paths() {
    let app_data = tempfile::tempdir().unwrap();
    let lib_root = tempfile::tempdir().unwrap();
    seed_minimal_calibre_library(lib_root.path()).await;
    let missing_root = tempfile::tempdir().unwrap();
    let mut config = AppConfig::default();

    let err = LibraryService::add_library(
        app_data.path(),
        &missing_root.path().to_string_lossy(),
        Some("Missing"),
        &mut config,
    )
    .await
    .expect_err("missing metadata should fail");
    assert!(format!("{err}").contains("METADATA_DB_NOT_FOUND"));

    LibraryService::add_library(
        app_data.path(),
        &lib_root.path().to_string_lossy(),
        Some("First"),
        &mut config,
    )
    .await
    .expect("first add should succeed");
    let err = LibraryService::add_library(
        app_data.path(),
        &lib_root.path().to_string_lossy(),
        Some("Duplicate"),
        &mut config,
    )
    .await
    .expect_err("duplicate path should fail");

    assert!(format!("{err}").contains("LIBRARY_ALREADY_EXISTS"));
}

#[tokio::test]
async fn add_library_with_scope_sync_should_return_same_info_as_add_library() {
    let test_app = TestApp::new();
    let direct_app_data = tempfile::tempdir().unwrap();
    let wrapped_app_data = tempfile::tempdir().unwrap();
    let lib_root = tempfile::tempdir().unwrap();
    seed_minimal_calibre_library(lib_root.path()).await;
    let mut config = AppConfig::default();

    let mut config_without_sync = config.clone();
    let info_direct = LibraryService::add_library(
        direct_app_data.path(),
        &lib_root.path().to_string_lossy(),
        Some("Synced"),
        &mut config_without_sync,
    )
    .await
    .expect("direct add should succeed");

    let info_wrapped = LibraryService::add_library_with_scope_sync(
        test_app.app.handle(),
        wrapped_app_data.path(),
        &lib_root.path().to_string_lossy(),
        Some("Synced"),
        &mut config,
    )
    .await
    .expect("wrapped add should succeed");

    assert_eq!(info_direct.name, info_wrapped.name);
    assert_eq!(info_direct.path, info_wrapped.path);
    assert_eq!(info_direct.book_count, info_wrapped.book_count);
}

#[tokio::test]
async fn add_remote_library_should_download_metadata_from_data_source_and_set_active_id() {
    let _guard = credentials::use_test_backend(credentials::MemoryBackend::default());
    let app_data = tempfile::tempdir().unwrap();
    let remote_root = tempfile::tempdir().unwrap();
    let remote_library_root = remote_root.path().join("RemoteLibrary");
    tokio::fs::create_dir_all(&remote_library_root)
        .await
        .unwrap();
    seed_minimal_calibre_library(&remote_library_root).await;
    let address =
        start_webdav_file_server(std::fs::read(remote_library_root.join("metadata.db")).unwrap());
    let mut config = AppConfig {
        data_sources: vec![webdav_data_source(
            "ds-remote",
            &format!("http://{address}"),
        )],
        ..Default::default()
    };

    let webdav = LibraryService::add_webdav_library(
        app_data.path(),
        "ds-remote",
        "/RemoteLibrary",
        None,
        &mut config,
    )
    .await
    .expect("webdav add should succeed");
    assert_eq!(webdav.name, "RemoteLibrary");
    assert_eq!(webdav.book_count, 1);
    assert_eq!(webdav.source_type.as_deref(), Some("webdav"));
    assert_eq!(
        config.active_library_id.as_deref(),
        Some(webdav.id.as_str())
    );
    assert!(PathBuf::from(&webdav.path).join("metadata.db").is_file());
}

#[tokio::test]
async fn add_remote_library_should_reject_same_source_path_when_library_already_exists() {
    let _guard = credentials::use_test_backend(credentials::MemoryBackend::default());
    let app_data = tempfile::tempdir().unwrap();
    let mut config = AppConfig {
        libraries: vec![remote_library(
            "lib-webdav",
            "webdav",
            Some("ds-remote"),
            Some("/RemoteLibrary/"),
        )],
        data_sources: vec![webdav_data_source("ds-remote", "http://127.0.0.1:1")],
        ..Default::default()
    };

    let err = LibraryService::add_webdav_library(
        app_data.path(),
        "ds-remote",
        "RemoteLibrary",
        None,
        &mut config,
    )
    .await
    .expect_err("duplicate remote library should fail before download");

    assert!(format!("{err}").contains("LIBRARY_ALREADY_EXISTS"));
    assert_eq!(config.libraries.len(), 1);
}

#[tokio::test]
async fn add_remote_library_with_scope_sync_should_delegate_to_remote_add() {
    let _guard = credentials::use_test_backend(credentials::MemoryBackend::default());
    let test_app = TestApp::new();
    let app_data = tempfile::tempdir().unwrap();
    let remote_root = tempfile::tempdir().unwrap();
    let remote_library_root = remote_root.path().join("RemoteLibrary");
    tokio::fs::create_dir_all(&remote_library_root)
        .await
        .unwrap();
    seed_minimal_calibre_library(&remote_library_root).await;
    let address =
        start_webdav_file_server(std::fs::read(remote_library_root.join("metadata.db")).unwrap());
    let mut config = AppConfig {
        data_sources: vec![webdav_data_source(
            "ds-remote",
            &format!("http://{address}"),
        )],
        ..Default::default()
    };

    let webdav = LibraryService::add_webdav_library_with_scope_sync(
        test_app.app.handle(),
        app_data.path(),
        "ds-remote",
        "/RemoteLibrary",
        Some("Scoped WebDAV"),
        &mut config,
    )
    .await
    .expect("webdav scoped add should succeed");

    assert_eq!(webdav.name, "Scoped WebDAV");
    assert_eq!(webdav.book_count, 1);
}

#[tokio::test]
async fn add_remote_library_should_return_not_found_when_data_source_is_unknown() {
    let app_data = tempfile::tempdir().unwrap();
    let mut config = AppConfig::default();

    let err = LibraryService::add_webdav_library(
        app_data.path(),
        "missing",
        "/Library",
        None,
        &mut config,
    )
    .await
    .expect_err("unknown webdav source should fail");
    assert!(format!("{err}").contains("DATASOURCE_NOT_FOUND"));

    let err = LibraryService::add_onedrive_library(
        app_data.path(),
        "missing",
        "/Library",
        None,
        &mut config,
    )
    .await
    .expect_err("unknown onedrive source should fail");
    assert!(format!("{err}").contains("DATASOURCE_NOT_FOUND"));
}

#[tokio::test]
async fn refresh_library_should_return_updated_info_and_reject_remote_or_missing_libraries() {
    let app_data = tempfile::tempdir().unwrap();
    let lib_root = tempfile::tempdir().unwrap();
    seed_minimal_calibre_library(lib_root.path()).await;
    let mut config = AppConfig {
        libraries: vec![
            local_library("lib-local", lib_root.path()),
            webdav_library("lib-webdav"),
        ],
        active_library_id: Some("lib-local".into()),
        ..Default::default()
    };

    let info = LibraryService::refresh_library(app_data.path(), "lib-local", &config)
        .await
        .expect("refresh should succeed");
    assert_eq!(info.id, "lib-local");
    assert_eq!(info.book_count, 1);
    assert_eq!(
        PathBuf::from(&info.path),
        dunce::canonicalize(lib_root.path()).unwrap()
    );

    let err = LibraryService::refresh_library(app_data.path(), "lib-webdav", &config)
        .await
        .expect_err("sync refresh should reject webdav");
    assert!(format!("{err}").contains("WEBDAV_LIBRARY_USE_ASYNC_REFRESH"));

    config.libraries[0].path = "/definitely/not/exists".into();
    let err = LibraryService::refresh_library(app_data.path(), "lib-local", &config)
        .await
        .expect_err("invalid local path should fail");
    assert!(format!("{err}").contains("INVALID_LIBRARY_PATH"));

    let err = LibraryService::refresh_library(app_data.path(), "ghost", &config)
        .await
        .expect_err("unknown id should fail");
    assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));
}

#[tokio::test]
async fn refresh_remote_library_should_redownload_metadata_and_report_config_errors() {
    let _guard = credentials::use_test_backend(credentials::MemoryBackend::default());
    let app_data = tempfile::tempdir().unwrap();
    let remote_root = tempfile::tempdir().unwrap();
    let remote_library_root = remote_root.path().join("RemoteLibrary");
    tokio::fs::create_dir_all(&remote_library_root)
        .await
        .unwrap();
    seed_minimal_calibre_library(&remote_library_root).await;
    let address =
        start_webdav_file_server(std::fs::read(remote_library_root.join("metadata.db")).unwrap());
    let config = AppConfig {
        libraries: vec![
            remote_library(
                "lib-webdav",
                "webdav",
                Some("ds-remote"),
                Some("/RemoteLibrary"),
            ),
            remote_library("lib-webdav-no-ds", "webdav", None, Some("/RemoteLibrary")),
            remote_library("lib-webdav-no-path", "webdav", Some("ds-remote"), None),
            remote_library(
                "lib-unknown-ds",
                "webdav",
                Some("missing"),
                Some("/RemoteLibrary"),
            ),
        ],
        data_sources: vec![webdav_data_source(
            "ds-remote",
            &format!("http://{address}"),
        )],
        ..Default::default()
    };

    let webdav = LibraryService::refresh_webdav_library(app_data.path(), "lib-webdav", &config)
        .await
        .expect("webdav refresh should succeed");
    assert_eq!(webdav.name, "Remote");
    assert_eq!(webdav.book_count, 1);
    assert!(app_data
        .path()
        .join("libraries/lib-webdav/metadata.db")
        .is_file());

    for (id, expected) in [
        ("lib-webdav-no-ds", "REMOTE_LIBRARY_MISSING_DATASOURCE"),
        ("lib-webdav-no-path", "REMOTE_LIBRARY_MISSING_SOURCE_PATH"),
        ("lib-unknown-ds", "DATASOURCE_NOT_FOUND"),
    ] {
        let err = LibraryService::refresh_webdav_library(app_data.path(), id, &config)
            .await
            .expect_err("webdav refresh should fail");
        assert!(format!("{err}").contains(expected));
    }

    let err = LibraryService::refresh_webdav_library(app_data.path(), "ghost", &config)
        .await
        .expect_err("unknown webdav library should fail");
    assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));

    let err = LibraryService::refresh_onedrive_library(app_data.path(), "ghost", &config)
        .await
        .expect_err("unknown onedrive library should fail");
    assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));
}

#[test]
fn remove_library_should_remove_config_container_cache_and_update_active_library() {
    let app_data = tempfile::tempdir().unwrap();
    let local_root = tempfile::tempdir().unwrap();
    let container = app_data.path().join("libraries").join("lib-a");
    std::fs::create_dir_all(&container).expect("create library container");
    let mut config = AppConfig {
        libraries: vec![
            local_library("lib-a", local_root.path()),
            local_library("lib-b", local_root.path()),
        ],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    };

    LibraryService::remove_library(app_data.path(), "lib-a", &mut config)
        .expect("remove should succeed");

    assert_eq!(config.libraries.len(), 1);
    assert_eq!(config.libraries[0].id, "lib-b");
    assert_eq!(config.active_library_id.as_deref(), Some("lib-b"));
    assert!(!container.exists());
}

#[test]
fn switch_library_should_update_active_id_and_reject_unknown_library() {
    let root = tempfile::tempdir().unwrap();
    let mut config = AppConfig {
        libraries: vec![
            local_library("lib-a", root.path()),
            local_library("lib-b", root.path()),
        ],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    };

    LibraryService::switch_library(root.path(), "lib-b", &mut config)
        .expect("switch should succeed");
    assert_eq!(config.active_library_id.as_deref(), Some("lib-b"));

    let err = LibraryService::switch_library(root.path(), "ghost", &mut config)
        .expect_err("unknown library should fail");
    assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));
}

#[test]
fn resolve_library_path_should_handle_active_explicit_local_remote_and_missing_ids() {
    let app_data = PathBuf::from("/app-data");
    let local_root = PathBuf::from("/users/wen/books");
    let config = AppConfig {
        libraries: vec![
            local_library("lib-local", &local_root),
            webdav_library("lib-webdav"),
        ],
        active_library_id: Some("lib-local".into()),
        ..Default::default()
    };

    let (id, path) = LibraryService::resolve_library_path(None, &app_data, &config).unwrap();
    assert_eq!(id, "lib-local");
    assert_eq!(PathBuf::from(path), local_root);

    let (id, path) =
        LibraryService::resolve_library_path(Some("lib-webdav"), &app_data, &config).unwrap();
    assert_eq!(id, "lib-webdav");
    assert_eq!(
        PathBuf::from(path),
        app_data.join("libraries").join("lib-webdav")
    );

    let err = LibraryService::resolve_library_path(Some("ghost"), &app_data, &config)
        .expect_err("unknown library should fail");
    assert!(format!("{err}").contains("LIBRARY_NOT_FOUND"));

    let empty_config = AppConfig::default();
    let err = LibraryService::resolve_library_path(None, &app_data, &empty_config)
        .expect_err("missing active library should fail");
    assert!(format!("{err}").contains("NO_ACTIVE_LIBRARY"));
}

#[test]
fn resolve_library_should_return_config_by_active_or_explicit_id() {
    let root = tempfile::tempdir().unwrap();
    let config = AppConfig {
        libraries: vec![
            local_library("lib-a", root.path()),
            local_library("lib-b", root.path()),
        ],
        active_library_id: Some("lib-a".into()),
        ..Default::default()
    };

    let active = LibraryService::resolve_library(None, &config).expect("active should resolve");
    let explicit =
        LibraryService::resolve_library(Some("lib-b"), &config).expect("explicit should resolve");

    assert_eq!(active.id, "lib-a");
    assert_eq!(explicit.id, "lib-b");
}
