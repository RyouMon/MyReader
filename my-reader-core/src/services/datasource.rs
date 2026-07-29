use std::path::Path;

use opendal::Operator;
use serde::Deserialize;

use crate::{
    infrastructure::{registry_store, storage},
    models::{DataSource, RemoteCredential, RemoteDirectoryEntry},
    CoreError,
};

pub(crate) async fn test_connection(
    source: &DataSource,
    credential: &RemoteCredential,
) -> Result<(), CoreError> {
    storage::build_remote_operator(source, credential)?
        .check()
        .await
        .map_err(|error| storage::remote_storage_error(source, error))
}

pub(crate) async fn list_directories(
    registry_path: &Path,
    data_source_id: &str,
    path: &str,
    credential: &RemoteCredential,
) -> Result<Vec<RemoteDirectoryEntry>, CoreError> {
    let registry = registry_store::load(registry_path)?
        .ok_or_else(|| CoreError::NotFound("DEVICE_REGISTRY_NOT_FOUND".into()))?;
    let source = registry
        .data_sources
        .iter()
        .find(|source| source.id() == data_source_id)
        .ok_or_else(|| CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
    if let (DataSource::Onedrive { root_path, .. }, RemoteCredential::Onedrive { access_token }) =
        (source, credential)
    {
        return list_onedrive_directories(root_path.as_deref(), path, access_token).await;
    }
    let operator = storage::build_remote_operator(source, credential)?;
    list_directories_with_operator(&operator, path, Some(source)).await
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
    let client = reqwest::Client::new();
    let mut next_link = Some(onedrive_children_url(&api_path).to_string());
    let mut entries = Vec::new();

    while let Some(url) = next_link {
        let response = client
            .get(url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|error| CoreError::Storage(format!("ONEDRIVE_STORAGE_FAILED: {error}")))?;
        let status = response.status();
        if !status.is_success() {
            let code = match status.as_u16() {
                401 | 403 => "ONEDRIVE_UNAUTHORIZED",
                404 => "ONEDRIVE_NOT_FOUND",
                _ => "ONEDRIVE_STORAGE_FAILED",
            };
            return Err(CoreError::Storage(format!(
                "{code}: List {relative_parent} failed with status {status}"
            )));
        }
        let body = response
            .bytes()
            .await
            .map_err(|error| CoreError::Storage(format!("ONEDRIVE_STORAGE_FAILED: {error}")))?;
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
    url.query_pairs_mut()
        .append_pair("$select", "name,folder")
        .append_pair("$top", "200");
    url
}

fn parse_onedrive_directory_page(
    body: &[u8],
    parent: &str,
) -> Result<(Vec<RemoteDirectoryEntry>, Option<String>), CoreError> {
    let page: OnedriveDirectoryPage = serde_json::from_slice(body)
        .map_err(|error| CoreError::Storage(format!("ONEDRIVE_INVALID_LIST_RESPONSE: {error}")))?;
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
    source: Option<&DataSource>,
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
        .map_err(|error| match source {
            Some(source) => storage::remote_storage_error(source, error),
            None => storage::storage_error(error),
        })?
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

    #[tokio::test]
    async fn list_directories_should_return_only_immediate_directories_when_path_is_browsed() {
        let remote = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(remote.path().join("Books/One")).unwrap();
        std::fs::create_dir_all(remote.path().join("Books/Two")).unwrap();
        std::fs::write(remote.path().join("Books/file.txt"), b"content").unwrap();
        let operator = Operator::new(
            Fs::default().root(remote.path().to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();

        let entries = list_directories_with_operator(&operator, "/Books", None)
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
    }

    #[test]
    fn onedrive_children_url_should_encode_nested_path_when_directory_is_browsed() {
        let url = onedrive_children_url("Library/Calibre Test");

        assert_eq!(
            url.path(),
            "/v1.0/me/drive/root:/Library/Calibre%20Test:/children"
        );
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
