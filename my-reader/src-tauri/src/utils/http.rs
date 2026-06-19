use crate::error::AppError;
use crate::models::{DataSourceConfig, DataSourceDetail, WebdavFolderEntry};
use crate::auth::credentials;

/// Extracted WebDAV credentials ready for HTTP requests.
#[derive(Debug)]
pub struct WebdavCreds {
    pub endpoint: String,
    pub username: String,
    pub password: String,
    pub root_path: Option<String>,
}

/// Extract endpoint, username, password, and root_path from a WebDAV data source config.
/// Reads the password from the system keyring via `credential_account`.
pub fn extract_credentials(source: &DataSourceConfig) -> Result<WebdavCreds, AppError> {
    let (endpoint, username, credential_account, root_path) = match &source.detail {
        DataSourceDetail::Webdav {
            endpoint,
            username,
            credential_account,
            root_path,
        } => (endpoint, username, credential_account, root_path),
        DataSourceDetail::Local { .. } | DataSourceDetail::Onedrive { .. } => {
            return Err(AppError::Config(
                "DATASOURCE_NOT_WEBDAV: only WebDAV data sources support this operation".into(),
            ));
        }
    };

    let password = if let Some(account) =
        credential_account.as_ref().filter(|s| !s.trim().is_empty())
    {
        credentials::read_webdav_password(account.trim())?.ok_or_else(|| {
            AppError::Config("系统钥匙串未找到对应 WebDAV 密码".into())
        })?
    } else {
        return Err(AppError::Config(
            "缺少 WebDAV 密码（credential_account 为空）".into(),
        ));
    };

    Ok(WebdavCreds {
        endpoint: endpoint.clone(),
        username: username.clone(),
        password,
        root_path: root_path.clone(),
    })
}

/// Build a standard reqwest client with a configurable timeout (seconds).
pub fn build_client(timeout_secs: u64) -> Result<reqwest::Client, AppError> {
    Ok(reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()?)
}

/// Map a non-2xx HTTP status to a typed `AppError::Config`.
pub fn map_status_error(status: reqwest::StatusCode, url: &reqwest::Url) -> AppError {
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return AppError::Config(format!("WEBDAV_UNAUTHORIZED: {url}"));
    }
    if status == reqwest::StatusCode::FORBIDDEN {
        return AppError::Config(format!("WEBDAV_FORBIDDEN: {url}"));
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return AppError::Config(format!("WEBDAV_NOT_FOUND: {url}"));
    }
    AppError::Config(format!(
        "WEBDAV_UNEXPECTED_STATUS: {}: {url}",
        status.as_u16()
    ))
}

// ── URL construction ──────────────────────────────────────────────────

/// Normalize a user-supplied root path to an absolute path starting with `/`.
pub fn normalize_root_path(root_path: Option<&str>) -> String {
    let trimmed = root_path.unwrap_or("/").trim();
    if trimmed.is_empty() {
        return "/".to_string();
    }
    if trimmed.starts_with('/') {
        return trimmed.to_string();
    }
    format!("/{}", trimmed)
}

/// Build the URL for a WebDAV connectivity test (PROPFIND Depth:0).
pub fn build_test_url(endpoint: &str, root_path: Option<&str>) -> Result<reqwest::Url, AppError> {
    let mut url = reqwest::Url::parse(endpoint.trim())
        .map_err(|err| AppError::Config(format!("INVALID_WEBDAV_ENDPOINT: {err}")))?;
    let normalized_root = normalize_root_path(root_path);
    let mut base_path = url.path().trim_end_matches('/').to_string();
    if base_path.is_empty() {
        base_path = "/".to_string();
    }
    let final_path = if normalized_root == "/" {
        base_path
    } else if base_path == "/" {
        normalized_root
    } else {
        format!("{base_path}{normalized_root}")
    };
    url.set_path(&final_path);
    Ok(url)
}

/// Build the full URL for a PROPFIND Depth:1 listing request.
/// Combines endpoint + root_path + rel_path.
pub fn build_list_url(
    endpoint: &str,
    root_path: Option<&str>,
    rel_path: &str,
) -> Result<reqwest::Url, AppError> {
    let mut url = reqwest::Url::parse(endpoint.trim())
        .map_err(|err| AppError::Config(format!("INVALID_WEBDAV_ENDPOINT: {err}")))?;

    let normalized_root = normalize_root_path(root_path);
    let mut base_path = url.path().trim_end_matches('/').to_string();
    if base_path.is_empty() {
        base_path = "/".to_string();
    }

    let base_with_root = if normalized_root == "/" {
        base_path
    } else if base_path == "/" {
        normalized_root
    } else {
        format!("{base_path}{normalized_root}")
    };

    let trimmed_rel = rel_path.trim().trim_start_matches('/');
    let final_path = if trimmed_rel.is_empty() {
        base_with_root
    } else if base_with_root.ends_with('/') {
        format!("{base_with_root}{trimmed_rel}")
    } else {
        format!("{base_with_root}/{trimmed_rel}")
    };

    url.set_path(&final_path);
    Ok(url)
}

// ── PROPFIND XML parsing ──────────────────────────────────────────────

/// Parse a WebDAV PROPFIND XML response and return only directory entries,
/// excluding the current directory itself.
pub fn parse_propfind_response(
    xml: &str,
    root_path: Option<&str>,
    rel_path: &str,
) -> Result<Vec<WebdavFolderEntry>, AppError> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let normalized_root = normalize_root_path(root_path);
    let current_rel = normalize_rel_path(rel_path);

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut entries = Vec::new();
    let mut in_response = false;
    let mut in_href = false;
    let mut in_displayname = false;
    let mut is_directory = false;
    let mut current_href = String::new();
    let mut current_displayname = String::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let local = e.local_name();
                let name = String::from_utf8_lossy(local.as_ref());

                if name == "response" {
                    in_response = true;
                    current_href.clear();
                    current_displayname.clear();
                    is_directory = false;
                } else if in_response && name == "href" {
                    in_href = true;
                } else if in_response && name == "displayname" {
                    in_displayname = true;
                } else if in_response && name == "collection" {
                    is_directory = true;
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_href {
                    current_href = e.unescape().unwrap_or_default().to_string();
                } else if in_displayname {
                    current_displayname = e.unescape().unwrap_or_default().to_string();
                }
            }
            Ok(Event::End(ref e)) => {
                let local = e.local_name();
                let name = String::from_utf8_lossy(local.as_ref());

                if name == "response" && in_response {
                    in_response = false;
                    if is_directory {
                        let entry_path =
                            to_remote_entry_path(&current_href, &normalized_root, true);
                        let entry_trimmed = entry_path.trim_end_matches('/');
                        let current_trimmed = current_rel.trim_end_matches('/');
                        if !entry_trimmed.is_empty() && entry_trimmed != current_trimmed {
                            let display_name = if current_displayname.is_empty() {
                                entry_trimmed
                                    .split('/')
                                    .filter(|s| !s.is_empty())
                                    .next_back()
                                    .unwrap_or(&current_href)
                                    .to_string()
                            } else {
                                current_displayname.clone()
                            };
                            entries.push(WebdavFolderEntry {
                                name: display_name,
                                path: entry_path,
                            });
                        }
                    }
                    current_href.clear();
                    current_displayname.clear();
                } else if name == "href" {
                    in_href = false;
                } else if name == "displayname" {
                    in_displayname = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(AppError::Config(format!(
                    "WEBDAV_XML_PARSE_FAILED: {e}"
                )));
            }
            _ => {}
        }
        buf.clear();
    }

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// Normalize a relative path: strip leading/trailing slashes.
/// Root becomes empty string.
pub fn normalize_rel_path(rel_path: &str) -> String {
    rel_path.trim().trim_matches('/').to_string()
}

/// Convert a WebDAV href from a PROPFIND response into a path relative to the
/// configured root_path. Percent-encoded sequences are decoded.
pub fn to_remote_entry_path(href: &str, root_path: &str, is_directory: bool) -> String {
    use percent_encoding::percent_decode_str;

    let raw_path = if href.starts_with("http://") || href.starts_with("https://") {
        reqwest::Url::parse(href)
            .map(|u| u.path().to_string())
            .unwrap_or_else(|_| href.to_string())
    } else {
        href.to_string()
    };

    let pathname = percent_decode_str(&raw_path)
        .decode_utf8_lossy()
        .to_string();

    let mut normalized = pathname;
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    if !normalized.starts_with('/') {
        normalized = format!("/{normalized}");
    }

    let root_normalized = if root_path == "/" {
        String::new()
    } else {
        let mut r = root_path.to_string();
        while r.contains("//") {
            r = r.replace("//", "/");
        }
        if !r.starts_with('/') {
            r = format!("/{r}");
        }
        r.trim_end_matches('/').to_string()
    };

    let relative = if root_normalized.is_empty() {
        normalized.trim_end_matches('/').to_string()
    } else if normalized == root_normalized || normalized == format!("{root_normalized}/") {
        return String::new();
    } else if normalized.starts_with(&format!("{root_normalized}/")) {
        normalized[root_normalized.len() + 1..]
            .trim_end_matches('/')
            .to_string()
    } else {
        normalized.trim_end_matches('/').to_string()
    };

    if is_directory && !relative.is_empty() {
        format!("{relative}/")
    } else {
        relative
    }
}

// ── Inline tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_root_path_should_fall_back_to_root_when_root_path_is_missing_or_empty() {
        assert_eq!(normalize_root_path(None), "/");
        assert_eq!(normalize_root_path(Some("")), "/");
        assert_eq!(normalize_root_path(Some("   ")), "/");
    }

    #[test]
    fn normalize_root_path_should_add_leading_slash_when_root_path_has_no_leading_slash() {
        assert_eq!(normalize_root_path(Some("books")), "/books");
        assert_eq!(normalize_root_path(Some("nested/path")), "/nested/path");
    }

    #[test]
    fn build_test_url_should_keep_endpoint_path_when_root_path_is_root() {
        let url = build_test_url("https://example.com/webdav/", Some("/"))
            .expect("expected valid test url");
        assert_eq!(url.as_str(), "https://example.com/webdav");
    }

    #[test]
    fn build_test_url_should_join_endpoint_and_root_when_root_path_is_relative() {
        let url = build_test_url("https://example.com/base", Some("books"))
            .expect("expected valid test url");
        assert_eq!(url.as_str(), "https://example.com/base/books");
    }

    #[test]
    fn build_list_url_should_return_root_list_url_when_rel_path_is_root() {
        let url = build_list_url("https://example.com/dav", Some("/books"), "/")
            .expect("expected valid list url");
        assert_eq!(url.as_str(), "https://example.com/dav/books");
    }

    #[test]
    fn build_list_url_should_return_subdir_list_url_when_rel_path_is_subdir() {
        let url = build_list_url("https://example.com/dav", Some("/books"), "Authors/")
            .expect("expected valid list url");
        assert_eq!(url.as_str(), "https://example.com/dav/books/Authors/");
    }

    #[test]
    fn normalize_rel_path_should_trim_slashes_when_rel_path_has_them() {
        assert_eq!(normalize_rel_path("/"), "");
        assert_eq!(normalize_rel_path("Books/"), "Books");
        assert_eq!(normalize_rel_path("/Authors/"), "Authors");
    }

    #[test]
    fn to_remote_entry_path_should_return_relative_path_when_href_is_subdir() {
        assert_eq!(
            to_remote_entry_path("/dav/books/Authors/", "/dav/books", true),
            "Authors/"
        );
    }

    #[test]
    fn to_remote_entry_path_should_return_empty_when_href_is_root() {
        assert_eq!(to_remote_entry_path("/dav/books/", "/dav/books", true), "");
    }

    #[test]
    fn to_remote_entry_path_should_extract_path_when_href_is_full_url() {
        assert_eq!(
            to_remote_entry_path(
                "https://example.com/dav/books/Authors/",
                "/dav/books",
                true,
            ),
            "Authors/"
        );
    }

    #[test]
    fn to_remote_entry_path_should_decode_percent_encoding_when_href_is_percent_encoded() {
        assert_eq!(
            to_remote_entry_path(
                "/dav/books/%E5%8F%82%E8%80%83%E8%B5%84%E6%96%99/",
                "/dav/books",
                true,
            ),
            "参考资料/"
        );
    }

    #[test]
    fn parse_propfind_response_should_return_only_dirs_when_response_has_dir_and_file() {
        let xml = r#"<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/books/</D:href>
    <D:propstat>
      <D:prop>
 <D:resourcetype><D:collection/></D:resourcetype>
        <D:displayname>books</D:displayname>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/books/Authors/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:displayname>Authors</D:displayname>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/books/readme.txt</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
        <D:displayname>readme.txt</D:displayname>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let entries =
            parse_propfind_response(xml, Some("/dav/books"), "/").expect("parse should succeed");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Authors");
        assert_eq!(entries[0].path, "Authors/");
    }

    #[test]
    fn parse_propfind_response_should_return_empty_when_response_has_no_dirs() {
        let xml = r#"<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/books/readme.txt</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype/>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let entries =
            parse_propfind_response(xml, Some("/dav/books"), "/").expect("parse should succeed");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn parse_propfind_response_should_decode_percent_encoded_name_when_response_has_percent_encoded_dir() {
        let xml = r#"<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/books/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/books/%E5%8F%82%E8%80%83%E8%B5%84%E6%96%99/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let entries =
            parse_propfind_response(xml, Some("/dav/books"), "/").expect("parse should succeed");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "参考资料");
        assert_eq!(entries[0].path, "参考资料/");
    }

    #[test]
    fn normalize_root_path_should_leave_it_when_root_path_already_starts_with_slash() {
        assert_eq!(normalize_root_path(Some("/books")), "/books");
        assert_eq!(normalize_root_path(Some("/nested/path/")), "/nested/path/");
    }

    #[test]
    fn build_test_url_should_prepend_slash_when_endpoint_has_no_path_and_root_is_relative() {
        let url = build_test_url("https://example.com", Some("books"))
            .expect("expected valid test url");
        assert_eq!(url.as_str(), "https://example.com/books");
    }

    #[test]
    fn map_status_error_should_map_to_typed_error_when_status_is_known() {
        let url = reqwest::Url::parse("https://example.com/dav").unwrap();
        assert!(format!("{}", map_status_error(reqwest::StatusCode::UNAUTHORIZED, &url))
            .contains("WEBDAV_UNAUTHORIZED"));
        assert!(format!("{}", map_status_error(reqwest::StatusCode::FORBIDDEN, &url))
            .contains("WEBDAV_FORBIDDEN"));
        assert!(format!("{}", map_status_error(reqwest::StatusCode::NOT_FOUND, &url))
            .contains("WEBDAV_NOT_FOUND"));
    }

    #[test]
    fn map_status_error_should_include_status_code_when_status_is_unknown() {
        let url = reqwest::Url::parse("https://example.com/dav").unwrap();
        let err = map_status_error(reqwest::StatusCode::INTERNAL_SERVER_ERROR, &url);
        let msg = format!("{err}");
        assert!(msg.contains("WEBDAV_UNEXPECTED_STATUS"));
        assert!(msg.contains("500"));
    }

    #[test]
    fn parse_propfind_response_should_report_parse_error_when_xml_is_malformed() {
        let xml = "<?xml version=\"1.0\"?><unclosed";
        let err = parse_propfind_response(xml, Some("/dav"), "/").unwrap_err();
        assert!(format!("{err}").contains("WEBDAV_XML_PARSE_FAILED"));
    }

    #[test]
    fn to_remote_entry_path_should_return_normalized_path_when_root_path_is_slash() {
        assert_eq!(to_remote_entry_path("/Books/", "/", true), "/Books/");
    }

    #[test]
    fn to_remote_entry_path_should_add_leading_slash_when_href_lacks_leading_slash() {
        assert_eq!(to_remote_entry_path("Books/Authors/", "/Books", true), "Authors/");
    }

    #[test]
    fn to_remote_entry_path_should_return_empty_when_href_equals_root() {
        assert_eq!(to_remote_entry_path("/Books", "/Books", true), "");
        assert_eq!(to_remote_entry_path("/Books/", "/Books", true), "");
    }

    #[test]
    fn to_remote_entry_path_should_preserve_path_when_href_is_not_under_root() {
        assert_eq!(
            to_remote_entry_path("/other/path/", "/Books", true),
            "/other/path/"
        );
    }

    #[test]
    fn extract_credentials_should_reject_when_source_is_not_webdav() {
        let source = DataSourceConfig {
            id: "ds-1".to_string(),
            name: "Local".to_string(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: "/tmp".to_string(),
            },
        };

        let err = extract_credentials(&source).unwrap_err();
        assert!(format!("{err}").contains("DATASOURCE_NOT_WEBDAV"));
    }

    #[test]
    fn extract_credentials_should_reject_when_credential_account_is_missing() {
        let source = DataSourceConfig {
            id: "ds-2".to_string(),
            name: "WebDAV".to_string(),
            enabled: true,
            detail: DataSourceDetail::Webdav {
                endpoint: "https://dav".to_string(),
                username: "user".to_string(),
                credential_account: None,
                root_path: None,
            },
        };

        let err = extract_credentials(&source).unwrap_err();
        assert!(format!("{err}").contains("credential_account 为空"));
    }

    #[test]
    fn extract_credentials_should_read_password_when_backend_has_password() {
        let _guard = crate::auth::credentials::use_test_backend(
            crate::auth::credentials::MemoryBackend::default(),
        );

        let account = crate::auth::credentials::webdav_password_account("ds-3");
        crate::auth::credentials::save_webdav_password(&account, "webdav-secret").unwrap();

        let source = DataSourceConfig {
            id: "ds-3".to_string(),
            name: "WebDAV".to_string(),
            enabled: true,
            detail: DataSourceDetail::Webdav {
                endpoint: "https://dav".to_string(),
                username: "user".to_string(),
                credential_account: Some(account.clone()),
                root_path: Some("/books".to_string()),
            },
        };

        let creds = extract_credentials(&source).unwrap();
        assert_eq!(creds.endpoint, "https://dav");
        assert_eq!(creds.username, "user");
        assert_eq!(creds.password, "webdav-secret");
        assert_eq!(creds.root_path, Some("/books".to_string()));
    }
}