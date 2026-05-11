use super::*;

#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewLocalDataSourceInput {
    pub name: String,
    pub root_path: String,
}

/// 新建 WebDAV 数据源时的入参。
#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewWebdavDataSourceInput {
    pub name: String,
    pub endpoint: String,
    pub username: String,
    pub password: String,
    pub root_path: Option<String>,
}

/// 测试 WebDAV 连接时的入参。
#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TestWebdavConnectionInput {
    pub endpoint: String,
    pub username: String,
    pub password: String,
    pub root_path: Option<String>,
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

#[tauri::command]
#[specta::specta]
/// 使用真实 WebDAV 请求进行连接测试，成功返回 `Ok(())`。
pub async fn test_webdav_connection(input: TestWebdavConnectionInput) -> Result<(), AppError> {
    let endpoint = input.endpoint.trim();
    let username = input.username.trim();
    let password = input.password.trim();
    let root_path = input.root_path.as_deref();
    info!(
        "Start to test WebDAV connection. endpoint: \"{}\", username: \"{}\"",
        endpoint, username
    );

    let result = async {
        if endpoint.is_empty() {
            return Err(AppError::Config("WEBDAV_ENDPOINT_REQUIRED".into()));
        }
        if username.is_empty() {
            return Err(AppError::Config("WEBDAV_USERNAME_REQUIRED".into()));
        }
        if password.is_empty() {
            return Err(AppError::Config("WEBDAV_PASSWORD_REQUIRED".into()));
        }

        let method =
            Method::from_bytes(b"PROPFIND").map_err(|err| AppError::Config(err.to_string()))?;
        let target_url = build_webdav_test_url(endpoint, root_path)?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|err| AppError::Config(format!("HTTP_CLIENT_BUILD_FAILED: {err}")))?;

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
                "连接失败：服务返回 401 Unauthorized，用户名或密码错误（{}）",
                target_url
            )));
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(AppError::Config(format!(
                "连接失败：服务返回 403 Forbidden，当前账号无访问权限（{}）",
                target_url
            )));
        }
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(AppError::Config(format!(
                "连接失败：服务返回 404 Not Found，远程根路径不存在（{}）",
                target_url
            )));
        }
        Err(AppError::Config(format!(
            "连接失败：服务返回状态码 {}（{}）",
            status.as_u16(),
            target_url
        )))
    }
    .await;

    match &result {
        Ok(()) => info!(
            "Success to test WebDAV connection. endpoint: \"{}\", username: \"{}\"",
            endpoint, username
        ),
        Err(err) => error!(
            "Failed to test WebDAV connection. endpoint: \"{}\", username: \"{}\", error: {err}",
            endpoint, username
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
/// 返回已配置的数据源列表（敏感字段会在 DTO 层做脱敏）。
pub fn list_data_sources(
    state: State<'_, AppState>,
) -> Result<Vec<DataSourceDto>, AppError> {
    info!("Start to list data sources.");
    let result = (|| {
        let config = state.lock().unwrap();
        let sources = config
            .data_sources
            .iter()
            .map(DataSourceDto::from)
            .collect::<Vec<_>>();
        Ok(sources)
    })();

    match &result {
        Ok(sources) => info!("Success to list data sources. count: {}", sources.len()),
        Err(err) => error!("Failed to list data sources. error: {err}"),
    }

    result
}

#[tauri::command]
#[specta::specta]
/// 新增本地目录类型数据源。
pub fn add_local_data_source(
    app: AppHandle,
    state: State<'_, AppState>,
    input: NewLocalDataSourceInput,
) -> Result<DataSourceDto, AppError> {
    let name = input.name.trim();
    let root_path = input.root_path.trim();
    info!(
        "Start to add local data source. name: \"{}\", root path: \"{}\"",
        name, root_path
    );
    let result = (|| {
        if name.is_empty() {
            return Err(AppError::Config("DATASOURCE_NAME_REQUIRED".into()));
        }
        if root_path.is_empty() {
            return Err(AppError::Config("LOCAL_ROOT_PATH_REQUIRED".into()));
        }

        let mut config = state.lock().unwrap();
        if config.data_sources.iter().any(|source| match &source.detail {
            DataSourceDetail::Local {
                root_path: existing,
            } => existing == root_path,
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
        save_config(&app, &config)?;
        Ok(dto)
    })();

    match &result {
        Ok(source) => info!(
            "Success to add local data source. id: \"{}\", name: \"{}\"",
            source.id, source.name
        ),
        Err(err) => error!("Failed to add local data source. error: {err}"),
    }

    result
}

#[tauri::command]
#[specta::specta]
/// 新增 WebDAV 类型数据源。
pub fn add_webdav_data_source(
    app: AppHandle,
    state: State<'_, AppState>,
    input: NewWebdavDataSourceInput,
) -> Result<DataSourceDto, AppError> {
    let name = input.name.trim();
    let endpoint = input.endpoint.trim();
    let username = input.username.trim();
    let password = input.password.trim();
    let root_path = input.root_path.as_deref().map(str::trim);
    info!(
        "Start to add WebDAV data source. name: \"{}\", endpoint: \"{}\", username: \"{}\"",
        name, endpoint, username
    );
    let result = (|| {
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

        let mut config = state.lock().unwrap();
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
                root_path: root_path
                    .filter(|path| !path.is_empty())
                    .map(ToString::to_string),
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
        save_config(&app, &config)?;
        Ok(dto)
    })();

    match &result {
        Ok(source) => info!(
            "Success to add WebDAV data source. id: \"{}\", name: \"{}\"",
            source.id, source.name
        ),
        Err(err) => error!("Failed to add WebDAV data source. error: {err}"),
    }

    result
}

#[tauri::command]
#[specta::specta]
/// 删除指定数据源。
pub fn remove_data_source(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to remove data source. id: \"{id}\"");
    let result = (|| {
        let mut config = state.lock().unwrap();
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
        save_config(&app, &config)?;
        Ok(())
    })();

    match &result {
        Ok(()) => info!("Success to remove data source. id: \"{id}\""),
        Err(err) => error!("Failed to remove data source. id: \"{id}\", error: {err}"),
    }

    result
}

