use std::path::Path;

use opendal::Operator;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use tracing::{error, info};

use crate::cache;
use crate::db;
use crate::error::AppError;
use crate::models::{AppConfig, LibraryConfig};
use crate::repositories::calibre_repo::CalibreBookRepository;
use crate::storage::{self, StorageBackend};
use crate::sync::automerge_projection::LibrarySidecarAutomergeProjection;
use crate::sync::automerge_store::sync_library_sidecar_automerge;
use crate::sync::replica_identity::ensure_replica_identity;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct SyncService;

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
        info!(
            target: "myreader_sync",
            event = "sync.start",
            library_id,
            "Starting library sidecar sync"
        );

        let library = Self::resolve_library(config, library_id)
            .map_err(|err| Self::log_stage_error(library_id, "resolve_library", err))?
            .clone();
        let sidecar_path = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        let db = Self::open_library_db(&sidecar_path)
            .await
            .map_err(|err| Self::log_stage_error(library_id, "open_sidecar_database", err))?;
        let calibre = CalibreBookRepository::open(&library_root.to_string_lossy())
            .await
            .map_err(|err| Self::log_stage_error(library_id, "open_calibre_database", err))?;
        let library_uuid = calibre
            .get_library_uuid()
            .await
            .map_err(|err| Self::log_stage_error(library_id, "read_library_uuid", err))?;
        let identity = ensure_replica_identity(&db, &library_uuid)
            .await
            .map_err(|err| Self::log_stage_error(library_id, "ensure_replica_identity", err))?;
        let operator = Self::library_operator(config, &library)
            .await
            .map_err(|err| Self::log_stage_error(library_id, "build_storage_operator", err))?;
        let now_ms = Self::unix_epoch_millis();
        info!(
            target: "myreader_sync",
            event = "sync.identity_ready",
            library_id,
            library_uuid,
            replica_id = %identity.replica_id,
            source_type = library.source_type.as_deref().unwrap_or("local"),
            "Resolved library sidecar identity"
        );

        let automerge_projection = LibrarySidecarAutomergeProjection;
        let (automerge_pushed, automerge_pulled) = sync_library_sidecar_automerge(
            &db,
            &operator,
            &identity,
            now_ms,
            Some(&automerge_projection),
        )
        .await
        .map_err(|err| Self::log_stage_error(library_id, "sync_automerge", err))?;
        let pushed = automerge_pushed;
        let pulled = automerge_pulled;

        cache::clear_library_missing_cover_markers(app_data_dir, library_id)
            .map_err(|err| Self::log_stage_error(library_id, "clear_cover_cache", err))?;

        info!(
            target: "myreader_sync",
            event = "sync.complete",
            library_id,
            library_uuid,
            replica_id = %identity.replica_id,
            pushed,
            pulled,
            "Completed library sidecar sync"
        );
        Ok(DbSyncReport { pushed, pulled })
    }

    fn log_stage_error(library_id: &str, stage: &'static str, err: AppError) -> AppError {
        error!(
            target: "myreader_sync",
            event = "sync.stage_failed",
            library_id,
            stage,
            error = %err,
            "Library sidecar sync stage failed"
        );
        err
    }

    fn resolve_library<'a>(
        config: &'a AppConfig,
        library_id: &str,
    ) -> Result<&'a LibraryConfig, AppError> {
        config
            .libraries
            .iter()
            .find(|library| library.id == library_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {library_id}")))
    }

    async fn library_operator(
        config: &AppConfig,
        library: &LibraryConfig,
    ) -> Result<Operator, AppError> {
        if !library.is_remote() {
            return storage::build_operator(&StorageBackend::LocalDirect {
                root: library.path.clone(),
            });
        }

        let data_source_id = library
            .data_source_id
            .as_deref()
            .ok_or_else(|| AppError::Config("LIBRARY_DATA_SOURCE_MISSING".into()))?;
        let data_source = config
            .data_sources
            .iter()
            .find(|source| source.id == data_source_id)
            .ok_or_else(|| AppError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
        storage::from_data_source_at_path(data_source, library.source_path.as_deref()).await
    }

    async fn open_library_db(sidecar_path: &Path) -> Result<DatabaseConnection, AppError> {
        let path_str = sidecar_path
            .to_str()
            .ok_or_else(|| AppError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
        db::open_db(path_str).await
    }

    fn unix_epoch_millis() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_millis() as u64)
    }
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database};

    use super::*;
    use crate::models::{AppConfig, LibraryConfig};
    use crate::services::bookmark_service::BookmarkService;
    use crate::services::favorite_book_service::FavoriteBookService;
    use crate::services::progress_service::ProgressService;

    const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";

    fn local_library(id: &str, original_path: &str) -> LibraryConfig {
        LibraryConfig {
            id: id.to_owned(),
            name: "Local".to_owned(),
            path: original_path.to_owned(),
            source_type: Some("local".to_owned()),
            data_source_id: None,
            source_path: None,
        }
    }

    async fn create_calibre_metadata(root: &Path) {
        let url = format!(
            "sqlite://{}?mode=rwc",
            root.join("metadata.db").to_string_lossy()
        );
        let db = Database::connect(&url).await.unwrap();
        db.execute_unprepared(&format!(
            "CREATE TABLE library_id (\
               id INTEGER PRIMARY KEY, uuid TEXT NOT NULL, UNIQUE(uuid)\
             );\
             INSERT INTO library_id (id, uuid) VALUES (1, '{LIBRARY_UUID}');"
        ))
        .await
        .unwrap();
    }

    #[test]
    fn should_return_library_when_registered_id_exists() {
        let config = AppConfig {
            libraries: vec![local_library("library-1", "/library")],
            ..Default::default()
        };

        assert_eq!(
            SyncService::resolve_library(&config, "library-1")
                .unwrap()
                .id,
            "library-1"
        );
        assert!(SyncService::resolve_library(&config, "missing").is_err());
    }

    #[tokio::test]
    async fn should_publish_automerge_changes_when_local_progress_exists() {
        let app_data = tempfile::tempdir().unwrap();
        let library_root = tempfile::tempdir().unwrap();
        create_calibre_metadata(library_root.path()).await;
        let mut config = AppConfig {
            libraries: vec![local_library(
                "library-1",
                library_root.path().to_str().unwrap(),
            )],
            ..Default::default()
        };
        ProgressService::set_reading_progress_for_library(
            app_data.path(),
            &config,
            Some("library-1"),
            42,
            "EPUB",
            &serde_json::json!({
                "href": "chapter.xhtml",
                "type": "application/xhtml+xml"
            }),
            Some(0.4),
        )
        .await
        .unwrap();

        let report = SyncService::sync_db_for_library(app_data.path(), &mut config, "library-1")
            .await
            .unwrap();

        assert_eq!(report.pushed, 2);
        let replicas = std::fs::read_dir(
            library_root
                .path()
                .join(".myreader")
                .join("automerge")
                .join("changes"),
        )
        .unwrap()
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
        assert_eq!(replicas.len(), 1);
        assert!(std::fs::read_dir(replicas[0].path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().ends_with(".am")));
    }

    #[tokio::test]
    async fn should_pull_reading_position_when_second_replica_syncs() {
        let first_app_data = tempfile::tempdir().unwrap();
        let second_app_data = tempfile::tempdir().unwrap();
        let library_root = tempfile::tempdir().unwrap();
        create_calibre_metadata(library_root.path()).await;
        let mut first_config = AppConfig {
            libraries: vec![local_library(
                "first",
                library_root.path().to_str().unwrap(),
            )],
            ..Default::default()
        };
        let mut second_config = AppConfig {
            libraries: vec![local_library(
                "second",
                library_root.path().to_str().unwrap(),
            )],
            ..Default::default()
        };
        ProgressService::set_reading_progress_for_library(
            first_app_data.path(),
            &first_config,
            Some("first"),
            42,
            "EPUB",
            &serde_json::json!({
                "href": "chapter.xhtml",
                "type": "application/xhtml+xml"
            }),
            Some(0.4),
        )
        .await
        .unwrap();
        SyncService::sync_db_for_library(first_app_data.path(), &mut first_config, "first")
            .await
            .unwrap();

        let report =
            SyncService::sync_db_for_library(second_app_data.path(), &mut second_config, "second")
                .await
                .unwrap();
        let progress = ProgressService::get_reading_progress_for_library(
            second_app_data.path(),
            &second_config,
            Some("second"),
            42,
            "EPUB",
        )
        .await
        .unwrap()
        .unwrap();

        assert_eq!(report.pulled, 2);
        assert_eq!(progress.display_progression, Some(0.4));
        assert_eq!(progress.locator["href"], "chapter.xhtml");
    }

    #[tokio::test]
    async fn should_converge_bookmark_presence_when_two_replicas_sync() {
        let first_app_data = tempfile::tempdir().unwrap();
        let second_app_data = tempfile::tempdir().unwrap();
        let library_root = tempfile::tempdir().unwrap();
        create_calibre_metadata(library_root.path()).await;
        let mut first_config = AppConfig {
            libraries: vec![local_library(
                "first",
                library_root.path().to_str().unwrap(),
            )],
            ..Default::default()
        };
        let mut second_config = AppConfig {
            libraries: vec![local_library(
                "second",
                library_root.path().to_str().unwrap(),
            )],
            ..Default::default()
        };
        let locator = serde_json::json!({
            "href": "chapter.xhtml",
            "type": "application/xhtml+xml",
            "locations": {"progression": 0.4}
        });
        BookmarkService::add_for_library(
            first_app_data.path(),
            &first_config,
            Some("first"),
            42,
            "EPUB",
            "chapter.xhtml@0.4",
            &locator,
        )
        .await
        .unwrap();

        let first_report =
            SyncService::sync_db_for_library(first_app_data.path(), &mut first_config, "first")
                .await
                .unwrap();
        let second_report =
            SyncService::sync_db_for_library(second_app_data.path(), &mut second_config, "second")
                .await
                .unwrap();
        let bookmarks = BookmarkService::list_for_library(
            second_app_data.path(),
            &second_config,
            Some("second"),
            42,
            "EPUB",
        )
        .await
        .unwrap();

        assert_eq!(first_report.pushed, 2);
        assert_eq!(second_report.pulled, 2);
        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].locator_key, "chapter.xhtml@0.4");
        assert_eq!(bookmarks[0].locator, locator);

        BookmarkService::delete_for_library(
            second_app_data.path(),
            &second_config,
            Some("second"),
            42,
            "EPUB",
            "chapter.xhtml@0.4",
        )
        .await
        .unwrap();
        SyncService::sync_db_for_library(second_app_data.path(), &mut second_config, "second")
            .await
            .unwrap();
        SyncService::sync_db_for_library(first_app_data.path(), &mut first_config, "first")
            .await
            .unwrap();
        assert!(BookmarkService::list_for_library(
            first_app_data.path(),
            &first_config,
            Some("first"),
            42,
            "EPUB",
        )
        .await
        .unwrap()
        .is_empty());

        BookmarkService::add_for_library(
            first_app_data.path(),
            &first_config,
            Some("first"),
            42,
            "EPUB",
            "chapter.xhtml@0.4",
            &locator,
        )
        .await
        .unwrap();
        SyncService::sync_db_for_library(first_app_data.path(), &mut first_config, "first")
            .await
            .unwrap();
        SyncService::sync_db_for_library(second_app_data.path(), &mut second_config, "second")
            .await
            .unwrap();
        assert_eq!(
            BookmarkService::list_for_library(
                second_app_data.path(),
                &second_config,
                Some("second"),
                42,
                "EPUB",
            )
            .await
            .unwrap()
            .len(),
            1
        );
    }

    #[tokio::test]
    async fn should_apply_mixed_domains_and_tombstone_when_two_replicas_exchange_changes() {
        let first_app_data = tempfile::tempdir().unwrap();
        let second_app_data = tempfile::tempdir().unwrap();
        let library_root = tempfile::tempdir().unwrap();
        create_calibre_metadata(library_root.path()).await;
        let mut first_config = AppConfig {
            libraries: vec![local_library(
                "first",
                library_root.path().to_str().unwrap(),
            )],
            ..Default::default()
        };
        let mut second_config = AppConfig {
            libraries: vec![local_library(
                "second",
                library_root.path().to_str().unwrap(),
            )],
            ..Default::default()
        };

        ProgressService::set_reading_progress_for_library(
            first_app_data.path(),
            &first_config,
            Some("first"),
            42,
            "EPUB",
            &serde_json::json!({
                "href": "chapter.xhtml",
                "type": "application/xhtml+xml"
            }),
            Some(0.4),
        )
        .await
        .unwrap();
        FavoriteBookService::add_favorite_book_for_library(
            first_app_data.path(),
            &first_config,
            Some("first"),
            42,
        )
        .await
        .unwrap();
        SyncService::sync_db_for_library(first_app_data.path(), &mut first_config, "first")
            .await
            .unwrap();
        SyncService::sync_db_for_library(second_app_data.path(), &mut second_config, "second")
            .await
            .unwrap();

        assert_eq!(
            FavoriteBookService::list_favorite_book_ids_for_library(
                second_app_data.path(),
                &second_config,
                Some("second"),
            )
            .await
            .unwrap(),
            vec![42]
        );
        assert_eq!(
            ProgressService::get_reading_progress_for_library(
                second_app_data.path(),
                &second_config,
                Some("second"),
                42,
                "EPUB",
            )
            .await
            .unwrap()
            .unwrap()
            .display_progression,
            Some(0.4)
        );

        FavoriteBookService::remove_favorite_book_for_library(
            second_app_data.path(),
            &second_config,
            Some("second"),
            42,
        )
        .await
        .unwrap();
        SyncService::sync_db_for_library(second_app_data.path(), &mut second_config, "second")
            .await
            .unwrap();
        SyncService::sync_db_for_library(first_app_data.path(), &mut first_config, "first")
            .await
            .unwrap();

        assert!(FavoriteBookService::list_favorite_book_ids_for_library(
            first_app_data.path(),
            &first_config,
            Some("first"),
        )
        .await
        .unwrap()
        .is_empty());
    }
}
