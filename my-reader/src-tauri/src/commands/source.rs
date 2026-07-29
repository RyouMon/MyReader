use tauri::{AppHandle, State};
use tracing::{error, info};

use crate::auth::onedrive::onedrive_token_manager;
use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{DataSourceDto, OnedriveAuthResultDto, OnedriveFolderEntry, WebdavFolderEntry};
use crate::services::datasource_service::DataSourceService;

#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewLocalDataSourceInput {
    pub name: String,
    pub root_path: String,
}

#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewWebdavDataSourceInput {
    pub name: String,
    pub endpoint: String,
    pub username: String,
    pub password: String,
    pub root_path: Option<String>,
}

#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TestWebdavConnectionInput {
    pub endpoint: String,
    pub username: String,
    pub password: String,
    pub root_path: Option<String>,
}

#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct OnedriveStartAuthInput {
    pub client_id: Option<String>,
    pub tenant_id: Option<String>,
}

#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewOnedriveDataSourceInput {
    pub name: String,
    pub client_id: Option<String>,
    pub tenant_id: Option<String>,
    pub root_path: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub refresh_token: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn test_webdav_connection(input: TestWebdavConnectionInput) -> Result<(), AppError> {
    let endpoint = input.endpoint.trim();
    let username = input.username.trim();
    let password = input.password.trim();
    let root_path = input.root_path.as_deref();
    info!(
        "Start to test WebDAV connection. endpoint: \"{}\", username: \"{}\"",
        endpoint, username
    );
    let result =
        DataSourceService::test_webdav_connection(endpoint, username, password, root_path).await;
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
pub fn list_data_sources(state: State<'_, AppState>) -> Result<Vec<DataSourceDto>, AppError> {
    info!("Start to list data sources.");
    let config = common::config_snapshot(&state);
    let sources = DataSourceService::list_data_sources(&config);
    for s in &sources {
        let (user_name, user_email) = match &s.detail {
            crate::models::DataSourceDetailDto::Onedrive {
                user_name,
                user_email,
                ..
            } => (
                user_name.as_deref().unwrap_or("None"),
                user_email.as_deref().unwrap_or("None"),
            ),
            _ => ("-", "-"),
        };
        info!(
            "list_data_sources source id={} kind={:?} name={:?} user_name={} user_email={}",
            s.id, s.detail, s.name, user_name, user_email
        );
    }
    info!("Success to list data sources. count: {}", sources.len());
    Ok(sources)
}

#[tauri::command]
#[specta::specta]
pub fn add_local_data_source<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    input: NewLocalDataSourceInput,
) -> Result<DataSourceDto, AppError> {
    let name = input.name.trim();
    let root_path = input.root_path.trim();
    info!(
        "Start to add local data source. name: \"{}\", root path: \"{}\"",
        name, root_path
    );
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    let result = common::with_config_mut_then_persist(&app, &state, |config| {
        DataSourceService::add_local_data_source(name, root_path, &config_path, config)
    });
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
pub fn add_webdav_data_source<R: tauri::Runtime>(
    app: AppHandle<R>,
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
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    let result = common::with_config_mut_then_persist(&app, &state, |config| {
        DataSourceService::add_webdav_data_source(
            name,
            endpoint,
            username,
            password,
            root_path,
            &config_path,
            config,
        )
    });
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
pub async fn onedrive_start_auth(
    input: OnedriveStartAuthInput,
) -> Result<OnedriveAuthResultDto, AppError> {
    info!("Start OneDrive OAuth2 flow.");
    let result = onedrive_token_manager()
        .start_auth_flow(input.client_id.as_deref(), input.tenant_id.as_deref())
        .await;
    match result {
        Ok(auth_result) => {
            info!(
                "Success OneDrive auth. user_name={:?} user_email={:?}",
                auth_result.user_info.display_name, auth_result.user_info.email
            );
            Ok(OnedriveAuthResultDto {
                access_token: auth_result.access_token,
                refresh_token: auth_result.refresh_token,
                user_name: auth_result.user_info.display_name,
                user_email: auth_result.user_info.email,
            })
        }
        Err(err) => {
            error!("Failed OneDrive auth. error: {err}");
            Err(err)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn add_onedrive_data_source<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    input: NewOnedriveDataSourceInput,
) -> Result<DataSourceDto, AppError> {
    let name = input.name.trim();
    info!(
        "Start to add OneDrive data source. name=\"{}\" user_name={:?} user_email={:?}",
        name, input.user_name, input.user_email
    );
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    let result = common::with_config_mut_then_persist(&app, &state, |config| {
        DataSourceService::add_onedrive_data_source(
            name,
            input.client_id.as_deref(),
            input.tenant_id.as_deref(),
            input.root_path.as_deref(),
            input.user_name.as_deref(),
            input.user_email.as_deref(),
            input.refresh_token.as_deref(),
            &config_path,
            config,
        )
    });
    match &result {
        Ok(source) => {
            let (user_name, user_email) = match &source.detail {
                crate::models::DataSourceDetailDto::Onedrive {
                    user_name,
                    user_email,
                    ..
                } => (
                    user_name.as_deref().unwrap_or("None"),
                    user_email.as_deref().unwrap_or("None"),
                ),
                _ => ("-", "-"),
            };
            info!(
                "Success to add OneDrive data source. id=\"{}\" name=\"{}\" user_name={} user_email={}",
                source.id, source.name, user_name, user_email
            )
        }
        Err(err) => error!("Failed to add OneDrive data source. error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub fn remove_data_source<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to remove data source. id: \"{id}\"");
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    let result = common::with_config_mut_then_persist(&app, &state, |config| {
        DataSourceService::remove_data_source(&id, &config_path, config)
    });
    match &result {
        Ok(()) => info!("Success to remove data source. id: \"{id}\""),
        Err(err) => error!("Failed to remove data source. id: \"{id}\", error: {err}"),
    }
    result
}

#[tauri::command]
#[specta::specta]
pub async fn webdav_list_folders<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    data_source_id: String,
    path: String,
) -> Result<Vec<WebdavFolderEntry>, AppError> {
    info!("Start to list WebDAV folders. data_source_id: \"{data_source_id}\", path: \"{path}\"");
    let config = common::config_snapshot(&state);
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    let result =
        DataSourceService::list_webdav_folders(&data_source_id, &path, &config_path, &config).await;
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

#[tauri::command]
#[specta::specta]
pub async fn onedrive_list_folders<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    data_source_id: String,
    path: String,
) -> Result<Vec<OnedriveFolderEntry>, AppError> {
    info!("Start to list OneDrive folders. data_source_id: \"{data_source_id}\", path: \"{path}\"");
    let config = common::config_snapshot(&state);
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    let result =
        DataSourceService::list_onedrive_folders(&data_source_id, &path, &config_path, &config)
            .await;
    match &result {
        Ok(folders) => info!(
            "Success to list OneDrive folders. data_source_id: \"{data_source_id}\", count: {}",
            folders.len()
        ),
        Err(err) => error!(
            "Failed to list OneDrive folders. data_source_id: \"{data_source_id}\", error: {err}"
        ),
    }
    result
}
