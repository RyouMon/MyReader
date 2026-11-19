use std::path::Path;

use opendal::Operator;
use serde::Deserialize;

use crate::{
    infrastructure::storage,
    models::{AppConfig, DataSource, RemoteCredential, RemoteDirectoryEntry},
    services::config,
    CoreError,
};

pub struct DataSourceService;

impl DataSourceService {
    pub fn prepare_for_upsert(path: &Path, source: DataSource) -> Result<DataSource, CoreError> {
        let source = config::ConfigService::prepare_data_source(source)?;
        config::ConfigService::ensure_data_source_can_upsert(path, &source)?;
        Ok(source)
    }

    pub fn upsert(path: &Path, source: DataSource) -> Result<AppConfig, CoreError> {
        config::ConfigService::upsert_data_source(path, source)
    }

    pub fn add_local(path: &Path, name: &str, root_path: &str) -> Result<AppConfig, CoreError> {
        config::ConfigService::add_local_data_source(path, name, root_path)
    }

    pub fn remove(path: &Path, id: &str) -> Result<AppConfig, CoreError> {
        config::ConfigService::remove_data_source(path, id)
    }

    pub async fn test_connection(
        source: &DataSource,
        credential: &RemoteCredential,
    ) -> Result<(), CoreError> {
        storage::build_remote_operator(source, credential)?
            .check()
            .await
            .map_err(storage::storage_error)
    }

    pub async fn list_directories(
        config_path: &Path,
        data_source_id: &str,
        path: &str,
        credential: &RemoteCredential,
    ) -> Result<Vec<RemoteDirectoryEntry>, CoreError> {
        let state = config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        let source = state
            .data_sources
            .iter()
            .find(|source| source.id() == data_source_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}"))
            })?;
        if let (
            DataSource::Onedrive { root_path, .. },
            RemoteCredential::Onedrive { access_token },
        ) = (source, credential)
        {
            return list_onedrive_directories(root_path.as_deref(), path, access_token).await;
        }
        let operator = storage::build_remote_operator(source, credential)?;
        list_directories_with_operator(&operator, path).await
    }

    pub async fn create_directory(
        config_path: &Path,
        data_source_id: &str,
        parent_path: &str,
        name: &str,
        credential: &RemoteCredential,
    ) -> Result<RemoteDirectoryEntry, CoreError> {
        let state = config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        let source = state
            .data_sources
            .iter()
            .find(|source| source.id() == data_source_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}"))
            })?;
        if source.readonly() {
            return Err(CoreError::Config("DATASOURCE_READ_ONLY".into()));
        }
        let entry = directory_entry(parent_path, name)?;
        let operator = storage::build_remote_operator(source, credential)?;
        if let (
            DataSource::Onedrive { root_path, .. },
            RemoteCredential::Onedrive { access_token },
        ) = (source, credential)
        {
            ensure_directory_absent(&operator, &entry.path).await?;
            // OpenDAL creates OneDrive directories with conflictBehavior=replace.
            // An explicit user creation must fail on a racing name conflict.
            let parent = storage::scope_remote_root(root_path.as_deref(), parent_path)?;
            let url = onedrive_children_url(parent.trim_matches('/'));
            crate::infrastructure::http::client_builder().build()?
                .post(url).bearer_auth(access_token)
                .json(&serde_json::json!({"name": entry.name, "folder": {}, "@microsoft.graph.conflictBehavior": "fail"}))
                .send().await?.error_for_status()?;
        } else {
            create_directory_with_operator(&operator, &entry).await?;
        }
        Ok(entry)
    }
}

async fn create_directory_with_operator(
    operator: &Operator,
    entry: &RemoteDirectoryEntry,
) -> Result<(), CoreError> {
    ensure_directory_absent(operator, &entry.path).await?;
    operator
        .create_dir(&format!("{}/", entry.path.trim_start_matches('/')))
        .await
        .map_err(storage::storage_error)
}

fn directory_entry(parent_path: &str, name: &str) -> Result<RemoteDirectoryEntry, CoreError> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', '\0']) {
        return Err(CoreError::Config("INVALID_REMOTE_DIRECTORY_NAME".into()));
    }
    let path = storage::join_remote_path(parent_path, name)?;
    Ok(RemoteDirectoryEntry {
        name: name.into(),
        path: format!("/{path}"),
        is_directory: true,
    })
}

async fn ensure_directory_absent(operator: &Operator, path: &str) -> Result<(), CoreError> {
    let path = path.trim_start_matches('/');
    // Object stores distinguish a file key from a directory marker. Neither
    // may be reused by an explicit folder creation.
    for candidate in [path.to_owned(), format!("{path}/")] {
        match operator.stat(&candidate).await {
            Ok(_) => return Err(CoreError::Config("REMOTE_DIRECTORY_ALREADY_EXISTS".into())),
            Err(error) if error.kind() == opendal::ErrorKind::NotFound => {}
            Err(error) => return Err(storage::storage_error(error)),
        }
    }
    Ok(())
}

#[derive(Deserialize)]
struct OnedriveDirectoryPage {
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
    value: Vec<OnedriveDirectoryItem>,
}

#[derive(Deserialize)]
struct OnedriveDirectoryItem {
    name: String,
    folder: Option<serde_json::Value>,
}

async fn list_onedrive_directories(
    root_path: Option<&str>,
    path: &str,
    access_token: &str,
) -> Result<Vec<RemoteDirectoryEntry>, CoreError> {
    if access_token.trim().is_empty() {
        return Err(CoreError::Config("ONEDRIVE_ACCESS_TOKEN_REQUIRED".into()));
    }

    let relative_parent = storage::normalize_remote_path(path)?;
    let source_root = storage::normalize_remote_path(root_path.unwrap_or_default())?;
    let api_path = storage::join_remote_path(&source_root, &relative_parent)?;
    let client = crate::infrastructure::http::client_builder().build()?;
    let mut list_url = onedrive_children_url(&api_path);
    list_url
        .query_pairs_mut()
        .append_pair("$select", "name,folder")
        .append_pair("$top", "200");
    let mut next_link = Some(list_url.to_string());
    let mut entries = Vec::new();

    while let Some(url) = next_link {
        let response = client.get(url).bearer_auth(access_token).send().await?;
        let response = response.error_for_status()?;
        let body = response.bytes().await?;
        let (mut page_entries, page_next_link) =
            parse_onedrive_directory_page(&body, &relative_parent)?;
        entries.append(&mut page_entries);
        next_link = page_next_link;
    }

    entries.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(entries)
}

fn onedrive_children_url(path: &str) -> reqwest::Url {
    let mut url = reqwest::Url::parse("https://graph.microsoft.com/v1.0/me/drive/root")
        .expect("OneDrive Graph root URL is valid");
    if path.is_empty() {
        url.set_path("/v1.0/me/drive/root/children");
    } else {
        url.set_path(&format!("/v1.0/me/drive/root:/{path}:/children"));
    }
    url
}

fn parse_onedrive_directory_page(
    body: &[u8],
    parent: &str,
) -> Result<(Vec<RemoteDirectoryEntry>, Option<String>), CoreError> {
    let page: OnedriveDirectoryPage = serde_json::from_slice(body)?;
    let entries = page
        .value
        .into_iter()
        .filter(|item| item.folder.is_some())
        .map(|item| {
            let path = storage::join_remote_path(parent, &item.name)?;
            Ok(RemoteDirectoryEntry {
                name: item.name,
                path: format!("/{path}"),
                is_directory: true,
            })
        })
        .collect::<Result<Vec<_>, CoreError>>()?;
    Ok((entries, page.next_link))
}

async fn list_directories_with_operator(
    operator: &Operator,
    path: &str,
) -> Result<Vec<RemoteDirectoryEntry>, CoreError> {
    let normalized = storage::normalize_remote_path(path)?;
    let directory = if normalized.is_empty() {
        String::new()
    } else {
        format!("{normalized}/")
    };
    let mut entries = operator
        .list(&directory)
        .await
        .map_err(storage::storage_error)?
        .into_iter()
        .filter(|entry| entry.metadata().is_dir())
        .filter_map(|entry| {
            let entry_path = entry.path().trim_matches('/');
            if entry_path == normalized {
                return None;
            }
            let name = entry_path.rsplit('/').next()?.to_owned();
            if name.is_empty() {
                return None;
            }
            Some(RemoteDirectoryEntry {
                name,
                path: format!("/{entry_path}"),
                is_directory: true,
            })
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use opendal::services::Fs;

    use super::*;

    #[test]
    fn new_directory_is_one_named_child_within_the_source() {
        assert_eq!(
            directory_entry("/父目录/", " 新书库 ").unwrap().path,
            "/父目录/新书库"
        );
        for name in ["", " ", ".", "..", "a/b", "a\\b", "a\0b"] {
            assert!(directory_entry("/", name).is_err(), "{name:?}");
        }
        assert!(directory_entry("/../outside", "book").is_err());
    }

    #[tokio::test]
    async fn existing_files_and_folders_cannot_be_reused_as_a_new_directory() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("folder")).unwrap();
        std::fs::write(root.path().join("book.epub"), b"keep me").unwrap();
        let operator = Operator::new(Fs::default().root(root.path().to_str().unwrap())).unwrap();
        for path in ["/folder", "/book.epub"] {
            assert!(ensure_directory_absent(&operator, path)
                .await
                .unwrap_err()
                .to_string()
                .contains("REMOTE_DIRECTORY_ALREADY_EXISTS"));
        }
        ensure_directory_absent(&operator, "/new").await.unwrap();
        assert_eq!(
            std::fs::read(root.path().join("book.epub")).unwrap(),
            b"keep me"
        );
    }

    #[tokio::test]
    async fn created_directory_can_be_browsed_and_cannot_be_created_twice() {
        let root = tempfile::tempdir().unwrap();
        let operator = Operator::new(Fs::default().root(root.path().to_str().unwrap())).unwrap();
        let parent = directory_entry("/", "书架").unwrap();
        create_directory_with_operator(&operator, &parent)
            .await
            .unwrap();
        let child = directory_entry(&parent.path, "My Books").unwrap();
        create_directory_with_operator(&operator, &child)
            .await
            .unwrap();
        assert_eq!(
            list_directories_with_operator(&operator, "/书架")
                .await
                .unwrap(),
            vec![child.clone()]
        );
        assert!(create_directory_with_operator(&operator, &child)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn readonly_sources_reject_directory_creation_before_network_access() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("config.json");
        config::ConfigService::load_or_initialize(&path, None).unwrap();
        let source = DataSource::Dropbox {
            id: "readonly".into(),
            name: "Dropbox".into(),
            enabled: true,
            client_id: "test".into(),
            account_id: Some("account".into()),
            display_name: None,
            email: None,
            root_path: None,
            has_refresh_token: false,
            credential_reference: None,
            readonly: Some(true),
            created_at: None,
        };
        config::ConfigService::upsert_data_source(&path, source).unwrap();
        let error = DataSourceService::create_directory(
            &path,
            "readonly",
            "/",
            "new",
            &RemoteCredential::Dropbox {
                access_token: "invalid".into(),
            },
        )
        .await
        .unwrap_err();
        assert!(error.to_string().contains("DATASOURCE_READ_ONLY"));
    }

    #[test]
    fn should_normalize_and_validate_uniqueness_when_source_is_prepared_for_upsert() {
        let config_dir = tempfile::tempdir().unwrap();
        let config_path = config_dir.path().join("config.json");
        config::ConfigService::load_or_initialize(&config_path, None).unwrap();
        let source = DataSource::Webdav {
            id: String::new(),
            name: " WebDAV ".into(),
            enabled: true,
            endpoint: "https://example.com/".into(),
            username: " reader ".into(),
            root_path: None,
            has_password: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
        };

        let prepared = DataSourceService::prepare_for_upsert(&config_path, source.clone())
            .expect("prepare first source");
        assert_eq!(prepared.name(), "WebDAV");
        if let DataSource::Webdav {
            endpoint, username, ..
        } = &prepared
        {
            assert_eq!(endpoint, "https://example.com");
            assert_eq!(username, "reader");
        } else {
            panic!("expected WebDAV source");
        }
        DataSourceService::upsert(&config_path, prepared).expect("persist first source");

        let error = DataSourceService::prepare_for_upsert(&config_path, source)
            .expect_err("duplicate source should fail");
        assert!(error
            .to_string()
            .contains("WEBDAV_DATASOURCE_ALREADY_EXISTS"));
    }

    #[tokio::test]
    async fn list_directories_should_return_only_immediate_directories_when_path_is_browsed() {
        let remote = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(remote.path().join("Books/One")).unwrap();
        std::fs::create_dir_all(remote.path().join("Books/Two")).unwrap();
        std::fs::write(remote.path().join("Books/file.txt"), b"content").unwrap();
        let operator = Operator::new(
            Fs::default().root(remote.path().to_str().expect("temporary path is UTF-8")),
        )
        .unwrap();

        let entries = list_directories_with_operator(&operator, "/Books")
            .await
            .unwrap();

        assert_eq!(
            entries,
            vec![
                RemoteDirectoryEntry {
                    name: "One".into(),
                    path: "/Books/One".into(),
                    is_directory: true,
                },
                RemoteDirectoryEntry {
                    name: "Two".into(),
                    path: "/Books/Two".into(),
                    is_directory: true,
                },
            ]
        );
    }

    #[test]
    fn onedrive_children_url_should_use_root_endpoint_when_root_is_browsed() {
        let url = onedrive_children_url("");

        assert_eq!(url.path(), "/v1.0/me/drive/root/children");
        // Creation uses the same endpoint, but Graph rejects listing options on POST.
        assert_eq!(url.query(), None);
    }

    #[test]
    fn onedrive_children_url_should_encode_nested_path_when_directory_is_browsed() {
        let url = onedrive_children_url("Library/Calibre Test");

        assert_eq!(
            url.path(),
            "/v1.0/me/drive/root:/Library/Calibre%20Test:/children"
        );
        assert_eq!(url.query(), None);
    }

    #[test]
    fn parse_onedrive_directory_page_should_ignore_non_folders_when_facets_are_mixed() {
        let body = br#"{
            "@odata.nextLink": "https://graph.microsoft.com/next",
            "value": [
                {"name": "Books", "folder": {"childCount": 2}},
                {"name": "manual.pdf", "file": {"mimeType": "application/pdf"}},
                {"name": "Notebook", "package": {"type": "oneNote"}}
            ]
        }"#;

        let (entries, next_link) = parse_onedrive_directory_page(body, "").unwrap();

        assert_eq!(
            entries,
            vec![RemoteDirectoryEntry {
                name: "Books".into(),
                path: "/Books".into(),
                is_directory: true,
            }]
        );
        assert_eq!(
            next_link.as_deref(),
            Some("https://graph.microsoft.com/next")
        );
    }
}
