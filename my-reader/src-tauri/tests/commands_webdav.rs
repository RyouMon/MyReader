use my_reader_lib::commands::source::{build_webdav_test_url, normalize_webdav_root_path};

/// 根路径为空时应回退为 `/`，避免探活请求落到非法地址。
#[test]
fn normalize_webdav_root_path_falls_back_to_root() {
    assert_eq!(normalize_webdav_root_path(None), "/");
    assert_eq!(normalize_webdav_root_path(Some("")), "/");
    assert_eq!(normalize_webdav_root_path(Some("   ")), "/");
}

/// 未带前缀 `/` 的路径应被规整为绝对路径格式。
#[test]
fn normalize_webdav_root_path_adds_leading_slash() {
    assert_eq!(normalize_webdav_root_path(Some("books")), "/books");
    assert_eq!(
        normalize_webdav_root_path(Some("nested/path")),
        "/nested/path"
    );
}

/// endpoint 已包含 path 且 rootPath 为 `/` 时应保留 endpoint path。
#[test]
fn build_webdav_test_url_keeps_endpoint_path_for_root() {
    let url = build_webdav_test_url("https://example.com/webdav/", Some("/"))
        .expect("expected valid test url");
    assert_eq!(url.as_str(), "https://example.com/webdav");
}

/// endpoint 与 rootPath 同时有路径片段时应被拼接成单一绝对路径。
#[test]
fn build_webdav_test_url_joins_endpoint_and_root_path() {
    let url = build_webdav_test_url("https://example.com/base", Some("books"))
        .expect("expected valid test url");
    assert_eq!(url.as_str(), "https://example.com/base/books");
}
