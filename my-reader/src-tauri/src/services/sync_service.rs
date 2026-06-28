use std::collections::HashSet;
use std::path::{Path, PathBuf};

use opendal::Operator;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use tracing::{info, warn};

use crate::db;
use crate::error::AppError;
use crate::models::AppConfig;
use crate::storage::{self, StorageBackend};
use crate::sync::db_sync::{LwwProvider, SyncProvider};
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct SyncService;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LibraryPathKind {
    Local,
    Remote,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DbSyncReport {
    pub pushed: usize,
    pub pulled: usize,
}

impl SyncService {
    pub async fn sync_db_for_library(
        app_data_dir: &Path,
        config: &mut AppConfig,
        library_id: &str,
    ) -> Result<DbSyncReport, AppError> {
        info!("Start to sync db for library. id: \"{}\"", library_id);

        let (sidecar_path, _) =
            Self::resolve_library_sidecar_path(app_data_dir, config, library_id)?;
        let (lib_path, kind, _) = Self::resolve_library_path(app_data_dir, config, library_id)?;

        let device = Self::ensure_device_id(config);
        let db = Self::open_library_db(&sidecar_path).await?;
        let provider = LwwProvider::default_for_myreader();

        let container_op = storage::build_operator(&StorageBackend::LocalDirect {
            root: sidecar_path.to_string_lossy().to_string(),
        })?;

        let pushed = provider
            .push_async(&db, &container_op, &device)
            .await
            .unwrap_or_else(|e| {
                warn!("db sync: push error: {e}");
                0
            });

        let pulled = if kind == LibraryPathKind::Local {
            Self::mirror_changes_to_external(
                &container_op,
                &storage::build_operator(&StorageBackend::LocalDirect {
                    root: lib_path.to_string_lossy().to_string(),
                })?,
                &device,
            )
            .await
            .unwrap_or_else(|e| {
                warn!("db sync: mirror to external error: {e}");
                0
            });

            let original_op = storage::build_operator(&StorageBackend::LocalDirect {
                root: lib_path.to_string_lossy().to_string(),
            })?;
            provider
                .pull_async(&db, &original_op, &device)
                .await
                .unwrap_or_else(|e| {
                    warn!("db sync: pull error: {e}");
                    0
                })
        } else {
            provider
                .pull_async(&db, &container_op, &device)
                .await
                .unwrap_or_else(|e| {
                    warn!("db sync: pull error: {e}");
                    0
                })
        };

        info!("Success to sync db for library. pushed={pushed}, pulled={pulled}");
        Ok(DbSyncReport { pushed, pulled })
    }

    fn resolve_library_path(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
    ) -> Result<(PathBuf, LibraryPathKind, String), AppError> {
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == library_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {library_id}")))?;

        let kind = if lib.is_remote() {
            LibraryPathKind::Remote
        } else {
            LibraryPathKind::Local
        };

        Ok((library_root_path(lib, app_data_dir), kind, lib.id.clone()))
    }

    fn resolve_library_sidecar_path(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
    ) -> Result<(PathBuf, String), AppError> {
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == library_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {library_id}")))?;
        Ok((library_sidecar_path(lib, app_data_dir), lib.id.clone()))
    }

    async fn open_library_db(sidecar_path: &Path) -> Result<DatabaseConnection, AppError> {
        let path_str = sidecar_path
            .to_str()
            .ok_or_else(|| AppError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
        db::open_db(path_str).await
    }

    fn ensure_device_id(config: &mut AppConfig) -> String {
        if let Some(id) = &config.device_id {
            if !id.is_empty() {
                return id.clone();
            }
        }
        let id = uuid::Uuid::new_v4().to_string();
        config.device_id = Some(id.clone());
        id
    }
}

impl SyncService {
    async fn mirror_changes_to_external(
        container_op: &Operator,
        original_op: &Operator,
        device_id: &str,
    ) -> Result<usize, AppError> {
        let container_files = Self::list_device_change_files(container_op, device_id).await?;
        if container_files.is_empty() {
            return Ok(0);
        }

        let original_files = Self::list_device_change_files(original_op, device_id).await?;
        let original_set: HashSet<&str> = original_files.iter().map(|s| s.as_str()).collect();

        let prefix = Self::device_changes_dir(device_id);
        let mut mirrored = 0;
        for name in &container_files {
            if original_set.contains(name.as_str()) {
                continue;
            }
            let source_path = format!("{prefix}{name}");
            let dest_path = format!("{prefix}{name}");
            let bytes = container_op
                .read(&source_path)
                .await
                .map_err(|err| AppError::Config(format!("Read {source_path} failed: {err}")))?
                .to_vec();
            original_op
                .write(&dest_path, bytes)
                .await
                .map_err(|err| AppError::Config(format!("Write {dest_path} failed: {err}")))?;
            mirrored += 1;
        }

        if mirrored > 0 {
            info!("Mirrored {mirrored} changes to external directory for device {device_id}");
        }
        Ok(mirrored)
    }

    async fn list_device_change_files(
        op: &Operator,
        device_id: &str,
    ) -> Result<Vec<String>, AppError> {
        const CHANGES_PREFIX: &str = ".myreader/changes";
        let dir = format!("{CHANGES_PREFIX}/{device_id}");
        let entries = match op.list_with(&dir).recursive(true).await {
            Ok(e) => e,
            Err(err) if err.kind() == opendal::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(err) => return Err(AppError::Config(format!("List {dir} failed: {err}"))),
        };

        let prefix = format!("{dir}/");
        Ok(entries
            .into_iter()
            .filter_map(|e| {
                let path = e.path().to_string();
                let name = path.strip_prefix(&prefix)?;
                if name.ends_with(".jsonl") && !name.contains('/') {
                    Some(name.to_string())
                } else {
                    None
                }
            })
            .collect())
    }

    fn device_changes_dir(device_id: &str) -> String {
        format!(".myreader/changes/{device_id}/")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use opendal::Operator;
    use std::path::Path;

    use crate::models::{AppConfig, LibraryConfig};

    fn create_temp_operator(root: &Path) -> Operator {
        use opendal::services::Fs;
        let builder = Fs::default().root(root.to_string_lossy().as_ref());
        Operator::new(builder).unwrap().finish()
    }

    fn local_library(id: &str, original_path: &str) -> LibraryConfig {
        LibraryConfig {
            id: id.to_string(),
            name: "Local".to_string(),
            path: original_path.to_string(),
            source_type: Some("local".to_string()),
            data_source_id: None,
            source_path: None,
        }
    }

    fn remote_library(id: &str) -> LibraryConfig {
        LibraryConfig {
            id: id.to_string(),
            name: "WebDAV".to_string(),
            path: "".to_string(),
            source_type: Some("webdav".to_string()),
            data_source_id: Some("ds-webdav".to_string()),
            source_path: Some("/books".to_string()),
        }
    }

    #[tokio::test]
    async fn mirror_changes_to_external_should_copy_missing_files_only() {
        let container_root = tempfile::tempdir().unwrap();
        let original_root = tempfile::tempdir().unwrap();
        let container_op = create_temp_operator(container_root.path());
        let original_op = create_temp_operator(original_root.path());

        container_op
            .write(".myreader/changes/d1/1.jsonl", b"{}".to_vec())
            .await
            .unwrap();
        container_op
            .write(".myreader/changes/d1/2.jsonl", b"{}".to_vec())
            .await
            .unwrap();
        original_op
            .write(".myreader/changes/d1/1.jsonl", b"{}".to_vec())
            .await
            .unwrap();

        let mirrored = SyncService::mirror_changes_to_external(&container_op, &original_op, "d1")
            .await
            .unwrap();
        assert_eq!(mirrored, 1);

        let files = SyncService::list_device_change_files(&original_op, "d1")
            .await
            .unwrap();
        assert!(files.contains(&"1.jsonl".to_string()));
        assert!(files.contains(&"2.jsonl".to_string()));
    }

    #[tokio::test]
    async fn sync_db_for_library_should_sync_remote_library_inside_container() {
        let app_data = tempfile::tempdir().unwrap();
        let mut config = AppConfig::default();
        config.libraries.push(remote_library("lib-remote"));

        let report = SyncService::sync_db_for_library(app_data.path(), &mut config, "lib-remote")
            .await
            .unwrap();

        assert_eq!(report.pushed, 0);
        assert_eq!(report.pulled, 0);
        assert!(config.device_id.is_some());
    }

    #[tokio::test]
    async fn sync_db_for_library_should_mirror_container_changes_to_original_for_local_library() {
        let app_data = tempfile::tempdir().unwrap();
        let original = tempfile::tempdir().unwrap();
        let mut config = AppConfig::default();
        config.libraries.push(local_library(
            "lib-local",
            original.path().to_str().unwrap(),
        ));

        // First sync initializes the sidecar DB and device id.
        SyncService::sync_db_for_library(app_data.path(), &mut config, "lib-local")
            .await
            .unwrap();
        let device_id = config.device_id.clone().expect("device id generated");

        // Write a change file in the container sidecar.
        let change_path = app_data
            .path()
            .join("libraries/lib-local/.myreader/changes")
            .join(&device_id)
            .join("1.jsonl");
        tokio::fs::create_dir_all(change_path.parent().unwrap())
            .await
            .unwrap();
        tokio::fs::write(&change_path, b"{}").await.unwrap();

        // Second sync should mirror the change to the original library directory.
        let report = SyncService::sync_db_for_library(app_data.path(), &mut config, "lib-local")
            .await
            .unwrap();
        assert_eq!(report.pushed, 0);

        let original_change = original
            .path()
            .join(".myreader/changes")
            .join(&device_id)
            .join("1.jsonl");
        assert!(tokio::fs::try_exists(&original_change).await.unwrap());
    }
}
