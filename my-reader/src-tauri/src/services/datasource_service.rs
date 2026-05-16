use tracing::info;

use crate::error::AppError;
use crate::models::{AppConfig, DataSourceConfig, DataSourceDetail, DataSourceDto, WebdavFolderEntry};
use crate::sync::credentials;
use crate::utils::http::{
    build_client, build_list_url, build_test_url, extract_credentials, map_status_error,
    parse_propfind_response,
};

pub struct DataSourceService;

impl DataSourceService {
    pub fn list_data_sources(config: &AppConfig) -> Vec<DataSourceDto> {
        config.data_sources.iter().map(DataSourceDto::from).collect()
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

        if config.data_sources.iter().any(|source| match &source.detail {
            DataSourceDetail::Local { root_path: existing } => existing == &canon_str,
            _ => false,
        }) {
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

        if config.data_sources.iter().any(|source| match &source.detail {
            DataSourceDetail::Webdav {
                endpoint: existing_endpoint,
                username: existing_username,
                ..
            } => existing_endpoint == endpoint && existing_username == username,
            _ => false,
        }) {
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
        for source in &config.data_sources {
            if source.id != id {
                continue;
            }
            if let DataSourceDetail::Webdav {
                credential_account: Some(account),
                ..
            } = &source.detail
            {
                webdav_accounts_to_delete.push(account.clone());
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
            .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", data_source_id)))?;

        let creds = extract_credentials(source)?;

        let target_url = build_list_url(
            &creds.endpoint,
            creds.root_path.as_deref(),
            rel_path,
        )?;

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

        let xml_body = response.text().await.map_err(|err| {
            AppError::Config(format!("WEBDAV_READ_BODY_FAILED: {err}"))
        })?;

        let entries = parse_propfind_response(&xml_body, creds.root_path.as_deref(), rel_path)?;

        info!(
            "WebDAV folder listing. folder count: {}, data_source_id: \"{data_source_id}\", rel_path: \"{rel_path}\"",
            entries.len()
        );

        Ok(entries)
    }
}