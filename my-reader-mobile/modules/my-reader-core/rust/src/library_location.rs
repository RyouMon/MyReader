use std::path::Path;

use crate::{
    types::{AppConfig, RemoteCredential, SecurityScopedBookmark},
    CoreFfiError,
};
use my_reader_core::{api::library::LibraryLocationService, models};

#[derive(Debug, Clone, uniffi::Record)]
pub struct LibraryLocation {
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

impl From<models::LibraryLocation> for LibraryLocation {
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

#[derive(Debug, Clone, uniffi::Record)]
pub struct RelocateLibraryResult {
    pub location: LibraryLocation,
    pub config: Option<AppConfig>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct RelocateLibraryRequest {
    pub target_path: String,
    pub target_uri: Option<String>,
    pub security_scoped_bookmark: Option<SecurityScopedBookmark>,
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_location(
    config_path: String,
    library_id: String,
    local_root_path: String,
    credential: Option<RemoteCredential>,
    diagnose: bool,
) -> Result<LibraryLocation, CoreFfiError> {
    let credential = credential.map(TryInto::try_into).transpose()?;
    let result = if diagnose {
        LibraryLocationService::diagnose(
            Path::new(&config_path),
            &library_id,
            Path::new(&local_root_path),
            credential.as_ref(),
        )
        .await
    } else {
        LibraryLocationService::describe(Path::new(&config_path), &library_id)
    };
    result.map(Into::into).map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn library_relocate(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    request: RelocateLibraryRequest,
    credential: Option<RemoteCredential>,
) -> Result<RelocateLibraryResult, CoreFfiError> {
    let credential = credential.map(TryInto::try_into).transpose()?;
    let result = LibraryLocationService::relocate(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        models::RelocateLibraryRequest {
            target_path: request.target_path,
            target_uri: request.target_uri,
            security_scoped_bookmark: request.security_scoped_bookmark.map(Into::into),
        },
        credential.as_ref(),
    )
    .await
    .map_err(CoreFfiError::from_core)?;
    Ok(RelocateLibraryResult {
        location: result.location.into(),
        config: result.config.map(Into::into),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn ffi_preserves_diagnostics_and_only_returns_config_after_a_valid_repair() {
        let temp = tempfile::tempdir().unwrap();
        let config = temp.path().join("app/config.json");
        let root = temp.path().join("external");
        let sidecars = temp.path().join("app/libraries");
        let (_, library) = my_reader_core::api::library::LibraryService::create_local_myreader(
            &config,
            models::LocalLibraryRequest {
                library_root_path: root.to_string_lossy().into_owned(),
                path: root.to_string_lossy().into_owned(),
                source_path: None,
                sidecar_container_parent_path: Some(sidecars.to_string_lossy().into_owned()),
                name: Some("Books".into()),
                metadata_uri: None,
                added_at: None,
                security_scoped_bookmark: None,
            },
            100,
        )
        .await
        .unwrap();
        let config = config.to_string_lossy().into_owned();
        let described = library_location(
            config.clone(),
            library.id.clone(),
            library.path.clone(),
            None,
            false,
        )
        .await
        .unwrap();
        assert!(described.can_relocate);
        assert_eq!(described.library_name, "Books");
        let target = temp.path().join("moved");
        std::fs::rename(&library.path, &target).unwrap();
        let diagnosis = library_location(
            config.clone(),
            library.id.clone(),
            library.path.clone(),
            None,
            true,
        )
        .await
        .unwrap();
        assert_eq!(diagnosis.problem.as_deref(), Some("root_missing"));
        assert!(diagnosis.detail.is_some());
        let sidecar = sidecars.join(&library.id).to_string_lossy().into_owned();
        let rejected = library_relocate(
            config.clone(),
            library.id.clone(),
            sidecar.clone(),
            RelocateLibraryRequest {
                target_path: library.path.clone(),
                target_uri: None,
                security_scoped_bookmark: None,
            },
            None,
        )
        .await
        .unwrap();
        assert!(rejected.config.is_none());
        let repaired = library_relocate(
            config.clone(),
            library.id.clone(),
            sidecar,
            RelocateLibraryRequest {
                target_path: target.to_string_lossy().into_owned(),
                target_uri: None,
                security_scoped_bookmark: None,
            },
            None,
        )
        .await
        .unwrap();
        assert!(repaired.location.problem.is_none());
        assert_eq!(repaired.config.unwrap().libraries[0].id, library.id);
        assert!(
            library_location(config, "missing-id".into(), String::new(), None, false)
                .await
                .is_err()
        );
    }

    #[test]
    fn problem_codes_remain_stable_across_the_ffi_boundary() {
        for problem in [
            "root_missing",
            "path_unavailable",
            "invalid_library",
            "identity_unknown",
            "identity_mismatch",
            "credential",
            "connectivity",
            "data_source",
            "busy",
            "changed",
            "managed",
            "save_failed",
        ] {
            let problem_value: models::LibraryLocationProblem =
                serde_json::from_value(serde_json::json!(problem)).unwrap();
            let location: LibraryLocation = models::LibraryLocation {
                library_id: "lib".into(),
                library_name: "Books".into(),
                data_source_id: None,
                data_source_name: None,
                source_root: "/".into(),
                path: "/old".into(),
                effective_path: "/old".into(),
                can_relocate: true,
                problem: Some(problem_value),
                detail: None,
            }
            .into();
            assert_eq!(location.problem.as_deref(), Some(problem));
        }
    }
}
