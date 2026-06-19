//! Microsoft Graph API client.
//!
//! All Graph interactions (`/me`, OneDrive file listings, etc.) are centralized here
//! instead of being scattered across `auth::onedrive` and `services::datasource_service`.

use async_trait::async_trait;
use percent_encoding::{percent_encode, NON_ALPHANUMERIC};
use serde_json::Value;
use tracing::info;

use crate::error::AppError;
use crate::models::OnedriveFolderEntry;
use crate::utils::http::build_client;

const GRAPH_ME_URL: &str = "https://graph.microsoft.com/v1.0/me";
const ONEDRIVE_ROOT_CHILDREN_URL: &str = "https://graph.microsoft.com/v1.0/me/drive/root/children?$filter=folder ne null&$select=name,id,parentReference";

#[async_trait]
pub trait GraphClient: Send + Sync {
    /// Fetch the current user's `/me` information.
    async fn get_me(&self, access_token: &str) -> Result<Value, AppError>;

    /// List OneDrive folders under the given path.
    async fn list_onedrive_folders(
        &self,
        access_token: &str,
        path: &str,
    ) -> Result<Vec<OnedriveFolderEntry>, AppError>;
}

/// `reqwest`-based Graph client implementation.
pub struct ReqwestGraphClient {
    client: reqwest::Client,
}

impl ReqwestGraphClient {
    pub fn new() -> Result<Self, AppError> {
        Ok(Self {
            client: build_client(15)?,
        })
    }
}

#[async_trait]
impl GraphClient for ReqwestGraphClient {
    async fn get_me(&self, access_token: &str) -> Result<Value, AppError> {
        let resp = self
            .client
            .get(GRAPH_ME_URL)
            .header("Authorization", format!("Bearer {access_token}"))
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Graph /me request failed: {e}")))?;

        info!("OneDrive /me response status: {}", resp.status());

        if !resp.status().is_success() {
            return Err(AppError::Auth(format!(
                "Graph /me returned status {}",
                resp.status().as_u16()
            )));
        }

        resp.json::<Value>()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse Graph /me response: {e}")))
    }

    async fn list_onedrive_folders(
        &self,
        access_token: &str,
        path: &str,
    ) -> Result<Vec<OnedriveFolderEntry>, AppError> {
        let url = build_onedrive_children_url(path);

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {access_token}"))
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("ONEDRIVE_REQUEST_FAILED: {e}")))?;

        let status = resp.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::Auth("ONEDRIVE_UNAUTHORIZED".into()));
        }
        if !status.is_success() {
            return Err(AppError::Auth(format!(
                "ONEDRIVE_UNEXPECTED_STATUS: {}",
                status.as_u16()
            )));
        }

        let body: Value = resp
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("ONEDRIVE_PARSE_FAILED: {e}")))?;

        let entries = parse_onedrive_folder_entries(&body);
        info!("OneDrive folder listing. path: \"{path}\", count: {}", entries.len());

        Ok(entries)
    }
}

/// Build the OneDrive children query URL.
fn build_onedrive_children_url(path: &str) -> String {
    let trimmed = path.trim().trim_start_matches('/').trim_end_matches('/');
    if trimmed.is_empty() {
        ONEDRIVE_ROOT_CHILDREN_URL.to_string()
    } else {
        let encoded_path = trimmed
            .split('/')
            .map(|segment| percent_encode(segment.as_bytes(), NON_ALPHANUMERIC).to_string())
            .collect::<Vec<_>>()
            .join("/");
        format!(
            "https://graph.microsoft.com/v1.0/me/drive/root:/{encoded_path}:/children?$filter=folder ne null&$select=name,id,parentReference"
        )
    }
}

/// Parse OneDrive folder entries from a Graph response.
fn parse_onedrive_folder_entries(body: &Value) -> Vec<OnedriveFolderEntry> {
    body["value"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let name = item["name"].as_str()?.to_string();
                    let item_id = item["id"].as_str().map(ToString::to_string);
                    let parent_path = item["parentReference"]["path"].as_str().unwrap_or("");
                    let entry_path = build_entry_path(parent_path, &name);
                    Some(OnedriveFolderEntry {
                        name,
                        path: entry_path,
                        item_id,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn build_entry_path(parent_path: &str, name: &str) -> String {
    if parent_path.is_empty() {
        format!("{name}/")
    } else {
        let relative = parent_path
            .trim_start_matches("/drive/root:")
            .trim_start_matches('/');
        if relative.is_empty() {
            format!("{name}/")
        } else {
            format!("{relative}/{name}/")
        }
    }
}

// ── Inline tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_onedrive_children_url_should_return_root_children_url_when_path_is_empty() {
        assert_eq!(
            build_onedrive_children_url(""),
            ONEDRIVE_ROOT_CHILDREN_URL
        );
        assert_eq!(
            build_onedrive_children_url("/"),
            ONEDRIVE_ROOT_CHILDREN_URL
        );
        assert_eq!(
            build_onedrive_children_url("   "),
            ONEDRIVE_ROOT_CHILDREN_URL
        );
    }

    #[test]
    fn build_onedrive_children_url_should_encode_path_segments_when_path_has_special_characters() {
        let url = build_onedrive_children_url("/Books/参考资料");
        assert_eq!(
            url,
            "https://graph.microsoft.com/v1.0/me/drive/root:/Books/%E5%8F%82%E8%80%83%E8%B5%84%E6%96%99:/children?$filter=folder ne null&$select=name,id,parentReference"
        );
    }

    #[test]
    fn parse_onedrive_folder_entries_should_skip_non_folder_items_when_response_contains_files() {
        let body = serde_json::json!({
            "value": [
                { "name": "Books", "id": "1", "parentReference": { "path": "/drive/root:/" } },
                { "name": "file.txt", "id": "2", "parentReference": { "path": "/drive/root:/" } },
            ]
        });

        let entries = parse_onedrive_folder_entries(&body);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "Books");
        assert_eq!(entries[0].path, "Books/");
        assert_eq!(entries[0].item_id, Some("1".to_string()));
    }

    #[test]
    fn parse_onedrive_folder_entries_should_compute_nested_paths_when_parent_path_is_nested() {
        let body = serde_json::json!({
            "value": [
                { "name": "Authors", "id": "3", "parentReference": { "path": "/drive/root:/Books" } },
            ]
        });

        let entries = parse_onedrive_folder_entries(&body);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "Books/Authors/");
    }

    #[test]
    fn parse_onedrive_folder_entries_should_return_empty_when_response_has_no_value_array() {
        let body = serde_json::json!({});
        assert!(parse_onedrive_folder_entries(&body).is_empty());
    }

    #[test]
    fn build_entry_path_should_use_name_as_path_when_parent_path_is_empty() {
        assert_eq!(build_entry_path("", "Books"), "Books/");
    }

    #[test]
    fn parse_onedrive_folder_entries_should_skip_items_without_name_when_item_has_no_name() {
        let body = serde_json::json!({
            "value": [
                { "id": "1", "parentReference": { "path": "/drive/root:/" } },
                { "name": "Books", "id": "2", "parentReference": { "path": "/drive/root:/" } },
            ]
        });

        let entries = parse_onedrive_folder_entries(&body);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Books");
        assert_eq!(entries[0].item_id, Some("2".to_string()));
    }

    #[test]
    fn parse_onedrive_folder_entries_should_use_none_as_item_id_when_item_has_no_id() {
        let body = serde_json::json!({
            "value": [
                { "name": "Books", "parentReference": { "path": "/drive/root:/" } },
            ]
        });

        let entries = parse_onedrive_folder_entries(&body);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].item_id, None);
    }
}
