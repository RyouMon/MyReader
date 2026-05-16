use tracing::{error, info};
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{DataSourceDto, WebdavFolderEntry};
use crate::config;
use crate::services::datasource_service::DataSourceService;

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

    let result = DataSourceService::test_webdav_connection(endpoint, username, password, root_path).await;

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
    let result = {
        let config = state.lock().unwrap_or_else(|e| e.into_inner());
        Ok(DataSourceService::list_data_sources(&config))
    };
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
        let mut config = state.lock().unwrap_or_else(|e| e.into_inner());
        let dto = DataSourceService::add_local_data_source(name, root_path, &mut config)?;

        let config_path = app.path().app_data_dir()?.join("config.json");
        config::save_config(&config_path, &config)?;
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
        let mut config = state.lock().unwrap_or_else(|e| e.into_inner());
        let dto = DataSourceService::add_webdav_data_source(
            name, endpoint, username, password, root_path, &mut config,
        )?;

        let config_path = app.path().app_data_dir()?.join("config.json");
        config::save_config(&config_path, &config)?;
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
        let mut config = state.lock().unwrap_or_else(|e| e.into_inner());
        DataSourceService::remove_data_source(&id, &mut config)?;

        let config_path = app.path().app_data_dir()?.join("config.json");
        config::save_config(&config_path, &config)?;
        Ok(())
    })();
    match &result {
        Ok(()) => info!("Success to remove data source. id: \"{id}\""),
        Err(err) => error!("Failed to remove data source. id: \"{id}\", error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
/// 列出指定 WebDAV 数据源中某个路径下的所有文件夹。
pub async fn webdav_list_folders(
    state: State<'_, AppState>,
    data_source_id: String,
    path: String,
) -> Result<Vec<WebdavFolderEntry>, AppError> {
    info!(
        "Start to list WebDAV folders. data_source_id: \"{data_source_id}\", path: \"{path}\""
    );
    let config = {
        let guard = state.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };
    let result = DataSourceService::list_webdav_folders(&data_source_id, &path, &config).await;
    match &result {
        Ok(folders) => info!(
            "Success to list WebDAV folders. data_source_id: \"{data_source_id}\", count: {}",
            folders.len()
        ),
        Err(err) => error!(
            "Failed to list WebDAV folders. data_source_id: \"{data_source_id}\", error: {err}"
        ),
    }
    result
}
