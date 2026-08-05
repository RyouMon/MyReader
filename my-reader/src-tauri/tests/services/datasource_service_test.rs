use my_reader_lib::auth::test_support as credentials;
use my_reader_lib::models::{AppConfig, DataSourceConfig, DataSourceDetail};
use my_reader_lib::services::datasource_service::DataSourceService;
use warp::Filter;

#[test]
fn list_data_sources_should_return_dto_list_when_sources_exist() {
    let mut config = AppConfig::default();
    config.data_sources.push(DataSourceConfig {
        id: "ds-1".to_string(),
        name: "Local".to_string(),
        enabled: true,
        detail: DataSourceDetail::Local {
            root_path: "/tmp".to_string(),
        },
    });

    let dtos = DataSourceService::list_data_sources(&config);

    assert_eq!(dtos.len(), 1);
    assert_eq!(dtos[0].name, "Local");
}

#[test]
fn add_local_data_source_should_validate_path_deduplicate_and_remove() {
    let mut config = AppConfig::default();
    config.data_sources.push(DataSourceConfig {
        id: "webdav-existing".into(),
        name: "Existing WebDAV".into(),
        enabled: true,
        detail: DataSourceDetail::Webdav {
            endpoint: "http://dav.example.com".into(),
            username: "user".into(),
            credential_account: None,
            root_path: None,
        },
    });
    let temp = tempfile::tempdir().unwrap();
    let config_path = temp.path().join("config.json");
    let file_path = temp.path().join("not-a-directory");
    std::fs::write(&file_path, b"file").unwrap();

    let err = DataSourceService::add_local_data_source(
        "",
        temp.path().to_str().unwrap(),
        &config_path,
        &mut config,
    )
    .unwrap_err();
    assert!(format!("{err}").contains("DATASOURCE_NAME_REQUIRED"));

    let err = DataSourceService::add_local_data_source("Name", "", &config_path, &mut config)
        .unwrap_err();
    assert!(format!("{err}").contains("LOCAL_ROOT_PATH_REQUIRED"));

    let err = DataSourceService::add_local_data_source(
        "Name",
        "/definitely/not/exists",
        &config_path,
        &mut config,
    )
    .unwrap_err();
    assert!(format!("{err}").contains("INVALID_DATASOURCE_PATH"));

    let err = DataSourceService::add_local_data_source(
        "Name",
        &file_path.to_string_lossy(),
        &config_path,
        &mut config,
    )
    .unwrap_err();
    assert!(format!("{err}").contains("DATASOURCE_PATH_NOT_DIR"));

    let first = DataSourceService::add_local_data_source(
        "First",
        temp.path().to_str().unwrap(),
        &config_path,
        &mut config,
    )
    .expect("local datasource should be added");
    let err = DataSourceService::add_local_data_source(
        "Second",
        temp.path().to_str().unwrap(),
        &config_path,
        &mut config,
    )
    .unwrap_err();
    assert!(format!("{err}").contains("LOCAL_DATASOURCE_ALREADY_EXISTS"));
    assert_eq!(config.data_sources.len(), 2);
    assert_eq!(first.name, "First");

    DataSourceService::remove_data_source(&first.id, &config_path, &mut config)
        .expect("remove should succeed");
    assert_eq!(config.data_sources.len(), 1);

    let err =
        DataSourceService::remove_data_source("missing", &config_path, &mut config).unwrap_err();
    assert!(format!("{err}").contains("DATASOURCE_NOT_FOUND"));
}

#[test]
fn add_webdav_data_source_should_validate_deduplicate_store_and_delete_password() {
    let _guard = credentials::use_test_backend(credentials::MemoryBackend::default());
    let state_dir = tempfile::tempdir().unwrap();
    let config_path = state_dir.path().join("config.json");
    let mut config = AppConfig::default();
    config.data_sources.push(DataSourceConfig {
        id: "local-existing".into(),
        name: "Existing Local".into(),
        enabled: true,
        detail: DataSourceDetail::Local {
            root_path: "/tmp".into(),
        },
    });

    for (name, endpoint, username, password, expected) in [
        ("", "http://dav", "user", "pass", "DATASOURCE_NAME_REQUIRED"),
        ("WebDAV", "", "user", "pass", "WEBDAV_ENDPOINT_REQUIRED"),
        (
            "WebDAV",
            "http://dav",
            "",
            "pass",
            "WEBDAV_USERNAME_REQUIRED",
        ),
        (
            "WebDAV",
            "http://dav",
            "user",
            "",
            "WEBDAV_PASSWORD_REQUIRED",
        ),
    ] {
        let err = DataSourceService::add_webdav_data_source(
            name,
            endpoint,
            username,
            password,
            None,
            &config_path,
            &mut config,
        )
        .unwrap_err();
        assert!(format!("{err}").contains(expected));
    }

    let dto = DataSourceService::add_webdav_data_source(
        "WebDAV",
        "http://dav.example.com",
        "user",
        "pass",
        Some("/books"),
        &config_path,
        &mut config,
    )
    .expect("webdav datasource should be added");

    assert_eq!(dto.name, "WebDAV");
    assert_eq!(config.data_sources.len(), 2);

    let account = credentials::webdav_password_account(&dto.id);
    assert_eq!(
        credentials::read_webdav_password(&account).unwrap(),
        Some("pass".to_string())
    );

    let err = DataSourceService::add_webdav_data_source(
        "Duplicate",
        "http://dav.example.com",
        "user",
        "pass2",
        None,
        &config_path,
        &mut config,
    )
    .unwrap_err();
    assert!(format!("{err}").contains("WEBDAV_DATASOURCE_ALREADY_EXISTS"));

    DataSourceService::remove_data_source(&dto.id, &config_path, &mut config)
        .expect("remove should succeed");
    assert_eq!(config.data_sources.len(), 1);
    assert_eq!(credentials::read_webdav_password(&account).unwrap(), None);
}

#[test]
fn add_onedrive_data_source_should_validate_store_and_delete_refresh_token() {
    let _guard = credentials::use_test_backend(credentials::MemoryBackend::default());
    let state_dir = tempfile::tempdir().unwrap();
    let config_path = state_dir.path().join("config.json");
    let mut config = AppConfig::default();

    let err = DataSourceService::add_onedrive_data_source(
        "",
        None,
        None,
        None,
        None,
        None,
        Some("rt"),
        &config_path,
        &mut config,
    )
    .unwrap_err();
    assert!(format!("{err}").contains("DATASOURCE_NAME_REQUIRED"));

    let err = DataSourceService::add_onedrive_data_source(
        "OneDrive",
        None,
        None,
        None,
        None,
        None,
        None,
        &config_path,
        &mut config,
    )
    .unwrap_err();
    assert!(format!("{err}").contains("ONEDRIVE_REFRESH_TOKEN_REQUIRED"));

    let dto = DataSourceService::add_onedrive_data_source(
        "OneDrive",
        None,
        None,
        Some("/Books"),
        Some("Wen Liang"),
        Some("wen@example.com"),
        Some("refresh-token"),
        &config_path,
        &mut config,
    )
    .expect("onedrive datasource should be added");

    assert_eq!(dto.name, "OneDrive");
    assert_eq!(config.data_sources.len(), 1);
    assert_eq!(
        credentials::read_onedrive_refresh_token(&dto.id).unwrap(),
        Some("refresh-token".to_string())
    );

    DataSourceService::remove_data_source(&dto.id, &config_path, &mut config)
        .expect("remove should succeed");
    assert!(config.data_sources.is_empty());
    assert_eq!(
        credentials::read_onedrive_refresh_token(&dto.id).unwrap(),
        None
    );
}

#[tokio::test]
async fn test_webdav_connection_should_validate_inputs_and_map_server_status() {
    let err = DataSourceService::test_webdav_connection("", "user", "pass", None)
        .await
        .unwrap_err();
    assert!(format!("{err}").contains("WEBDAV_ENDPOINT_REQUIRED"));

    let err = DataSourceService::test_webdav_connection("http://x", "", "pass", None)
        .await
        .unwrap_err();
    assert!(format!("{err}").contains("WEBDAV_USERNAME_REQUIRED"));

    let err = DataSourceService::test_webdav_connection("http://x", "user", "", None)
        .await
        .unwrap_err();
    assert!(format!("{err}").contains("WEBDAV_PASSWORD_REQUIRED"));

    let ok_addr = start_warp_server(|_method, _depth, _body| {
        warp::http::Response::builder()
            .status(207)
            .body(bytes::Bytes::from_static(PROPFIND_LISTING_XML.as_bytes()))
            .unwrap()
    });
    DataSourceService::test_webdav_connection(
        &format!("http://{ok_addr}/dav"),
        "user",
        "pass",
        Some("/books"),
    )
    .await
    .expect("multi-status should be accepted");

    let unauthorized_addr = start_warp_server(|_method, _depth, _body| {
        warp::http::Response::builder()
            .status(401)
            .body(bytes::Bytes::from_static(b""))
            .unwrap()
    });
    let err = DataSourceService::test_webdav_connection(
        &format!("http://{unauthorized_addr}/dav"),
        "user",
        "pass",
        None,
    )
    .await
    .unwrap_err();
    assert!(
        format!("{err}").contains("WEBDAV_UNAUTHORIZED"),
        "unexpected error: {err}"
    );
}

#[tokio::test]
async fn list_webdav_folders_should_decode_spaced_root_and_map_unexpected_status() {
    let _guard = credentials::use_test_backend(credentials::MemoryBackend::default());
    let state_dir = tempfile::tempdir().unwrap();
    let config_path = state_dir.path().join("config.json");
    let ok_addr = start_warp_server(|_method, depth, _body| {
        let body = if depth == "1" {
            PROPFIND_SPACED_ROOT_LISTING_XML.to_string()
        } else {
            String::new()
        };
        warp::http::Response::builder()
            .status(207)
            .body(bytes::Bytes::from(body))
            .unwrap()
    });

    let mut config = AppConfig::default();
    let dto = DataSourceService::add_webdav_data_source(
        "WebDAV",
        &format!("http://{ok_addr}"),
        "user",
        "pass",
        Some("/My Books"),
        &config_path,
        &mut config,
    )
    .expect("webdav datasource should be added");

    let entries = DataSourceService::list_webdav_folders(&dto.id, "/", &config_path, &config)
        .await
        .expect("list should succeed");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "Authors");
    assert_eq!(entries[0].path, "/Authors");

    let error_addr = start_warp_server(|_method, _depth, _body| {
        warp::http::Response::builder()
            .status(500)
            .body(bytes::Bytes::from_static(b""))
            .unwrap()
    });
    let dto = DataSourceService::add_webdav_data_source(
        "WebDAV Error",
        &format!("http://{error_addr}/dav"),
        "user2",
        "pass",
        Some("/books"),
        &config_path,
        &mut config,
    )
    .expect("webdav datasource should be added");

    let err = DataSourceService::list_webdav_folders(&dto.id, "/", &config_path, &config)
        .await
        .unwrap_err();
    assert!(format!("{err}").contains("WEBDAV_UNEXPECTED_STATUS"));
}

#[tokio::test]
async fn list_onedrive_folders_should_return_auth_error_when_refresh_token_is_missing() {
    let state_dir = tempfile::tempdir().unwrap();
    let config_path = state_dir.path().join("config.json");
    let config = AppConfig {
        data_sources: vec![DataSourceConfig {
            id: "ds-onedrive".into(),
            name: "OneDrive".into(),
            enabled: true,
            detail: DataSourceDetail::Onedrive {
                client_id: "client-id".into(),
                tenant_id: "consumers".into(),
                credential_account: None,
                root_path: None,
                user_name: None,
                user_email: None,
            },
        }],
        ..Default::default()
    };

    let err = DataSourceService::list_onedrive_folders("ds-onedrive", "/", &config_path, &config)
        .await
        .expect_err("missing token should fail before graph request");

    let message = format!("{err}");
    assert!(
        message.contains("No refresh token found"),
        "message was {message}"
    );
}

fn start_warp_server<
    F: Fn(warp::http::Method, String, bytes::Bytes) -> warp::http::Response<bytes::Bytes>
        + Send
        + Sync
        + 'static,
>(
    handler: F,
) -> std::net::SocketAddr {
    let handler = std::sync::Arc::new(handler);
    let route = warp::any()
        .and(warp::method())
        .and(warp::header::<String>("depth"))
        .and(warp::body::bytes())
        .map(
            move |method: warp::http::Method, depth: String, body: bytes::Bytes| {
                let handler = handler.clone();
                handler(method, depth, body)
            },
        );

    let (addr, server) = warp::serve(route).bind_ephemeral(([127, 0, 0, 1], 0));
    tokio::spawn(server);
    addr
}

const PROPFIND_LISTING_XML: &str = r#"<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/books/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>books</D:displayname>
        <D:getlastmodified>Sun, 01 May 2022 06:39:47 GMT</D:getlastmodified>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/books/Authors/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:displayname>Authors</D:displayname>
        <D:getlastmodified>Sun, 01 May 2022 06:39:47 GMT</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

const PROPFIND_SPACED_ROOT_LISTING_XML: &str = r#"<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/My%20Books/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>My Books</D:displayname>
        <D:getlastmodified>Sun, 01 May 2022 06:39:47 GMT</D:getlastmodified>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/My%20Books/Authors/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:displayname>Authors</D:displayname>
        <D:getlastmodified>Sun, 01 May 2022 06:39:47 GMT</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;
