use tracing::info;

use crate::auth::credentials;
use crate::auth::onedrive::onedrive_token_manager;
use crate::clients::graph::{GraphClient, ReqwestGraphClient};
use crate::error::AppError;
use crate::models::{
    AppConfig, DataSourceConfig, DataSourceDetail, DataSourceDto, OnedriveFolderEntry,
    WebdavFolderEntry,
};
use crate::utils::http::{
    build_client, build_list_url, build_test_url, extract_credentials, map_status_error,
    parse_propfind_response,
};

pub struct DataSourceService;

impl DataSourceService {
    pub fn list_data_sources(config: &AppConfig) -> Vec<DataSourceDto> {
        config
            .data_sources
            .iter()
            .map(DataSourceDto::from)
            .collect()
    }

    pub async fn test_webdav_connection(
        endpoint: &str,
        username: &str,
        password: &str,
        root_path: Option<&str>,
    ) -> Result<(), AppError> {
        if endpoint.is_empty() {
            return Err(AppError::Config("WEBDAV_ENDPOINT_REQUIRED".into()));
        }
        if username.is_empty() {
            return Err(AppError::Config("WEBDAV_USERNAME_REQUIRED".into()));
        }
        if password.is_empty() {
            return Err(AppError::Config("WEBDAV_PASSWORD_REQUIRED".into()));
        }

        let method = reqwest::Method::from_bytes(b"PROPFIND")
            .map_err(|err| AppError::Config(err.to_string()))?;
        let target_url = build_test_url(endpoint, root_path)?;
        let client = build_client(10)?;

        let response = client
            .request(method, target_url.clone())
            .header("Depth", "0")
            .basic_auth(username, Some(password))
            .send()
            .await
            .map_err(|err| {
                if err.is_timeout() {
                    return AppError::Config(format!(
                        "WEBDAV_TIMEOUT: request did not complete within 10s ({target_url})"
                    ));
                }
                if err.is_connect() {
                    return AppError::Config(format!(
                        "WEBDAV_CONNECT_FAILED: check server address, port or network ({target_url})"
                    ));
                }
                AppError::Config(format!("WEBDAV_REQUEST_FAILED: {err} ({target_url})"))
            })?;

        let status = response.status();
        if status == reqwest::StatusCode::OK || status == reqwest::StatusCode::MULTI_STATUS {
            return Ok(());
        }
        Err(map_status_error(status, &target_url))
    }

    pub fn add_local_data_source(
        name: &str,
        root_path: &str,
        config: &mut AppConfig,
    ) -> Result<DataSourceDto, AppError> {
        if name.is_empty() {
            return Err(AppError::Config("DATASOURCE_NAME_REQUIRED".into()));
        }
        if root_path.is_empty() {
            return Err(AppError::Config("LOCAL_ROOT_PATH_REQUIRED".into()));
        }

        let canon_path = dunce::canonicalize(root_path)
            .map_err(|e| AppError::Config(format!("INVALID_DATASOURCE_PATH: {e}")))?;
        if !canon_path.is_dir() {
            return Err(AppError::Config("DATASOURCE_PATH_NOT_DIR".into()));
        }
        let canon_str = canon_path.to_string_lossy().to_string();

        if config
            .data_sources
            .iter()
            .any(|source| match &source.detail {
                DataSourceDetail::Local {
                    root_path: existing,
                } => existing == &canon_str,
                _ => false,
            })
        {
            return Err(AppError::Config("LOCAL_DATASOURCE_ALREADY_EXISTS".into()));
        }

        let source = DataSourceConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: canon_str,
            },
        };
        let dto = DataSourceDto::from(&source);
        config.data_sources.push(source);
        Ok(dto)
    }

    pub fn add_webdav_data_source(
        name: &str,
        endpoint: &str,
        username: &str,
        password: &str,
        root_path: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<DataSourceDto, AppError> {
        if name.is_empty() {
            return Err(AppError::Config("DATASOURCE_NAME_REQUIRED".into()));
        }
        if endpoint.is_empty() {
            return Err(AppError::Config("WEBDAV_ENDPOINT_REQUIRED".into()));
        }
        if username.is_empty() {
            return Err(AppError::Config("WEBDAV_USERNAME_REQUIRED".into()));
        }
        if password.is_empty() {
            return Err(AppError::Config("WEBDAV_PASSWORD_REQUIRED".into()));
        }

        if config
            .data_sources
            .iter()
            .any(|source| match &source.detail {
                DataSourceDetail::Webdav {
                    endpoint: existing_endpoint,
                    username: existing_username,
                    ..
                } => existing_endpoint == endpoint && existing_username == username,
                _ => false,
            })
        {
            return Err(AppError::Config("WEBDAV_DATASOURCE_ALREADY_EXISTS".into()));
        }

        let mut source = DataSourceConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            enabled: true,
            detail: DataSourceDetail::Webdav {
                endpoint: endpoint.to_string(),
                username: username.to_string(),
                credential_account: None,
                root_path: root_path.filter(|p| !p.is_empty()).map(ToString::to_string),
            },
        };

        if let DataSourceDetail::Webdav {
            credential_account, ..
        } = &mut source.detail
        {
            let account = credentials::webdav_password_account(&source.id);
            credentials::save_webdav_password(&account, password)?;
            *credential_account = Some(account);
        }

        let dto = DataSourceDto::from(&source);
        config.data_sources.push(source);
        Ok(dto)
    }

    pub fn remove_data_source(id: &str, config: &mut AppConfig) -> Result<(), AppError> {
        let mut webdav_accounts_to_delete = Vec::new();
        let mut is_onedrive = false;
        for source in &config.data_sources {
            if source.id != id {
                continue;
            }
            match &source.detail {
                DataSourceDetail::Webdav {
                    credential_account: Some(account),
                    ..
                } => webdav_accounts_to_delete.push(account.clone()),
                DataSourceDetail::Onedrive { .. } => is_onedrive = true,
                _ => {}
            }
        }

        let before = config.data_sources.len();
        config.data_sources.retain(|source| source.id != id);
        if before == config.data_sources.len() {
            return Err(AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", id)));
        }

        for account in webdav_accounts_to_delete {
            credentials::delete_webdav_password(&account)?;
        }
        if is_onedrive {
            let _ = credentials::delete_onedrive_refresh_token(id);
        }

        Ok(())
    }

    pub async fn list_webdav_folders(
        data_source_id: &str,
        rel_path: &str,
        config: &AppConfig,
    ) -> Result<Vec<WebdavFolderEntry>, AppError> {
        let source = config
            .data_sources
            .iter()
            .find(|s| s.id == data_source_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", data_source_id))
            })?;

        let creds = extract_credentials(source)?;

        let target_url = build_list_url(&creds.endpoint, creds.root_path.as_deref(), rel_path)?;

        info!(
            "WebDAV PROPFIND. url: \"{target_url}\", data_source_id: \"{data_source_id}\", rel_path: \"{rel_path}\""
        );

        let method = reqwest::Method::from_bytes(b"PROPFIND")
            .map_err(|err| AppError::Config(err.to_string()))?;

        let client = build_client(15)?;

        let response = client
            .request(method, target_url.clone())
            .header("Depth", "1")
            .header("Content-Type", "application/xml; charset=utf-8")
            .basic_auth(&creds.username, Some(&creds.password))
            .body(
                r#"<?xml version="1.0" encoding="utf-8" ?><d:propfind xmlns:d="DAV:"><d:allprop /></d:propfind>"#,
            )
            .send()
            .await
            .map_err(|err| {
                if err.is_timeout() {
                    return AppError::Config(format!(
                        "WEBDAV_TIMEOUT: request did not complete within 15s ({target_url})"
                    ));
                }
                if err.is_connect() {
                    return AppError::Config(format!(
                        "WEBDAV_CONNECT_FAILED: check server address, port or network ({target_url})"
                    ));
                }
                AppError::Config(format!("WEBDAV_REQUEST_FAILED: {err} ({target_url})"))
            })?;

        let status = response.status();
        if status != reqwest::StatusCode::OK && status != reqwest::StatusCode::MULTI_STATUS {
            return Err(AppError::Config(format!(
                "WEBDAV_UNEXPECTED_STATUS: {}: {target_url}",
                status.as_u16()
            )));
        }

        let xml_body = response
            .text()
            .await
            .map_err(|err| AppError::Config(format!("WEBDAV_READ_BODY_FAILED: {err}")))?;

        let base_url = build_test_url(&creds.endpoint, creds.root_path.as_deref())?;
        let entries = parse_propfind_response(&xml_body, Some(base_url.path()), rel_path)?;

        info!(
            "WebDAV folder listing. folder count: {}, data_source_id: \"{data_source_id}\", rel_path: \"{rel_path}\"",
            entries.len()
        );

        Ok(entries)
    }

    pub fn add_onedrive_data_source(
        name: &str,
        client_id: Option<&str>,
        tenant_id: Option<&str>,
        root_path: Option<&str>,
        user_name: Option<&str>,
        user_email: Option<&str>,
        refresh_token: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<DataSourceDto, AppError> {
        if name.is_empty() {
            return Err(AppError::Config("DATASOURCE_NAME_REQUIRED".into()));
        }

        let resolved_client_id = client_id
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("")
            .to_string();
        let resolved_tenant_id = tenant_id
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("consumers")
            .to_string();

        let mut source = DataSourceConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            enabled: true,
            detail: DataSourceDetail::Onedrive {
                client_id: resolved_client_id,
                tenant_id: resolved_tenant_id,
                credential_account: None,
                root_path: root_path.filter(|p| !p.is_empty()).map(ToString::to_string),
                user_name: user_name.map(ToString::to_string),
                user_email: user_email.map(ToString::to_string),
            },
        };

        let refresh_token = refresh_token.filter(|t| !t.is_empty());
        if refresh_token.is_none() {
            return Err(AppError::Auth("ONEDRIVE_REFRESH_TOKEN_REQUIRED".into()));
        }

        if let Some(rt) = refresh_token {
            let account = credentials::onedrive_refresh_token_account(&source.id);
            credentials::save_onedrive_refresh_token(&source.id, rt)?;
            if let DataSourceDetail::Onedrive {
                credential_account, ..
            } = &mut source.detail
            {
                *credential_account = Some(account);
            }
        }

        let dto = DataSourceDto::from(&source);
        config.data_sources.push(source);
        Ok(dto)
    }

    pub async fn list_onedrive_folders(
        data_source_id: &str,
        path: &str,
        config: &AppConfig,
    ) -> Result<Vec<OnedriveFolderEntry>, AppError> {
        let (client_id, tenant_id) = resolve_onedrive_source(config, data_source_id)?;

        let access_token = onedrive_token_manager()
            .get_access_token(data_source_id, Some(&client_id), Some(&tenant_id))
            .await?;

        let graph = ReqwestGraphClient::new()?;
        list_onedrive_folders_with_client(data_source_id, path, &access_token, &graph).await
    }
}

fn resolve_onedrive_source(
    config: &AppConfig,
    data_source_id: &str,
) -> Result<(String, String), AppError> {
    let source = config
        .data_sources
        .iter()
        .find(|s| s.id == data_source_id)
        .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", data_source_id)))?;

    match &source.detail {
        DataSourceDetail::Onedrive {
            client_id,
            tenant_id,
            ..
        } => Ok((client_id.clone(), tenant_id.clone())),
        _ => Err(AppError::Config("DATASOURCE_NOT_ONEDRIVE".into())),
    }
}

async fn list_onedrive_folders_with_client(
    data_source_id: &str,
    path: &str,
    access_token: &str,
    graph: &dyn GraphClient,
) -> Result<Vec<OnedriveFolderEntry>, AppError> {
    info!("OneDrive list folders. data_source_id: \"{data_source_id}\", path: \"{path}\"");
    graph.list_onedrive_folders(access_token, path).await
}

// ── Inline tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use async_trait::async_trait;

    use super::*;
    use crate::clients::graph::GraphClient;

    fn sample_onedrive_source(id: &str) -> DataSourceConfig {
        DataSourceConfig {
            id: id.to_string(),
            name: "Sample OneDrive".to_string(),
            enabled: true,
            detail: DataSourceDetail::Onedrive {
                client_id: "client-id".to_string(),
                tenant_id: "consumers".to_string(),
                credential_account: None,
                root_path: None,
                user_name: None,
                user_email: None,
            },
        }
    }

    #[test]
    fn resolve_onedrive_source_should_return_client_and_tenant_id_when_source_is_onedrive() {
        let config = AppConfig {
            data_sources: vec![sample_onedrive_source("ds-1")],
            ..Default::default()
        };

        let (client_id, tenant_id) = resolve_onedrive_source(&config, "ds-1").unwrap();
        assert_eq!(client_id, "client-id");
        assert_eq!(tenant_id, "consumers");
    }

    #[test]
    fn resolve_onedrive_source_should_return_not_found_when_source_id_is_missing() {
        let config = AppConfig::default();
        let err = resolve_onedrive_source(&config, "missing").unwrap_err();
        assert!(format!("{err}").contains("DATASOURCE_NOT_FOUND"));
    }

    #[test]
    fn resolve_onedrive_source_should_return_config_error_when_source_is_not_onedrive() {
        let config = AppConfig {
            data_sources: vec![DataSourceConfig {
                id: "ds-2".to_string(),
                name: "Local".to_string(),
                enabled: true,
                detail: DataSourceDetail::Local {
                    root_path: "/tmp".to_string(),
                },
            }],
            ..Default::default()
        };

        let err = resolve_onedrive_source(&config, "ds-2").unwrap_err();
        assert!(format!("{err}").contains("DATASOURCE_NOT_ONEDRIVE"));
    }

    struct MockGraphClient {
        result: Result<Vec<OnedriveFolderEntry>, String>,
    }

    #[async_trait]
    impl GraphClient for MockGraphClient {
        async fn get_me(&self, _access_token: &str) -> Result<serde_json::Value, AppError> {
            Ok(serde_json::json!({}))
        }

        async fn list_onedrive_folders(
            &self,
            _access_token: &str,
            _path: &str,
        ) -> Result<Vec<OnedriveFolderEntry>, AppError> {
            match &self.result {
                Ok(entries) => Ok(entries.clone()),
                Err(msg) => Err(AppError::Auth(msg.clone())),
            }
        }
    }

    #[tokio::test]
    async fn list_onedrive_folders_with_client_should_return_entries_when_client_returns_entries() {
        let graph = MockGraphClient {
            result: Ok(vec![OnedriveFolderEntry {
                name: "Books".to_string(),
                path: "Books/".to_string(),
                item_id: Some("1".to_string()),
            }]),
        };

        let entries = list_onedrive_folders_with_client("ds-1", "Books", "token", &graph)
            .await
            .unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Books");
    }

    #[tokio::test]
    async fn list_onedrive_folders_with_client_should_propagate_error_when_client_fails() {
        let graph = MockGraphClient {
            result: Err("ONEDRIVE_UNAUTHORIZED".to_string()),
        };

        let err = list_onedrive_folders_with_client("ds-1", "Books", "token", &graph)
            .await
            .unwrap_err();
        assert!(format!("{err}").contains("ONEDRIVE_UNAUTHORIZED"));
    }
}
