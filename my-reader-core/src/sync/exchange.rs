use std::str::FromStr;

use automerge::ChangeHash;
use opendal::Operator;
use sha2::{Digest, Sha256};

use super::{
    persistence::{
        apply_remote_database_objects, ensure_database_document, has_receipt, list_pending_outbox,
        mark_outbox_published, read_database_diagnostics, DatabaseIdentity, SyncRemoteObject,
    },
    SyncError,
};

const REMOTE_CHANGES_ROOT: &str = ".myreader/automerge/changes";
const MAX_REMOTE_OBJECT_BYTES: usize = 4 * 1024 * 1024;
const MAX_REMOTE_OBJECTS_PER_SYNC: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum SyncMode {
    PushOnly,
    Full,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncReport {
    pub pushed: usize,
    pub pulled: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncStage {
    Preparing,
    Pushing,
    Pulling,
    Applying,
    Complete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub struct SyncProgress {
    pub stage: SyncStage,
    pub completed: usize,
    pub total: usize,
}

pub trait SyncObserver: Send + Sync {
    fn is_cancelled(&self) -> bool;
    fn on_progress(&self, progress: SyncProgress);
}

#[cfg(test)]
struct NoopObserver;

#[cfg(test)]
impl SyncObserver for NoopObserver {
    fn is_cancelled(&self) -> bool {
        false
    }

    fn on_progress(&self, _progress: SyncProgress) {}
}

fn sync_error(message: impl Into<String>) -> SyncError {
    SyncError::Sync(message.into())
}

fn check_cancelled(observer: &dyn SyncObserver) -> Result<(), SyncError> {
    if observer.is_cancelled() {
        Err(sync_error("Sync task cancelled"))
    } else {
        Ok(())
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn parse_remote_path(path: &str) -> Option<(String, String)> {
    let relative = path.strip_prefix(&format!("{REMOTE_CHANGES_ROOT}/"))?;
    let (actor, file_name) = relative.split_once('/')?;
    if actor.len() != 32
        || !actor
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return None;
    }
    let (sequence, hash_suffix) = file_name.split_once('-')?;
    if sequence.len() != 20 || !sequence.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let hash = hash_suffix.strip_suffix(".am")?;
    ChangeHash::from_str(hash)
        .ok()
        .map(|_| (actor.to_owned(), hash.to_owned()))
}

async fn publish(
    database_path: &str,
    operator: &Operator,
    now_ms: i64,
    observer: &dyn SyncObserver,
) -> Result<usize, SyncError> {
    let pending = list_pending_outbox(database_path)?;
    observer.on_progress(SyncProgress {
        stage: SyncStage::Pushing,
        completed: 0,
        total: pending.len(),
    });
    let mut pushed = 0;
    let total = pending.len();
    for (index, row) in pending.into_iter().enumerate() {
        check_cancelled(observer)?;
        match operator.read(&row.object_path).await {
            Ok(existing) => {
                if sha256_hex(&existing.to_vec()) != row.sha256 {
                    return Err(sync_error(format!(
                        "Remote Automerge object changed: {}",
                        row.object_path
                    )));
                }
            }
            Err(error) if error.kind() == opendal::ErrorKind::NotFound => {
                operator
                    .write(&row.object_path, row.bytes.clone())
                    .await
                    .map_err(|error| {
                        sync_error(format!(
                            "Write Automerge object {} failed: {error}",
                            row.object_path
                        ))
                    })?;
            }
            Err(error) => {
                return Err(sync_error(format!(
                    "Read Automerge object {} failed: {error}",
                    row.object_path
                )));
            }
        }
        mark_outbox_published(database_path, &row.object_path, now_ms)?;
        pushed += serde_json::from_str::<Vec<String>>(&row.change_hashes_json)
            .map_err(|error| sync_error(format!("Invalid outbox change hashes: {error}")))?
            .len();
        observer.on_progress(SyncProgress {
            stage: SyncStage::Pushing,
            completed: index + 1,
            total,
        });
    }
    Ok(pushed)
}

async fn list_remote_objects(
    database_path: &str,
    operator: &Operator,
    identity: &DatabaseIdentity,
    observer: &dyn SyncObserver,
) -> Result<Vec<SyncRemoteObject>, SyncError> {
    let entries = match operator
        .list_with(REMOTE_CHANGES_ROOT)
        .recursive(true)
        .await
    {
        Ok(entries) => entries,
        Err(error) if error.kind() == opendal::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(sync_error(format!(
                "List {REMOTE_CHANGES_ROOT} failed: {error}"
            )));
        }
    };
    if entries.len() > MAX_REMOTE_OBJECTS_PER_SYNC {
        return Err(sync_error(format!(
            "Remote Automerge object count exceeds {MAX_REMOTE_OBJECTS_PER_SYNC}"
        )));
    }
    let local_actor = identity.replica_id.replace('-', "");
    let mut candidates = Vec::new();
    for entry in entries {
        let path = entry.path().trim_end_matches('/');
        let Some((actor, head)) = parse_remote_path(path) else {
            continue;
        };
        if actor == local_actor || has_receipt(database_path, path)? {
            continue;
        }
        candidates.push((path.to_owned(), head));
    }
    let total = candidates.len();
    observer.on_progress(SyncProgress {
        stage: SyncStage::Pulling,
        completed: 0,
        total,
    });
    let mut objects = Vec::new();
    for (index, (path, head)) in candidates.into_iter().enumerate() {
        check_cancelled(observer)?;
        let bytes = operator
            .read(&path)
            .await
            .map_err(|error| sync_error(format!("Read {path} failed: {error}")))?
            .to_vec();
        if bytes.len() > MAX_REMOTE_OBJECT_BYTES {
            return Err(sync_error(format!(
                "Remote Automerge object exceeds {MAX_REMOTE_OBJECT_BYTES} bytes"
            )));
        }
        objects.push(SyncRemoteObject {
            object_path: path,
            head,
            sha256: sha256_hex(&bytes),
            bytes,
        });
        observer.on_progress(SyncProgress {
            stage: SyncStage::Pulling,
            completed: index + 1,
            total,
        });
    }
    objects.sort_by(|left, right| left.object_path.cmp(&right.object_path));
    Ok(objects)
}

async fn pull(
    database_path: &str,
    operator: &Operator,
    identity: &DatabaseIdentity,
    now_ms: i64,
    observer: &dyn SyncObserver,
) -> Result<usize, SyncError> {
    let objects = list_remote_objects(database_path, operator, identity, observer).await?;
    if objects.is_empty() {
        return Ok(0);
    }
    check_cancelled(observer)?;
    observer.on_progress(SyncProgress {
        stage: SyncStage::Applying,
        completed: 0,
        total: objects.len(),
    });
    let total = objects.len();
    apply_remote_database_objects(database_path, identity, now_ms, objects).map(|result| {
        observer.on_progress(SyncProgress {
            stage: SyncStage::Applying,
            completed: total,
            total,
        });
        result.applied_objects
    })
}

#[cfg(test)]
pub async fn sync_database_with_operator(
    database_path: &str,
    operator: &Operator,
    identity: &DatabaseIdentity,
    now_ms: i64,
    mode: SyncMode,
) -> Result<SyncReport, SyncError> {
    sync_database_with_operator_observed(
        database_path,
        operator,
        identity,
        now_ms,
        mode,
        &NoopObserver,
    )
    .await
}

pub async fn sync_database_with_operator_observed(
    database_path: &str,
    operator: &Operator,
    identity: &DatabaseIdentity,
    now_ms: i64,
    mode: SyncMode,
    observer: &dyn SyncObserver,
) -> Result<SyncReport, SyncError> {
    check_cancelled(observer)?;
    observer.on_progress(SyncProgress {
        stage: SyncStage::Preparing,
        completed: 0,
        total: 1,
    });
    ensure_database_document(database_path, identity, now_ms)?;
    observer.on_progress(SyncProgress {
        stage: SyncStage::Preparing,
        completed: 1,
        total: 1,
    });
    let pushed = publish(database_path, operator, now_ms, observer).await?;
    let pulled = match mode {
        SyncMode::PushOnly => 0,
        SyncMode::Full => pull(database_path, operator, identity, now_ms, observer).await?,
    };
    check_cancelled(observer)?;
    observer.on_progress(SyncProgress {
        stage: SyncStage::Complete,
        completed: 1,
        total: 1,
    });
    Ok(SyncReport { pushed, pulled })
}

pub fn has_pending_database_work(database_path: &str) -> Result<bool, SyncError> {
    read_database_diagnostics(database_path).map(|diagnostics| diagnostics.pending_outbox > 0)
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    };

    use super::super::{
        document::{
            add_reading_completion, add_reading_session_duration, create_annotation, set_bookmark,
            set_favorite, set_reading_position, AnnotationValue, BookmarkValue, FavoriteValue,
            ReadingCompletionValue, ReadingPositionValue, ReadingSessionValue,
        },
        persistence::execute_local_database_mutation,
    };

    use super::*;

    const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";

    fn database() -> (tempfile::TempDir, String) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.sqlite");
        let connection = rusqlite::Connection::open(&path).unwrap();
        for migration in [
            include_str!("../../migrations/legacy/0000_initial.sql"),
            include_str!("../../migrations/legacy/0001_add_book_reading_format.sql"),
            include_str!("../../migrations/legacy/0002_add_favorite_books.sql"),
            include_str!("../../migrations/legacy/0003_add_book_cover_thumbnail_cache.sql"),
            include_str!("../../migrations/legacy/0004_add_bookmarks.sql"),
            include_str!("../../migrations/legacy/0005_add_annotations.sql"),
            include_str!(
                "../../migrations/legacy/0006_add_reading_progress_display_progression.sql"
            ),
            include_str!("../../migrations/legacy/0007_add_reading_statistics.sql"),
            include_str!("../../migrations/legacy/0008_add_library_sidecar_sync_kernel.sql"),
            include_str!("../../migrations/legacy/0009_add_reading_progress_sync_clock.sql"),
            include_str!("../../migrations/legacy/0010_add_favorite_sync_projection.sql"),
            include_str!("../../migrations/legacy/0011_add_bookmark_sync_projection.sql"),
            include_str!("../../migrations/legacy/0012_add_automerge_sync_storage.sql"),
            include_str!(
                "../../migrations/legacy/0013_add_reading_position_conflict_projection.sql"
            ),
            include_str!("../../migrations/legacy/0014_remove_legacy_sidecar_sync.sql"),
            include_str!("../../migrations/legacy/0015_remove_hlc_projection_columns.sql"),
            include_str!("../../migrations/legacy/0016_discard_legacy_sync_state.sql"),
            include_str!("../../migrations/legacy/0017_square_toro.sql"),
        ] {
            connection.execute_batch(migration).unwrap();
        }
        drop(connection);
        (directory, path.to_string_lossy().into_owned())
    }

    #[tokio::test]
    async fn should_exchange_projection_when_two_databases_use_same_storage_operator() {
        let (_source_directory, source_path) = database();
        let (_target_directory, target_path) = database();
        let source = DatabaseIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".to_owned(),
        };
        let target = DatabaseIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb".to_owned(),
        };
        let replica_id = source.replica_id.clone();
        execute_local_database_mutation(&source_path, &source, 2, |document| {
            set_reading_position(
                document,
                42,
                &ReadingPositionValue {
                    format: "PDF".to_owned(),
                    locator_json: r#"{"href":"page=7","type":"application/pdf"}"#.to_owned(),
                    display_progression_ppm: Some(700_000),
                    recorded_at: 2,
                    replica_id,
                },
            )?;
            Ok(())
        })
        .unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();

        let source_report =
            sync_database_with_operator(&source_path, &operator, &source, 3, SyncMode::Full)
                .await
                .unwrap();
        let target_report =
            sync_database_with_operator(&target_path, &operator, &target, 4, SyncMode::Full)
                .await
                .unwrap();

        assert_eq!(source_report.pushed, 2);
        assert_eq!(target_report.pulled, 2);
        let target_db = rusqlite::Connection::open(target_path).unwrap();
        let locator: String = target_db
            .query_row(
                "SELECT locator_json FROM reading_progress WHERE book_id = 42",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(locator, r#"{"href":"page=7","type":"application/pdf"}"#);
    }

    #[tokio::test]
    async fn should_exchange_every_frozen_domain_when_two_devices_sync() {
        let (_source_directory, source_path) = database();
        let (_target_directory, target_path) = database();
        let source = DatabaseIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".to_owned(),
        };
        let target = DatabaseIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb".to_owned(),
        };
        let replica_id = source.replica_id.clone();
        execute_local_database_mutation(&source_path, &source, 10, |document| {
            set_reading_position(
                document,
                42,
                &ReadingPositionValue {
                    format: "EPUB".to_owned(),
                    locator_json: r#"{"href":"chapter-7.xhtml","type":"application/xhtml+xml"}"#
                        .to_owned(),
                    display_progression_ppm: Some(700_000),
                    recorded_at: 10,
                    replica_id: replica_id.clone(),
                },
            )?;
            set_favorite(
                document,
                42,
                &FavoriteValue {
                    is_favorite: true,
                    added_at: Some(10),
                    recorded_at: 10,
                    replica_id: replica_id.clone(),
                },
            )?;
            set_bookmark(
                document,
                &BookmarkValue {
                    id: "11111111111141118111111111111111".to_owned(),
                    book_id: 42,
                    format: "EPUB".to_owned(),
                    locator_key: "chapter-7".to_owned(),
                    locator_json: r#"{"href":"chapter-7.xhtml","type":"application/xhtml+xml"}"#
                        .to_owned(),
                    created_at: 10,
                    deleted_at: None,
                    recorded_at: 10,
                    replica_id: replica_id.clone(),
                },
            )?;
            create_annotation(
                document,
                &AnnotationValue {
                    id: "22222222222242228222222222222222".to_owned(),
                    book_id: 42,
                    format: "EPUB".to_owned(),
                    kind: "highlight".to_owned(),
                    locator_json: r#"{"href":"chapter-7.xhtml","type":"application/xhtml+xml"}"#
                        .to_owned(),
                    created_at: 10,
                    color: "orange".to_owned(),
                    note: Some("A note".to_owned()),
                    updated_at: 10,
                    deleted: false,
                    deleted_at: None,
                },
            )?;
            add_reading_session_duration(
                document,
                &ReadingSessionValue {
                    id: "33333333333343338333333333333333".to_owned(),
                    origin_replica_id: replica_id.clone(),
                    book_id: 42,
                    format: "EPUB".to_owned(),
                    local_day: "2026-07-27".to_owned(),
                    started_at: 10,
                    duration_seconds: 120,
                    updated_at: 130,
                },
            )?;
            add_reading_completion(
                document,
                &ReadingCompletionValue {
                    id: "44444444444444448444444444444444".to_owned(),
                    book_id: 42,
                    format: "EPUB".to_owned(),
                    local_day: "2026-07-27".to_owned(),
                    completed_at: 130,
                    updated_at: 130,
                    replica_id,
                },
            )?;
            Ok(())
        })
        .unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();

        sync_database_with_operator(&source_path, &operator, &source, 140, SyncMode::Full)
            .await
            .unwrap();
        let report =
            sync_database_with_operator(&target_path, &operator, &target, 150, SyncMode::Full)
                .await
                .unwrap();

        assert!(report.pulled > 0);
        let target_db = rusqlite::Connection::open(target_path).unwrap();
        for table in [
            "reading_progress",
            "favorite_books",
            "bookmarks",
            "annotations",
            "reading_sessions",
            "reading_completions",
        ] {
            let count: i64 = target_db
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 1, "{table} projection was not synchronized");
        }
    }

    struct TestObserver {
        cancelled: AtomicBool,
        progress: Mutex<Vec<SyncProgress>>,
    }

    impl SyncObserver for TestObserver {
        fn is_cancelled(&self) -> bool {
            self.cancelled.load(Ordering::Relaxed)
        }

        fn on_progress(&self, progress: SyncProgress) {
            self.progress.lock().unwrap().push(progress);
        }
    }

    #[tokio::test]
    async fn should_stop_before_storage_work_when_task_is_cancelled() {
        let (_directory, path) = database();
        let identity = DatabaseIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".to_owned(),
        };
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();
        let observer = TestObserver {
            cancelled: AtomicBool::new(true),
            progress: Mutex::new(Vec::new()),
        };

        let error = sync_database_with_operator_observed(
            &path,
            &operator,
            &identity,
            1,
            SyncMode::Full,
            &observer,
        )
        .await
        .unwrap_err();

        assert_eq!(error.to_string(), "SYNC_ERROR: Sync task cancelled");
        assert!(observer.progress.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn should_report_stage_progress_when_sync_completes() {
        let (_directory, path) = database();
        let identity = DatabaseIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".to_owned(),
        };
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();
        let observer = TestObserver {
            cancelled: AtomicBool::new(false),
            progress: Mutex::new(Vec::new()),
        };

        sync_database_with_operator_observed(
            &path,
            &operator,
            &identity,
            1,
            SyncMode::Full,
            &observer,
        )
        .await
        .unwrap();

        let stages = observer
            .progress
            .lock()
            .unwrap()
            .iter()
            .map(|progress| progress.stage)
            .collect::<Vec<_>>();
        assert_eq!(stages.first(), Some(&SyncStage::Preparing));
        assert_eq!(stages.last(), Some(&SyncStage::Complete));
        assert!(stages.contains(&SyncStage::Pushing));
        assert!(stages.contains(&SyncStage::Pulling));
    }
}
