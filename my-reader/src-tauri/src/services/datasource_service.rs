use std::path::Path;

use crate::auth::credentials;
use crate::error::AppError;
use crate::models::{
    AppConfig, DataSourceConfig, DataSourceDetail, DataSourceDto, OnedriveFolderEntry,
    WebdavFolderEntry,
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
        let source = myreader_core::models::DataSource::Webdav {
            id: "connection-test".into(),
            name: "Connection Test".into(),
            enabled: true,
            endpoint: endpoint.into(),
            username: username.into(),
            root_path: root_path.map(ToOwned::to_owned),
            has_password: !password.trim().is_empty(),
            credential_reference: None,
            readonly: None,
            created_at: None,
        };
        myreader_core::api::datasource::test_connection(
            &source,
            &myreader_core::models::RemoteCredential::Webdav {
                password: password.into(),
            },
        )
        .await
        .map_err(Into::into)
    }

    pub fn add_local_data_source(
        name: &str,
        root_path: &str,
        registry_path: &Path,
        config: &mut AppConfig,
    ) -> Result<DataSourceDto, AppError> {
        myreader_core::api::registry::load_or_initialize(
            registry_path,
            Some(config.device_registry()),
        )?;
        let registry =
            myreader_core::api::registry::add_local_data_source(registry_path, name, root_path)?;
        config.apply_device_registry(&registry);
        config
            .data_sources
            .last()
            .map(DataSourceDto::from)
            .ok_or_else(|| AppError::Config("DATASOURCE_REGISTRY_WRITE_FAILED".into()))
    }

    pub fn add_webdav_data_source(
        name: &str,
        endpoint: &str,
        username: &str,
        password: &str,
        root_path: Option<&str>,
        registry_path: &Path,
        config: &mut AppConfig,
    ) -> Result<DataSourceDto, AppError> {
        myreader_core::api::registry::load_or_initialize(
            registry_path,
            Some(config.device_registry()),
        )?;
        if password.is_empty() {
            return Err(AppError::Config("WEBDAV_PASSWORD_REQUIRED".into()));
        }

        let prepared = myreader_core::api::registry::prepare_data_source(
            myreader_core::models::DataSource::Webdav {
                id: String::new(),
                name: name.into(),
                enabled: true,
                endpoint: endpoint.into(),
                username: username.into(),
                root_path: root_path.map(ToOwned::to_owned),
                has_password: true,
                credential_reference: None,
                readonly: None,
                created_at: None,
            },
        )?;
        let mut source = DataSourceConfig::from(&prepared);
        myreader_core::api::registry::ensure_data_source_can_upsert(registry_path, &prepared)?;

        if let DataSourceDetail::Webdav {
            credential_account, ..
        } = &mut source.detail
        {
            let account = credentials::webdav_password_account(&source.id);
            credentials::save_webdav_password(&account, password)?;
            *credential_account = Some(account);
        }

        let registry =
            myreader_core::api::registry::upsert_data_source(registry_path, (&source).into())?;
        config.apply_device_registry(&registry);
        config
            .data_sources
            .iter()
            .find(|candidate| candidate.id == source.id)
            .map(DataSourceDto::from)
            .ok_or_else(|| AppError::Config("DATASOURCE_REGISTRY_WRITE_FAILED".into()))
    }

    pub fn remove_data_source(
        id: &str,
        registry_path: &Path,
        config: &mut AppConfig,
    ) -> Result<(), AppError> {
        myreader_core::api::registry::load_or_initialize(
            registry_path,
            Some(config.device_registry()),
        )?;
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

        let registry = myreader_core::api::registry::remove_data_source(registry_path, id)?;
        config.apply_device_registry(&registry);

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
        registry_path: &Path,
        config: &AppConfig,
    ) -> Result<Vec<WebdavFolderEntry>, AppError> {
        let source = config
            .data_sources
            .iter()
            .find(|s| s.id == data_source_id)
            .ok_or_else(|| {
                AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {}", data_source_id))
            })?;

        let credential = crate::storage::core_remote_credential(source).await?;
        Ok(myreader_core::api::datasource::list_directories(
            registry_path,
            data_source_id,
            rel_path,
            &credential,
        )
        .await?
        .into_iter()
        .map(|entry| WebdavFolderEntry {
            name: entry.name,
            path: entry.path,
        })
        .collect())
    }

    pub fn add_onedrive_data_source(
        name: &str,
        client_id: Option<&str>,
        tenant_id: Option<&str>,
        root_path: Option<&str>,
        user_name: Option<&str>,
        user_email: Option<&str>,
        refresh_token: Option<&str>,
        registry_path: &Path,
        config: &mut AppConfig,
    ) -> Result<DataSourceDto, AppError> {
        myreader_core::api::registry::load_or_initialize(
            registry_path,
            Some(config.device_registry()),
        )?;
        let prepared = myreader_core::api::registry::prepare_data_source(
            myreader_core::models::DataSource::Onedrive {
                id: String::new(),
                name: name.into(),
                enabled: true,
                client_id: client_id.unwrap_or_default().into(),
                tenant_id: tenant_id.map(ToOwned::to_owned),
                display_name: user_name.map(ToOwned::to_owned),
                email: user_email.map(ToOwned::to_owned),
                root_path: root_path.map(ToOwned::to_owned),
                has_refresh_token: refresh_token.is_some_and(|value| !value.trim().is_empty()),
                credential_reference: None,
                readonly: None,
                created_at: None,
            },
        )?;
        let mut source = DataSourceConfig::from(&prepared);
        myreader_core::api::registry::ensure_data_source_can_upsert(registry_path, &prepared)?;

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

        let registry =
            myreader_core::api::registry::upsert_data_source(registry_path, (&source).into())?;
        config.apply_device_registry(&registry);
        config
            .data_sources
            .iter()
            .find(|candidate| candidate.id == source.id)
            .map(DataSourceDto::from)
            .ok_or_else(|| AppError::Config("DATASOURCE_REGISTRY_WRITE_FAILED".into()))
    }

    pub async fn list_onedrive_folders(
        data_source_id: &str,
        path: &str,
        registry_path: &Path,
        config: &AppConfig,
    ) -> Result<Vec<OnedriveFolderEntry>, AppError> {
        let source = config
            .data_sources
            .iter()
            .find(|source| source.id == data_source_id)
            .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
        let credential = crate::storage::core_remote_credential(source).await?;
        Ok(myreader_core::api::datasource::list_directories(
            registry_path,
            data_source_id,
            path,
            &credential,
        )
        .await?
        .into_iter()
        .map(|entry| OnedriveFolderEntry {
            name: entry.name,
            path: entry.path,
            item_id: None,
        })
        .collect())
    }
}
