use crate::error::AppError;
use crate::models::{AppConfig, DataSourceConfig, DataSourceDetail, DataSourceDto};
use crate::sync::credentials;

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
        let target_url = build_webdav_test_url(endpoint, root_path)?;
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

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
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::Config(format!(
                "WEBDAV_UNAUTHORIZED: {target_url}"
            )));
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(AppError::Config(format!(
                "WEBDAV_FORBIDDEN: {target_url}"
            )));
        }
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(AppError::Config(format!(
                "WEBDAV_NOT_FOUND: {target_url}"
            )));
        }
        Err(AppError::Config(format!(
            "WEBDAV_UNEXPECTED_STATUS: {}: {target_url}",
            status.as_u16()
        )))
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

        if config.data_sources.iter().any(|source| match &source.detail {
            DataSourceDetail::Local { root_path: existing } => existing == root_path,
            _ => false,
        }) {
            return Err(AppError::Config("LOCAL_DATASOURCE_ALREADY_EXISTS".into()));
        }

        let source = DataSourceConfig {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: root_path.to_string(),
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
}

/// 将用户输入的根路径规整为以 `/` 开头的绝对路径。
pub fn normalize_webdav_root_path(root_path: Option<&str>) -> String {
    let trimmed = root_path.unwrap_or("/").trim();
    if trimmed.is_empty() {
        return "/".to_string();
    }
    if trimmed.starts_with('/') {
        return trimmed.to_string();
    }
    format!("/{}", trimmed)
}

/// 根据 endpoint 与 rootPath 组装用于探活的 WebDAV URL。
pub fn build_webdav_test_url(
    endpoint: &str,
    root_path: Option<&str>,
) -> Result<reqwest::Url, AppError> {
    let mut url = reqwest::Url::parse(endpoint.trim())
        .map_err(|err| AppError::Config(format!("INVALID_WEBDAV_ENDPOINT: {err}")))?;
    let normalized_root = normalize_webdav_root_path(root_path);
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
