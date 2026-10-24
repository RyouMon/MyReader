use std::path::Path;

use my_reader_core::{api::library::LibraryLocationService as Core, models};
use serde::Serialize;

use crate::{
    error::AppError,
    models::AppConfig,
    services::library_service::LibraryService,
    utils::paths::{library_root_path, library_sidecar_path},
};

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLocationInfo {
    pub library_id: String,
    pub library_name: String,
    pub data_source_id: Option<String>,
    pub data_source_name: Option<String>,
    pub source_root: String,
    pub path: String,
    pub effective_path: String,
    pub can_relocate: bool,
    pub problem: Option<String>,
    pub detail: Option<String>,
}

impl From<models::LibraryLocation> for LibraryLocationInfo {
    fn from(value: models::LibraryLocation) -> Self {
        Self {
            library_id: value.library_id,
            library_name: value.library_name,
            data_source_id: value.data_source_id,
            data_source_name: value.data_source_name,
            source_root: value.source_root,
            path: value.path,
            effective_path: value.effective_path,
            can_relocate: value.can_relocate,
            problem: value.problem.map(|problem| problem.as_str().into()),
            detail: value.detail,
        }
    }
}

async fn credential(
    config: &AppConfig,
    data_source_id: Option<&str>,
) -> Result<Option<models::RemoteCredential>, AppError> {
    let Some(id) = data_source_id else {
        return Ok(None);
    };
    let source = config
        .data_sources
        .iter()
        .find(|source| source.id == id)
        .ok_or_else(|| AppError::Config("DATASOURCE_NOT_FOUND".into()))?;
    if matches!(source.detail, crate::models::DataSourceDetail::Local { .. }) {
        return Ok(None);
    }
    crate::storage::core_remote_credential(source)
        .await
        .map(Some)
}

pub async fn location(
    app_data_dir: &Path,
    config: &AppConfig,
    id: &str,
    diagnose: bool,
) -> Result<LibraryLocationInfo, AppError> {
    let path = crate::config::config_path(app_data_dir);
    if !diagnose {
        return Ok(Core::describe(&path, id)?.into());
    }
    let library = LibraryService::resolve_library(Some(id), config)?;
    let credential = credential(config, library.data_source_id.as_deref()).await;
    // Missing credentials must still leave the current path and settings action visible.
    let credential = match credential {
        Ok(value) => value,
        Err(error) => {
            let mut location = Core::describe(&path, id)?;
            location.problem = Some(
                match super::sync_service::SyncService::failure_kind(&error) {
                    models::SyncFailureKind::Connectivity => {
                        models::LibraryLocationProblem::Connectivity
                    }
                    models::SyncFailureKind::Configuration => {
                        models::LibraryLocationProblem::DataSource
                    }
                    _ => models::LibraryLocationProblem::Credential,
                },
            );
            location.detail = Some(error.to_string());
            return Ok(location.into());
        }
    };
    Ok(Core::diagnose(
        &path,
        id,
        &library_root_path(&library, app_data_dir),
        credential.as_ref(),
    )
    .await?
    .into())
}

pub async fn relocate(
    app_data_dir: &Path,
    config: &mut AppConfig,
    id: &str,
    target: &str,
) -> Result<LibraryLocationInfo, AppError> {
    let library = LibraryService::resolve_library(Some(id), config)?;
    let credential = credential(config, library.data_source_id.as_deref()).await?;
    let result = Core::relocate(
        &crate::config::config_path(app_data_dir),
        id,
        &library_sidecar_path(&library, app_data_dir),
        models::RelocateLibraryRequest {
            target_path: target.into(),
            target_uri: None,
            security_scoped_bookmark: None,
        },
        credential.as_ref(),
    )
    .await?;
    if let Some(updated) = result.config {
        config.apply_core_config(&updated);
    }
    Ok(result.location.into())
}
