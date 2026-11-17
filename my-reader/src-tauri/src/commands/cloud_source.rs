use std::collections::BTreeMap;

use crate::{
    auth::{
        cloud::{self, CloudProvider},
        credentials,
    },
    commands::{common, AppState},
    error::AppError,
    models::{DataSourceDto, WebdavFolderEntry},
};
use my_reader_core::{
    api::datasource::DataSourceService,
    models::{DataSource, RemoteCredential},
};
use tauri::{AppHandle, State};

#[derive(serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CloudConnectInput {
    pub provider: CloudProvider,
    pub root_folder_id: Option<String>,
}

#[derive(serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct S3SourceInput {
    pub name: String,
    pub endpoint: String,
    pub bucket: String,
    pub region: String,
    pub root_path: Option<String>,
    pub virtual_host_style: bool,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
}

fn source_from_authorization(
    provider: CloudProvider,
    client_id: &str,
    auth: cloud::CloudAuthorization,
    root_folder_id: Option<String>,
) -> DataSource {
    let cloud::CloudAuthorization {
        name,
        account_id,
        email,
        ..
    } = auth;
    match provider {
        CloudProvider::Gdrive => DataSource::Gdrive {
            id: String::new(),
            name: name.clone(),
            enabled: true,
            client_id: client_id.to_owned(),
            account_id: Some(account_id),
            display_name: Some(name),
            email,
            root_path: None,
            root_folder_id: root_folder_id.filter(|value| !value.trim().is_empty()),
            has_refresh_token: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
        },
        CloudProvider::Dropbox => DataSource::Dropbox {
            id: String::new(),
            name: name.clone(),
            enabled: true,
            client_id: client_id.to_owned(),
            account_id: Some(account_id),
            display_name: Some(name),
            email,
            root_path: None,
            has_refresh_token: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
        },
    }
}

#[tauri::command]
#[specta::specta]
pub async fn connect_cloud_source<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    input: CloudConnectInput,
) -> Result<DataSourceDto, AppError> {
    let client_id = input.provider.client_id().to_owned();
    let auth = cloud::authorize(input.provider, &client_id).await?;
    let credential = match input.provider {
        CloudProvider::Gdrive => RemoteCredential::Gdrive {
            access_token: auth.secrets["accessToken"].clone(),
        },
        CloudProvider::Dropbox => RemoteCredential::Dropbox {
            access_token: auth.secrets["accessToken"].clone(),
        },
    };
    let secrets = auth.secrets.clone();
    let source = source_from_authorization(input.provider, &client_id, auth, input.root_folder_id);
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    let source = DataSourceService::prepare_for_upsert(&config_path, source)?;
    DataSourceService::test_connection(&source, &credential).await?;
    persist(&app, &state, source, &secrets)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authenticated_cloud_sources_keep_account_display_name_and_email() {
        let auth = cloud::CloudAuthorization {
            secrets: BTreeMap::new(),
            account_id: "account-1".into(),
            name: "Reader Account".into(),
            email: Some("reader@example.com".into()),
        };
        let source = source_from_authorization(
            CloudProvider::Gdrive,
            "client-id",
            auth,
            Some(" folder ".into()),
        );

        match source {
            DataSource::Gdrive {
                display_name,
                email,
                root_folder_id,
                ..
            } => {
                assert_eq!(display_name.as_deref(), Some("Reader Account"));
                assert_eq!(email.as_deref(), Some("reader@example.com"));
                assert_eq!(root_folder_id.as_deref(), Some(" folder "));
            }
            _ => panic!("expected Google Drive source"),
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn add_s3_source<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    input: S3SourceInput,
) -> Result<DataSourceDto, AppError> {
    let source = DataSource::S3 {
        id: String::new(),
        name: input.name,
        enabled: true,
        endpoint: input.endpoint,
        bucket: input.bucket,
        region: input.region,
        root_path: input.root_path,
        virtual_host_style: input.virtual_host_style,
        has_credentials: true,
        credential_reference: None,
        readonly: None,
        created_at: None,
    };
    let credential = RemoteCredential::S3 {
        access_key_id: input.access_key_id.clone(),
        secret_access_key: input.secret_access_key.clone(),
        session_token: input.session_token.clone(),
    };
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    let source = DataSourceService::prepare_for_upsert(&config_path, source)?;
    DataSourceService::test_connection(&source, &credential).await?;
    let mut secrets = BTreeMap::from([
        ("accessKeyId".into(), input.access_key_id),
        ("secretAccessKey".into(), input.secret_access_key),
    ]);
    if let Some(token) = input.session_token {
        secrets.insert("sessionToken".into(), token);
    }
    persist(&app, &state, source, &secrets)
}

fn persist<R: tauri::Runtime>(
    app: &AppHandle<R>,
    state: &State<'_, AppState>,
    source: DataSource,
    secrets: &BTreeMap<String, String>,
) -> Result<DataSourceDto, AppError> {
    let path = crate::config::config_path(&common::app_data_dir(app)?);
    let mut source = DataSourceService::prepare_for_upsert(&path, source)?;
    let account = format!("remote-{}", source.id());
    match &mut source {
        DataSource::Gdrive {
            credential_reference,
            ..
        }
        | DataSource::Dropbox {
            credential_reference,
            ..
        }
        | DataSource::S3 {
            credential_reference,
            ..
        } => *credential_reference = Some(account.clone()),
        _ => return Err(AppError::Config("UNSUPPORTED_CLOUD_SOURCE".into())),
    }
    credentials::save_remote_credentials(&account, secrets)?;
    let next = match DataSourceService::upsert(&path, source.clone()) {
        Ok(next) => next,
        Err(error) => {
            let _ = credentials::delete_remote_credentials(&account);
            return Err(error.into());
        }
    };
    common::with_config_mut(state, |config| {
        config.apply_core_config(&next);
    });
    Ok(DataSourceDto::from(&crate::models::DataSourceConfig::from(
        &source,
    )))
}

#[tauri::command]
#[specta::specta]
pub async fn remote_list_folders<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    data_source_id: String,
    path: String,
) -> Result<Vec<WebdavFolderEntry>, AppError> {
    let config = common::config_snapshot(&state);
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    crate::services::datasource_service::DataSourceService::list_webdav_folders(
        &data_source_id,
        &path,
        &config_path,
        &config,
    )
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn remote_create_folder<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    data_source_id: String,
    parent_path: String,
    name: String,
) -> Result<WebdavFolderEntry, AppError> {
    let config = common::config_snapshot(&state);
    let config_path = crate::config::config_path(&common::app_data_dir(&app)?);
    crate::services::datasource_service::DataSourceService::create_remote_folder(
        &data_source_id,
        &parent_path,
        &name,
        &config_path,
        &config,
    )
    .await
}
