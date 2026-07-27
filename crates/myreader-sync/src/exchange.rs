use std::str::FromStr;

use automerge::ChangeHash;
use opendal::Operator;
use sha2::{Digest, Sha256};

use crate::{
    persistence::{
        apply_remote_database_objects, ensure_database_document, has_receipt, list_pending_outbox,
        mark_outbox_published, read_database_diagnostics, DatabaseIdentity, SyncRemoteObject,
    },
    SyncError,
};

const REMOTE_CHANGES_ROOT: &str = ".myreader/automerge/changes";
const MAX_REMOTE_OBJECT_BYTES: usize = 4 * 1024 * 1024;
const MAX_REMOTE_OBJECTS_PER_SYNC: usize = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncMode {
    PushOnly,
    Full,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncReport {
    pub pushed: usize,
    pub pulled: usize,
}

fn sync_error(message: impl Into<String>) -> SyncError {
    SyncError::Sync(message.into())
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
) -> Result<usize, SyncError> {
    let pending = list_pending_outbox(database_path)?;
    let mut pushed = 0;
    for row in pending {
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
    }
    Ok(pushed)
}

async fn list_remote_objects(
    database_path: &str,
    operator: &Operator,
    identity: &DatabaseIdentity,
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
    let mut objects = Vec::new();
    for entry in entries {
        let path = entry.path().trim_end_matches('/');
        let Some((actor, head)) = parse_remote_path(path) else {
            continue;
        };
        if actor == local_actor || has_receipt(database_path, path)? {
            continue;
        }
        let bytes = operator
            .read(path)
            .await
            .map_err(|error| sync_error(format!("Read {path} failed: {error}")))?
            .to_vec();
        if bytes.len() > MAX_REMOTE_OBJECT_BYTES {
            return Err(sync_error(format!(
                "Remote Automerge object exceeds {MAX_REMOTE_OBJECT_BYTES} bytes"
            )));
        }
        objects.push(SyncRemoteObject {
            object_path: path.to_owned(),
            head,
            sha256: sha256_hex(&bytes),
            bytes,
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
) -> Result<usize, SyncError> {
    let objects = list_remote_objects(database_path, operator, identity).await?;
    if objects.is_empty() {
        return Ok(0);
    }
    apply_remote_database_objects(database_path, identity, now_ms, objects)
        .map(|result| result.applied_objects)
}

pub async fn sync_database_with_operator(
    database_path: &str,
    operator: &Operator,
    identity: &DatabaseIdentity,
    now_ms: i64,
    mode: SyncMode,
) -> Result<SyncReport, SyncError> {
    ensure_database_document(database_path, identity, now_ms)?;
    let pushed = publish(database_path, operator, now_ms).await?;
    let pulled = match mode {
        SyncMode::PushOnly => 0,
        SyncMode::Full => pull(database_path, operator, identity, now_ms).await?,
    };
    Ok(SyncReport { pushed, pulled })
}

pub fn has_pending_database_work(database_path: &str) -> Result<bool, SyncError> {
    read_database_diagnostics(database_path).map(|diagnostics| diagnostics.pending_outbox > 0)
}

#[cfg(test)]
mod tests {
    use crate::{
        document::{set_reading_position, ReadingPositionValue},
        persistence::execute_local_database_mutation,
    };

    use super::*;

    const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";

    fn database() -> (tempfile::TempDir, String) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("library.sqlite");
        let connection = rusqlite::Connection::open(&path).unwrap();
        for migration in [
            include_str!("../../../packages/db/drizzle/0000_initial.sql"),
            include_str!("../../../packages/db/drizzle/0001_add_book_reading_format.sql"),
            include_str!("../../../packages/db/drizzle/0002_add_favorite_books.sql"),
            include_str!("../../../packages/db/drizzle/0003_add_book_cover_thumbnail_cache.sql"),
            include_str!("../../../packages/db/drizzle/0004_add_bookmarks.sql"),
            include_str!("../../../packages/db/drizzle/0005_add_annotations.sql"),
            include_str!(
                "../../../packages/db/drizzle/0006_add_reading_progress_display_progression.sql"
            ),
            include_str!("../../../packages/db/drizzle/0007_add_reading_statistics.sql"),
            include_str!("../../../packages/db/drizzle/0008_add_library_sidecar_sync_kernel.sql"),
            include_str!("../../../packages/db/drizzle/0009_add_reading_progress_sync_clock.sql"),
            include_str!("../../../packages/db/drizzle/0010_add_favorite_sync_projection.sql"),
            include_str!("../../../packages/db/drizzle/0011_add_bookmark_sync_projection.sql"),
            include_str!("../../../packages/db/drizzle/0012_add_automerge_sync_storage.sql"),
            include_str!(
                "../../../packages/db/drizzle/0013_add_reading_position_conflict_projection.sql"
            ),
            include_str!("../../../packages/db/drizzle/0014_remove_legacy_sidecar_sync.sql"),
            include_str!("../../../packages/db/drizzle/0015_remove_hlc_projection_columns.sql"),
            include_str!("../../../packages/db/drizzle/0016_discard_legacy_sync_state.sql"),
            include_str!("../../../packages/db/drizzle/0017_square_toro.sql"),
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
}
