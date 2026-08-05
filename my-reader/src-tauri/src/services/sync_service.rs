use std::path::Path;

use my_reader_core::api::sync::{SyncObserver, SyncProgress};
pub use my_reader_core::models::SidecarSyncMode;
use my_reader_core::models::{LibrarySyncOptions, LibrarySyncScope, SyncFailureKind};
use serde::Serialize;
use tracing::{error, info};

use crate::cache;
use crate::error::AppError;
use crate::models::AppConfig;
use crate::services::library_service::LibraryService;
use crate::storage;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct SyncService;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DbSyncReport {
    pub pushed: usize,
    pub pulled: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SidecarSyncCompletedPayload {
    pub library_id: String,
    pub mode: &'static str,
    pub pushed: usize,
    pub pulled: usize,
}

struct NoopObserver;

impl SyncObserver for NoopObserver {
    fn is_cancelled(&self) -> bool {
        false
    }

    fn on_progress(&self, _progress: SyncProgress) {}
}

impl SyncService {
    pub async fn sync_db_for_library(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
    ) -> Result<DbSyncReport, AppError> {
        Self::sync_db_for_library_observed(app_data_dir, config, library_id, &NoopObserver).await
    }

    pub async fn sync_db_for_library_observed(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        observer: &dyn SyncObserver,
    ) -> Result<DbSyncReport, AppError> {
        info!(
            target: "myreader_sync",
            event = "sync.start",
            library_id,
            "Starting complete library sync"
        );

        let library = LibraryService::resolve_library(Some(library_id), config)
            .map_err(|err| Self::log_stage_error(library_id, "resolve_library", err))?;
        let sidecar_path = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        let storage = storage::core_library_storage(config, &library)
            .await
            .map_err(|err| Self::log_stage_error(library_id, "resolve_storage", err))?;
        let config_path = crate::config::config_path(app_data_dir);
        my_reader_core::api::config::ConfigService::load_or_initialize(
            &config_path,
            Some(config.to_core_config()),
        )
        .map_err(AppError::from)
        .map_err(|err| Self::log_stage_error(library_id, "initialize_config", err))?;

        let report = my_reader_core::api::sync::SyncService::sync_library_observed(
            &config_path,
            &sidecar_path,
            &library_root,
            library_id,
            Self::sqlite_timestamp(Self::unix_epoch_millis())?,
            LibrarySyncOptions {
                scope: LibrarySyncScope::All,
                force_calibre: false,
                sidecar_mode: SidecarSyncMode::Full,
            },
            &storage,
            observer,
        )
        .await
        .map_err(AppError::from)
        .map_err(|err| Self::log_stage_error(library_id, "sync_library", err))?;

        if report.calibre.changed {
            let book_ids =
                my_reader_core::api::catalog::CatalogService::list_book_summaries(&library_root)
                    .await
                    .map_err(AppError::from)
                    .map_err(|err| Self::log_stage_error(library_id, "refresh_catalog_cache", err))?
                    .into_iter()
                    .map(|book| book.id)
                    .collect::<Vec<_>>();
            cache::clear_orphaned_library_cache_files(library_id, &book_ids)
                .map_err(|err| Self::log_stage_error(library_id, "clear_reader_cache", err))?;
            cache::clear_library_missing_cover_markers(app_data_dir, library_id)
                .map_err(|err| Self::log_stage_error(library_id, "clear_cover_cache", err))?;
        }

        if let Some(message) = report.error {
            return Err(Self::report_error(report.failure_kind, message));
        }

        info!(
            target: "myreader_sync",
            event = "sync.complete",
            library_id,
            pushed = report.myreader.pushed,
            pulled = report.myreader.pulled,
            calibre_changed = report.calibre.changed,
            "Completed library sync"
        );
        Ok(DbSyncReport {
            pushed: report.myreader.pushed,
            pulled: report.myreader.pulled,
        })
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

        let library = LibraryService::resolve_library(Some(library_id), config)
            .map_err(|err| Self::log_stage_error(library_id, "resolve_library", err))?;
        let sidecar_path = library_sidecar_path(&library, app_data_dir);
        let library_root = library_root_path(&library, app_data_dir);
        let storage = storage::core_library_storage(config, &library)
            .await
            .map_err(|err| Self::log_stage_error(library_id, "resolve_storage", err))?;
        let report = my_reader_core::api::sync::SyncService::sync_sidecar(
            &sidecar_path,
            &library_root,
            Self::sqlite_timestamp(Self::unix_epoch_millis())?,
            mode,
            &storage,
        )
        .await
        .map_err(AppError::from)
        .map_err(|err| Self::log_stage_error(library_id, "sync_sidecar", err))?;

        cache::clear_library_missing_cover_markers(app_data_dir, library_id)
            .map_err(|err| Self::log_stage_error(library_id, "clear_cover_cache", err))?;

        info!(
            target: "myreader_sync",
            event = "sync.complete",
            library_id,
            mode = ?mode,
            pushed = report.pushed,
            pulled = report.pulled,
            "Completed library sidecar sync"
        );
        Ok(DbSyncReport {
            pushed: report.pushed,
            pulled: report.pulled,
        })
    }

    fn sqlite_timestamp(timestamp: u64) -> Result<i64, AppError> {
        i64::try_from(timestamp)
            .map_err(|_| AppError::Sync("Timestamp exceeds SQLite INTEGER range".into()))
    }

    pub fn failure_kind(error: &AppError) -> SyncFailureKind {
        match error {
            AppError::Request(_) | AppError::Storage(_) => SyncFailureKind::Connectivity,
            AppError::Credential(_) => SyncFailureKind::Credential,
            AppError::Auth(_) | AppError::Config(_) => SyncFailureKind::Configuration,
            AppError::Database(_) | AppError::Serialize(_) | AppError::DataIntegrity(_) => {
                SyncFailureKind::DataIntegrity
            }
            _ => SyncFailureKind::Unexpected,
        }
    }

    fn report_error(kind: Option<SyncFailureKind>, message: String) -> AppError {
        match kind {
            Some(SyncFailureKind::Connectivity) => AppError::Storage(message),
            Some(SyncFailureKind::Configuration) => AppError::Config(message),
            Some(SyncFailureKind::Credential) => AppError::Credential(message),
            Some(SyncFailureKind::DataIntegrity) => AppError::DataIntegrity(message),
            Some(SyncFailureKind::Unexpected) | None => AppError::Sync(message),
        }
    }

    fn log_stage_error(library_id: &str, stage: &'static str, err: AppError) -> AppError {
        error!(
            target: "myreader_sync",
            event = "sync.stage_failed",
            library_id,
            stage,
            error = %err,
            "Library sync stage failed"
        );
        err
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
            library_type: Default::default(),
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
            "CREATE TABLE books (
               id INTEGER PRIMARY KEY,
               title TEXT NOT NULL,
               sort TEXT NOT NULL,
               timestamp TEXT,
               pubdate TEXT,
               series_index REAL NOT NULL DEFAULT 1,
               author_sort TEXT,
               isbn TEXT,
               lccn TEXT,
               path TEXT,
               flags INTEGER NOT NULL DEFAULT 1,
               uuid TEXT,
               has_cover INTEGER,
               last_modified TEXT NOT NULL
             );
             CREATE TABLE data (
               id INTEGER PRIMARY KEY,
               book INTEGER NOT NULL,
               format TEXT NOT NULL,
               uncompressed_size INTEGER NOT NULL,
               name TEXT NOT NULL
             );
             CREATE TABLE library_id (
               id INTEGER PRIMARY KEY, uuid TEXT NOT NULL, UNIQUE(uuid)
             );
             INSERT INTO library_id (id, uuid) VALUES (1, '{LIBRARY_UUID}');
             INSERT INTO books (
               id, title, sort, path, has_cover, last_modified
             ) VALUES (
               42, 'Book', 'Book', 'Author/Book', 0, '2026-01-01'
             );
             INSERT INTO data (
               id, book, format, uncompressed_size, name
             ) VALUES (1, 42, 'EPUB', 100, 'Book');"
        ))
        .await
        .unwrap();
    }

    #[test]
    fn should_classify_storage_failure_as_connectivity_when_scheduler_handles_it() {
        assert_eq!(
            SyncService::failure_kind(&AppError::Storage("offline".into())),
            SyncFailureKind::Connectivity
        );
    }

    #[tokio::test]
    async fn should_refresh_core_catalog_state_when_manual_sync_runs() {
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

        SyncService::sync_db_for_library(app_data.path(), &mut config, "library-1")
            .await
            .unwrap();

        let core_config = my_reader_core::api::config::ConfigService::load_or_initialize(
            &crate::config::config_path(app_data.path()),
            None,
        )
        .unwrap();
        let library = core_config
            .libraries
            .iter()
            .find(|library| library.id == "library-1")
            .unwrap();
        assert_eq!(library.book_count, 1);
        assert!(library.metadata_etag.is_some());
    }

    #[tokio::test]
    async fn should_publish_automerge_snapshot_when_local_progress_exists() {
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
        let document_root = library_root
            .path()
            .join(".myreader/automerge")
            .join(LIBRARY_UUID);
        assert!(std::fs::read_dir(document_root.join("snapshot"))
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.path().is_file()));
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
