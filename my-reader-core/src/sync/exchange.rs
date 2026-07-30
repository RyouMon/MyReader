use opendal::Operator;
use sha2::{Digest, Sha256};

use super::{
    document::{
        library_sidecar_heads, load_library_sidecar_document_bytes, validate_library_identity,
    },
    persistence::{
        apply_remote_database_objects, delete_outbox_entry, ensure_database_document,
        list_pending_outbox, read_database_diagnostics, DatabaseIdentity, SyncRemoteObject,
    },
    storage::{
        incremental_prefix, snapshot_key, snapshot_prefix, storage_key_to_path, StorageAdapter,
        StorageChunk,
    },
    SyncError,
};

const MAX_REMOTE_OBJECT_BYTES: usize = 16 * 1024 * 1024;
const MAX_REMOTE_OBJECTS_PER_SYNC: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
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
    SidecarComplete,
    Calibre,
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
    fn on_sidecar_complete(&self, _report: &SyncReport) {}
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

fn heads_hash(heads: &[String]) -> String {
    let mut hasher = Sha256::new();
    for head in heads {
        hasher.update(head.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

async fn load_document_chunks(
    adapter: &StorageAdapter<'_>,
    identity: &DatabaseIdentity,
) -> Result<Vec<StorageChunk>, SyncError> {
    let document_id = &identity.library_uuid;
    let mut chunks = adapter.load_range(&snapshot_prefix(document_id)).await?;
    chunks.extend(adapter.load_range(&incremental_prefix(document_id)).await?);
    if chunks.len() > MAX_REMOTE_OBJECTS_PER_SYNC {
        return Err(sync_error(format!(
            "Remote Automerge object count exceeds {MAX_REMOTE_OBJECTS_PER_SYNC}"
        )));
    }
    for chunk in &chunks {
        if chunk.data.len() > MAX_REMOTE_OBJECT_BYTES {
            return Err(sync_error(format!(
                "Remote Automerge object {} exceeds {MAX_REMOTE_OBJECT_BYTES} bytes",
                storage_key_to_path(&chunk.key)?
            )));
        }
        match chunk.key.get(1).map(String::as_str) {
            Some("incremental")
                if chunk.key.last().map(String::as_str)
                    != Some(sha256_hex(&chunk.data).as_str()) =>
            {
                return Err(SyncError::InvalidRemoteObject {
                    object_path: storage_key_to_path(&chunk.key)?,
                    reason: "the content hash does not match its storage key".to_owned(),
                });
            }
            Some("snapshot") => {
                let object_path = storage_key_to_path(&chunk.key)?;
                let mut document =
                    load_library_sidecar_document_bytes(&chunk.data, &identity.replica_id)
                        .map_err(|error| SyncError::InvalidRemoteObject {
                            object_path: object_path.clone(),
                            reason: error.to_string(),
                        })?;
                validate_library_identity(&document, document_id).map_err(|error| {
                    SyncError::InvalidRemoteObject {
                        object_path: object_path.clone(),
                        reason: error.to_string(),
                    }
                })?;
                let snapshot_heads_hash = heads_hash(&library_sidecar_heads(&mut document));
                if chunk.key.last() != Some(&snapshot_heads_hash) {
                    return Err(SyncError::InvalidRemoteObject {
                        object_path,
                        reason: "the heads hash does not match its storage key".to_owned(),
                    });
                }
            }
            _ => {}
        }
    }
    Ok(chunks)
}

fn remote_objects(chunks: &[StorageChunk]) -> Vec<SyncRemoteObject> {
    chunks
        .iter()
        .map(|chunk| SyncRemoteObject {
            storage_key: chunk.key.clone(),
            sha256: sha256_hex(&chunk.data),
            bytes: chunk.data.clone(),
        })
        .collect()
}

async fn publish_pending(
    database_path: &str,
    adapter: &StorageAdapter<'_>,
    observer: &dyn SyncObserver,
) -> Result<(usize, Vec<StorageChunk>), SyncError> {
    let pending = list_pending_outbox(database_path)?;
    observer.on_progress(SyncProgress {
        stage: SyncStage::Pushing,
        completed: 0,
        total: pending.len(),
    });
    let total = pending.len();
    let mut pushed = 0;
    let mut published = Vec::with_capacity(total);
    for (index, row) in pending.into_iter().enumerate() {
        check_cancelled(observer)?;
        adapter.save(&row.storage_key, &row.bytes).await?;
        delete_outbox_entry(database_path, &row.storage_key)?;
        pushed += row.change_count;
        published.push(StorageChunk {
            key: row.storage_key,
            data: row.bytes,
        });
        observer.on_progress(SyncProgress {
            stage: SyncStage::Pushing,
            completed: index + 1,
            total,
        });
    }
    Ok((pushed, published))
}

async fn save_total(
    database_path: &str,
    adapter: &StorageAdapter<'_>,
    document_id: &str,
    document: &super::document_engine::DocumentCommandResult,
) -> Result<(StorageChunk, usize), SyncError> {
    let pending = list_pending_outbox(database_path)?;
    let change_count = pending.iter().map(|row| row.change_count).sum();
    let key = snapshot_key(document_id, &heads_hash(&document.heads));
    adapter.save(&key, &document.snapshot_bytes).await?;
    for row in pending {
        delete_outbox_entry(database_path, &row.storage_key)?;
    }
    Ok((
        StorageChunk {
            key,
            data: document.snapshot_bytes.clone(),
        },
        change_count,
    ))
}

fn should_compact(chunks: &[StorageChunk]) -> bool {
    let mut snapshot_size = 0;
    let mut incremental_size = 0;
    for chunk in chunks {
        match chunk.key.get(1).map(String::as_str) {
            Some("snapshot") => snapshot_size += chunk.data.len(),
            Some("incremental") => incremental_size += chunk.data.len(),
            _ => {}
        }
    }
    snapshot_size < 1024 || incremental_size >= snapshot_size
}

async fn compact(
    database_path: &str,
    adapter: &StorageAdapter<'_>,
    document_id: &str,
    document: &super::document_engine::DocumentCommandResult,
    chunks: &[StorageChunk],
) -> Result<(), SyncError> {
    if !should_compact(chunks) {
        return Ok(());
    }
    let (snapshot, _) = save_total(database_path, adapter, document_id, document).await?;
    for chunk in chunks {
        if chunk.key.get(2) != snapshot.key.get(2) {
            adapter.remove(&chunk.key).await?;
        }
    }
    Ok(())
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
    let mut document = ensure_database_document(database_path, identity, now_ms)?;
    let adapter = StorageAdapter::new(operator);
    let initial_chunks = load_document_chunks(&adapter, identity).await?;
    observer.on_progress(SyncProgress {
        stage: SyncStage::Preparing,
        completed: 1,
        total: 1,
    });

    let pulled = match mode {
        SyncMode::PushOnly => 0,
        SyncMode::Full if initial_chunks.is_empty() => 0,
        SyncMode::Full => {
            check_cancelled(observer)?;
            observer.on_progress(SyncProgress {
                stage: SyncStage::Pulling,
                completed: initial_chunks.len(),
                total: initial_chunks.len(),
            });
            observer.on_progress(SyncProgress {
                stage: SyncStage::Applying,
                completed: 0,
                total: initial_chunks.len(),
            });
            let applied = apply_remote_database_objects(
                database_path,
                identity,
                now_ms,
                remote_objects(&initial_chunks),
            )?;
            document = applied.document;
            observer.on_progress(SyncProgress {
                stage: SyncStage::Applying,
                completed: initial_chunks.len(),
                total: initial_chunks.len(),
            });
            applied.applied_objects
        }
    };

    let mut covered_chunks = initial_chunks.clone();
    let pushed = if initial_chunks.is_empty() {
        observer.on_progress(SyncProgress {
            stage: SyncStage::Pushing,
            completed: 0,
            total: 1,
        });
        let (snapshot, change_count) =
            save_total(database_path, &adapter, &identity.library_uuid, &document).await?;
        covered_chunks.push(snapshot);
        observer.on_progress(SyncProgress {
            stage: SyncStage::Pushing,
            completed: 1,
            total: 1,
        });
        change_count
    } else {
        let (change_count, published) = publish_pending(database_path, &adapter, observer).await?;
        covered_chunks.extend(published);
        change_count
    };

    if mode == SyncMode::Full && (pushed > 0 || pulled > 0) {
        compact(
            database_path,
            &adapter,
            &identity.library_uuid,
            &document,
            &covered_chunks,
        )
        .await?;
    }

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
    use rusqlite::Connection;

    use super::super::{
        document::{set_reading_position, ReadingPositionValue},
        persistence::execute_local_database_mutation,
    };
    use super::*;
    use crate::migration::LEGACY_MIGRATIONS;

    const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";

    fn database() -> (tempfile::TempDir, String) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.sqlite");
        let connection = Connection::open(&path).unwrap();
        for migration in LEGACY_MIGRATIONS {
            for statement in migration.sql.split("--> statement-breakpoint") {
                let statement = statement.trim();
                if !statement.is_empty() {
                    connection.execute_batch(statement).unwrap();
                }
            }
        }
        drop(connection);
        (directory, path.to_string_lossy().into_owned())
    }

    fn identity(replica: &str) -> DatabaseIdentity {
        DatabaseIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: replica.to_owned(),
        }
    }

    fn set_progress(database_path: &str, identity: &DatabaseIdentity, book_id: i64, page: i64) {
        let replica_id = identity.replica_id.clone();
        execute_local_database_mutation(database_path, identity, page, |document| {
            set_reading_position(
                document,
                book_id,
                &ReadingPositionValue {
                    format: "PDF".to_owned(),
                    locator_json: format!(r#"{{"href":"page={page}"}}"#),
                    display_progression_ppm: Some(500_000),
                    recorded_at: page,
                    replica_id,
                },
            )?;
            Ok(())
        })
        .unwrap();
    }

    fn operator(directory: &tempfile::TempDir) -> Operator {
        Operator::new(opendal::services::Fs::default().root(directory.path().to_str().unwrap()))
            .unwrap()
            .finish()
    }

    #[tokio::test]
    async fn should_exchange_projection_when_two_databases_share_storage() {
        let (_source_directory, source_path) = database();
        let (_target_directory, target_path) = database();
        let source = identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        let target = identity("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
        set_progress(&source_path, &source, 42, 7);
        let remote = tempfile::tempdir().unwrap();
        let operator = operator(&remote);

        sync_database_with_operator(&source_path, &operator, &source, 10, SyncMode::Full)
            .await
            .unwrap();
        let report =
            sync_database_with_operator(&target_path, &operator, &target, 11, SyncMode::Full)
                .await
                .unwrap();

        assert!(report.pulled > 0);
        let target_db = Connection::open(target_path).unwrap();
        let locator: String = target_db
            .query_row(
                "SELECT locator_json FROM reading_progress WHERE book_id = 42",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(locator, r#"{"href":"page=7"}"#);
    }

    #[tokio::test]
    async fn should_merge_multiple_snapshots_when_storage_contains_concurrent_documents() {
        let (_first_directory, first_path) = database();
        let (_second_directory, second_path) = database();
        let (_target_directory, target_path) = database();
        let first = identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        let second = identity("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
        let target = identity("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
        set_progress(&first_path, &first, 42, 7);
        set_progress(&second_path, &second, 84, 9);
        let first_document = ensure_database_document(&first_path, &first, 10).unwrap();
        let second_document = ensure_database_document(&second_path, &second, 11).unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = operator(&remote);
        let adapter = StorageAdapter::new(&operator);
        for document in [&first_document, &second_document] {
            adapter
                .save(
                    &snapshot_key(LIBRARY_UUID, &heads_hash(&document.heads)),
                    &document.snapshot_bytes,
                )
                .await
                .unwrap();
        }

        sync_database_with_operator(&target_path, &operator, &target, 12, SyncMode::Full)
            .await
            .unwrap();

        let target_database = Connection::open(target_path).unwrap();
        let count: i64 = target_database
            .query_row("SELECT COUNT(*) FROM reading_progress", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn should_preserve_document_id_directory_when_first_snapshot_is_saved() {
        let (_directory, path) = database();
        let identity = identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        set_progress(&path, &identity, 42, 7);
        let remote = tempfile::tempdir().unwrap();
        let operator = operator(&remote);

        sync_database_with_operator(&path, &operator, &identity, 10, SyncMode::Full)
            .await
            .unwrap();

        let document_root = remote
            .path()
            .join(".myreader/automerge/11111111-2222-4333-8444-555555555555");
        assert!(document_root.join("snapshot").is_dir());
        assert!(!remote.path().join(".myreader/automerge/changes").exists());
        assert!(!remote
            .path()
            .join(".myreader/automerge/generations")
            .exists());
    }

    #[tokio::test]
    async fn should_preserve_concurrent_progress_when_devices_sync_in_both_directions() {
        let (_first_directory, first_path) = database();
        let (_second_directory, second_path) = database();
        let first = identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        let second = identity("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
        set_progress(&first_path, &first, 42, 7);
        set_progress(&second_path, &second, 84, 9);
        let remote = tempfile::tempdir().unwrap();
        let operator = operator(&remote);

        sync_database_with_operator(&first_path, &operator, &first, 10, SyncMode::Full)
            .await
            .unwrap();
        sync_database_with_operator(&second_path, &operator, &second, 11, SyncMode::Full)
            .await
            .unwrap();
        sync_database_with_operator(&first_path, &operator, &first, 12, SyncMode::Full)
            .await
            .unwrap();

        for path in [first_path, second_path] {
            let database = Connection::open(path).unwrap();
            let count: i64 = database
                .query_row("SELECT COUNT(*) FROM reading_progress", [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 2);
        }
    }

    #[test]
    fn should_compact_when_incrementals_are_larger_than_snapshot() {
        assert!(should_compact(&[
            StorageChunk {
                key: snapshot_key(LIBRARY_UUID, "snapshot"),
                data: vec![0; 2_000],
            },
            StorageChunk {
                key: super::super::storage::incremental_key(LIBRARY_UUID, "incremental"),
                data: vec![0; 2_000],
            },
        ]));
    }

    #[tokio::test]
    async fn should_reject_incremental_when_storage_key_hash_does_not_match_content() {
        let (_directory, path) = database();
        let identity = identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        let remote = tempfile::tempdir().unwrap();
        let operator = operator(&remote);
        let adapter = StorageAdapter::new(&operator);
        adapter
            .save(
                &super::super::storage::incremental_key(LIBRARY_UUID, "bad"),
                b"not automerge",
            )
            .await
            .unwrap();

        let error = sync_database_with_operator(&path, &operator, &identity, 10, SyncMode::Full)
            .await
            .unwrap_err();

        assert!(matches!(error, SyncError::InvalidRemoteObject { .. }));
    }

    #[tokio::test]
    async fn should_reject_snapshot_when_storage_key_heads_do_not_match_document() {
        let (_directory, path) = database();
        let identity = identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        let document = ensure_database_document(&path, &identity, 10).unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = operator(&remote);
        let adapter = StorageAdapter::new(&operator);
        adapter
            .save(&snapshot_key(LIBRARY_UUID, "bad"), &document.snapshot_bytes)
            .await
            .unwrap();

        let error = sync_database_with_operator(&path, &operator, &identity, 11, SyncMode::Full)
            .await
            .unwrap_err();

        assert!(matches!(error, SyncError::InvalidRemoteObject { .. }));
    }

    #[tokio::test]
    async fn should_preserve_unloaded_chunk_when_compaction_deletes_covered_chunks() {
        let (_directory, path) = database();
        let identity = identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        let document = ensure_database_document(&path, &identity, 10).unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = operator(&remote);
        let adapter = StorageAdapter::new(&operator);
        let covered = StorageChunk {
            key: snapshot_key(LIBRARY_UUID, "covered"),
            data: vec![0],
        };
        let concurrent = super::super::storage::incremental_key(LIBRARY_UUID, "concurrent");
        adapter.save(&covered.key, &covered.data).await.unwrap();
        adapter.save(&concurrent, b"concurrent").await.unwrap();

        compact(
            &path,
            &adapter,
            LIBRARY_UUID,
            &document,
            std::slice::from_ref(&covered),
        )
        .await
        .unwrap();

        assert_eq!(
            adapter.load(&concurrent).await.unwrap(),
            Some(b"concurrent".to_vec())
        );
    }

    struct CancelledObserver;

    impl SyncObserver for CancelledObserver {
        fn is_cancelled(&self) -> bool {
            true
        }

        fn on_progress(&self, _progress: SyncProgress) {}
    }

    #[tokio::test]
    async fn should_stop_before_storage_work_when_task_is_cancelled() {
        let (_directory, path) = database();
        let identity = identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
        let remote = tempfile::tempdir().unwrap();
        let operator = operator(&remote);

        let error = sync_database_with_operator_observed(
            &path,
            &operator,
            &identity,
            10,
            SyncMode::Full,
            &CancelledObserver,
        )
        .await
        .unwrap_err();

        assert!(error.to_string().contains("cancelled"));
        assert!(!remote.path().join(".myreader").exists());
    }
}
