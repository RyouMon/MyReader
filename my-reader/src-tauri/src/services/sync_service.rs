use std::path::Path;

use opendal::Operator;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter,
};
use serde::Serialize;
use tracing::{error, info};

use crate::cache;
use crate::db;
use crate::entities::app::{sync_automerge_outbox, sync_schedule_state};
use crate::error::AppError;
use crate::models::{AppConfig, LibraryConfig};
use crate::repositories::calibre_repo::CalibreBookRepository;
use crate::storage::{self, StorageBackend};
use crate::sync::automerge_store::{
    publish_library_sidecar_automerge, sync_library_sidecar_automerge,
};
use crate::sync::replica_identity::ensure_replica_identity;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct SyncService;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarSyncMode {
    PushOnly,
    Full,
}

#[derive(Debug, Clone)]
pub struct SyncScheduleSnapshot {
    pub next_retry_at: Option<u64>,
    pub transient_failure_count: u32,
    pub suspended_reason: Option<String>,
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
        Self::sync_sidecar_for_library(app_data_dir, config, library_id, SidecarSyncMode::Full)
            .await
    }

    pub async fn sync_sidecar_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        mode: SidecarSyncMode,
    ) -> Result<DbSyncReport, AppError> {
        info!(
            target: "myreader_sync",
            event = "sync.start",
            library_id,
            mode = ?mode,
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

        let (pushed, pulled) = match mode {
            SidecarSyncMode::PushOnly => {
                let pushed = publish_library_sidecar_automerge(&db, &operator, &identity, now_ms)
                    .await
                    .map_err(|err| Self::log_stage_error(library_id, "publish_automerge", err))?;
                Self::clear_retry_state(&db).await?;
                (pushed, 0)
            }
            SidecarSyncMode::Full => {
                let report = sync_library_sidecar_automerge(&db, &operator, &identity, now_ms)
                    .await
                    .map_err(|err| Self::log_stage_error(library_id, "sync_automerge", err))?;
                Self::record_successful_pull(&db, now_ms).await?;
                report
            }
        };

        cache::clear_library_missing_cover_markers(app_data_dir, library_id)
            .map_err(|err| Self::log_stage_error(library_id, "clear_cover_cache", err))?;

        info!(
            target: "myreader_sync",
            event = "sync.complete",
            library_id,
            library_uuid,
            replica_id = %identity.replica_id,
            mode = ?mode,
            pushed,
            pulled,
            "Completed library sidecar sync"
        );
        Ok(DbSyncReport { pushed, pulled })
    }

    pub async fn has_pending_sidecar_work(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
    ) -> Result<bool, AppError> {
        let library = Self::resolve_library(config, library_id)?;
        let sidecar_path = library_sidecar_path(library, app_data_dir);
        let db = Self::open_library_db(&sidecar_path).await?;
        Ok(sync_automerge_outbox::Entity::find()
            .filter(sync_automerge_outbox::Column::PublishedAt.is_null())
            .one(&db)
            .await
            .map_err(AppError::from)?
            .is_some())
    }

    pub async fn is_pull_fresh(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        now_ms: u64,
        freshness_ms: u64,
    ) -> Result<bool, AppError> {
        let library = Self::resolve_library(config, library_id)?;
        let sidecar_path = library_sidecar_path(library, app_data_dir);
        let db = Self::open_library_db(&sidecar_path).await?;
        let Some(state) = sync_schedule_state::Entity::find_by_id("local")
            .one(&db)
            .await
            .map_err(AppError::from)?
        else {
            return Ok(false);
        };
        let Some(last_pull) = state.last_successful_pull_at else {
            return Ok(false);
        };
        Ok(now_ms.saturating_sub(last_pull.max(0) as u64) < freshness_ms)
    }

    pub async fn schedule_snapshot(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
    ) -> Result<SyncScheduleSnapshot, AppError> {
        let db = Self::open_schedule_db(app_data_dir, config, library_id).await?;
        let state = sync_schedule_state::Entity::find_by_id("local")
            .one(&db)
            .await
            .map_err(AppError::from)?;
        Ok(SyncScheduleSnapshot {
            next_retry_at: state
                .as_ref()
                .and_then(|state| state.next_retry_at)
                .map(|value| value.max(0) as u64),
            transient_failure_count: state
                .as_ref()
                .map_or(0, |state| state.transient_failure_count.max(0) as u32),
            suspended_reason: state.and_then(|state| state.suspended_reason),
        })
    }

    pub async fn record_retry(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        next_retry_at: u64,
        failure_count: u32,
    ) -> Result<(), AppError> {
        let db = Self::open_schedule_db(app_data_dir, config, library_id).await?;
        let current = sync_schedule_state::Entity::find_by_id("local")
            .one(&db)
            .await
            .map_err(AppError::from)?;
        Self::write_schedule_state(
            &db,
            current.and_then(|state| state.last_successful_pull_at),
            Some(Self::sqlite_timestamp(next_retry_at)?),
            i64::from(failure_count),
            None,
        )
        .await
    }

    pub async fn record_suspension(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        reason: String,
    ) -> Result<(), AppError> {
        let db = Self::open_schedule_db(app_data_dir, config, library_id).await?;
        let current = sync_schedule_state::Entity::find_by_id("local")
            .one(&db)
            .await
            .map_err(AppError::from)?;
        Self::write_schedule_state(
            &db,
            current.and_then(|state| state.last_successful_pull_at),
            None,
            0,
            Some(reason),
        )
        .await
    }

    async fn record_successful_pull(db: &DatabaseConnection, now_ms: u64) -> Result<(), AppError> {
        Self::write_schedule_state(db, Some(Self::sqlite_timestamp(now_ms)?), None, 0, None).await
    }

    async fn clear_retry_state(db: &DatabaseConnection) -> Result<(), AppError> {
        let current = sync_schedule_state::Entity::find_by_id("local")
            .one(db)
            .await
            .map_err(AppError::from)?;
        Self::write_schedule_state(
            db,
            current.and_then(|state| state.last_successful_pull_at),
            None,
            0,
            None,
        )
        .await
    }

    async fn write_schedule_state(
        db: &DatabaseConnection,
        last_successful_pull_at: Option<i64>,
        next_retry_at: Option<i64>,
        transient_failure_count: i64,
        suspended_reason: Option<String>,
    ) -> Result<(), AppError> {
        match sync_schedule_state::Entity::find_by_id("local")
            .one(db)
            .await
            .map_err(AppError::from)?
        {
            Some(existing) => {
                let mut active: sync_schedule_state::ActiveModel = existing.into();
                active.last_successful_pull_at = Set(last_successful_pull_at);
                active.next_retry_at = Set(next_retry_at);
                active.transient_failure_count = Set(transient_failure_count);
                active.suspended_reason = Set(suspended_reason);
                active.update(db).await.map_err(AppError::from)?;
            }
            None => {
                sync_schedule_state::ActiveModel {
                    id: Set("local".to_owned()),
                    last_successful_pull_at: Set(last_successful_pull_at),
                    next_retry_at: Set(next_retry_at),
                    transient_failure_count: Set(transient_failure_count),
                    suspended_reason: Set(suspended_reason),
                }
                .insert(db)
                .await
                .map_err(AppError::from)?;
            }
        }
        Ok(())
    }

    async fn open_schedule_db(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
    ) -> Result<DatabaseConnection, AppError> {
        let library = Self::resolve_library(config, library_id)?;
        let sidecar_path = library_sidecar_path(library, app_data_dir);
        Self::open_library_db(&sidecar_path).await
    }

    fn sqlite_timestamp(timestamp: u64) -> Result<i64, AppError> {
        i64::try_from(timestamp)
            .map_err(|_| AppError::Sync("Timestamp exceeds SQLite INTEGER range".into()))
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
    async fn should_restore_retry_and_suspension_when_scheduler_restarts() {
        let app_data = tempfile::tempdir().unwrap();
        let config = AppConfig {
            libraries: vec![local_library("library-1", "/library")],
            ..Default::default()
        };

        SyncService::record_retry(app_data.path(), &config, "library-1", 42_000, 3)
            .await
            .unwrap();
        let retry = SyncService::schedule_snapshot(app_data.path(), &config, "library-1")
            .await
            .unwrap();
        assert_eq!(retry.next_retry_at, Some(42_000));
        assert_eq!(retry.transient_failure_count, 3);

        SyncService::record_suspension(
            app_data.path(),
            &config,
            "library-1",
            "credential expired".to_owned(),
        )
        .await
        .unwrap();
        let suspended = SyncService::schedule_snapshot(app_data.path(), &config, "library-1")
            .await
            .unwrap();
        assert_eq!(
            suspended.suspended_reason.as_deref(),
            Some("credential expired")
        );
        assert_eq!(suspended.next_retry_at, None);
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
