use std::str::FromStr;

use automerge::{AutoCommit, ChangeHash};
use myreader_rust_components::sync::{
    persistence::{
        apply_remote_database_objects, ensure_database_document, execute_local_database_mutation,
        has_receipt, list_pending_outbox, mark_outbox_published, read_database_diagnostics,
        DatabaseIdentity, SyncRemoteObject,
    },
    SyncError,
};
use opendal::Operator;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use sha2::{Digest, Sha256};
use tracing::info;

use crate::error::AppError;

use super::{
    automerge_document::load_library_sidecar_document_bytes, replica_identity::ReplicaIdentity,
};

const REMOTE_CHANGES_ROOT: &str = ".myreader/automerge/changes";
const MAX_REMOTE_OBJECT_BYTES: usize = 4 * 1024 * 1024;
const MAX_REMOTE_OBJECTS_PER_SYNC: usize = 10_000;

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

fn map_sync_error(error: SyncError) -> AppError {
    match error {
        SyncError::Sync(message) => sync_error(message),
    }
}

fn now_i64(now_ms: u64) -> Result<i64, AppError> {
    i64::try_from(now_ms).map_err(|_| sync_error("Sync time is out of range"))
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn validate_remote_object_count(count: usize) -> Result<(), AppError> {
    if count > MAX_REMOTE_OBJECTS_PER_SYNC {
        return Err(sync_error(format!(
            "Remote Automerge object count exceeds {MAX_REMOTE_OBJECTS_PER_SYNC}"
        )));
    }
    Ok(())
}

fn validate_remote_object_size(size: usize) -> Result<(), AppError> {
    if size > MAX_REMOTE_OBJECT_BYTES {
        return Err(sync_error(format!(
            "Remote Automerge object exceeds {MAX_REMOTE_OBJECT_BYTES} bytes"
        )));
    }
    Ok(())
}

async fn database_path(db: &DatabaseConnection) -> Result<String, AppError> {
    let row = db
        .query_one_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA database_list".to_owned(),
        ))
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| sync_error("SQLite database path is unavailable"))?;
    let path: String = row
        .try_get("", "file")
        .map_err(|error| AppError::Database(error.to_string()))?;
    if path.is_empty() {
        return Err(sync_error(
            "Shared sync persistence requires a file-backed SQLite database",
        ));
    }
    Ok(path)
}

fn database_identity(identity: &ReplicaIdentity) -> DatabaseIdentity {
    DatabaseIdentity {
        library_uuid: identity.library_uuid.clone(),
        replica_id: identity.replica_id.clone(),
    }
}

pub async fn ensure_library_sidecar_automerge_state(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<(), AppError> {
    let path = database_path(db).await?;
    ensure_database_document(&path, &database_identity(identity), now_i64(now_ms)?)
        .map_err(map_sync_error)?;
    Ok(())
}

pub async fn read_library_sidecar_automerge_document(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<AutoCommit, AppError> {
    let path = database_path(db).await?;
    let result = ensure_database_document(&path, &database_identity(identity), now_i64(now_ms)?)
        .map_err(map_sync_error)?;
    load_library_sidecar_document_bytes(&result.snapshot_bytes, &identity.replica_id)
        .map_err(map_sync_error)
}

pub async fn commit_library_sidecar_automerge_mutation<F>(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
    mutate: F,
) -> Result<(), AppError>
where
    F: FnOnce(&mut AutoCommit) -> Result<(), AppError>,
{
    let path = database_path(db).await?;
    execute_local_database_mutation(
        &path,
        &database_identity(identity),
        now_i64(now_ms)?,
        |document| mutate(document).map_err(|error| SyncError::Sync(error.to_string())),
    )
    .map_err(map_sync_error)?;
    Ok(())
}

async fn publish(database_path: &str, operator: &Operator, now_ms: u64) -> Result<usize, AppError> {
    let pending = list_pending_outbox(database_path).map_err(map_sync_error)?;
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
        mark_outbox_published(database_path, &row.object_path, now_i64(now_ms)?)
            .map_err(map_sync_error)?;
        pushed += serde_json::from_str::<Vec<String>>(&row.change_hashes_json)
            .map_err(|error| sync_error(format!("Invalid outbox change hashes: {error}")))?
            .len();
    }
    Ok(pushed)
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

async fn list_remote_objects(
    database_path: &str,
    operator: &Operator,
    identity: &ReplicaIdentity,
) -> Result<Vec<SyncRemoteObject>, AppError> {
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
    validate_remote_object_count(entries.len())?;
    let local_actor = identity.replica_id.replace('-', "");
    let mut objects = Vec::new();
    for entry in entries {
        let path = entry.path().trim_end_matches('/');
        let Some((actor, head)) = parse_remote_path(path) else {
            continue;
        };
        if actor == local_actor || has_receipt(database_path, path).map_err(map_sync_error)? {
            continue;
        }
        let bytes = operator
            .read(path)
            .await
            .map_err(|error| sync_error(format!("Read {path} failed: {error}")))?
            .to_vec();
        validate_remote_object_size(bytes.len())?;
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
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<usize, AppError> {
    let objects = list_remote_objects(database_path, operator, identity).await?;
    if objects.is_empty() {
        return Ok(0);
    }
    apply_remote_database_objects(
        database_path,
        &database_identity(identity),
        now_i64(now_ms)?,
        objects,
    )
    .map(|result| result.applied_objects)
    .map_err(map_sync_error)
}

pub async fn sync_library_sidecar_automerge(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<(usize, usize), AppError> {
    let path = database_path(db).await?;
    ensure_database_document(&path, &database_identity(identity), now_i64(now_ms)?)
        .map_err(map_sync_error)?;
    let pushed = publish(&path, operator, now_ms).await?;
    let pulled = pull(&path, operator, identity, now_ms).await?;
    let diagnostics = read_database_diagnostics(&path).map_err(map_sync_error)?;
    info!(
        target: "myreader_sync",
        event = "automerge.complete",
        replica_id = %identity.replica_id,
        heads = ?diagnostics.heads,
        schema_version = ?diagnostics.schema_version,
        projection_version = ?diagnostics.projection_version,
        pushed,
        pulled,
        changes = diagnostics.changes,
        pending_outbox = diagnostics.pending_outbox,
        receipts = diagnostics.receipts,
        "Completed Automerge sidecar exchange"
    );
    Ok((pushed, pulled))
}

pub async fn publish_library_sidecar_automerge(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<usize, AppError> {
    let path = database_path(db).await?;
    ensure_database_document(&path, &database_identity(identity), now_i64(now_ms)?)
        .map_err(map_sync_error)?;
    let pushed = publish(&path, operator, now_ms).await?;
    let diagnostics = read_database_diagnostics(&path).map_err(map_sync_error)?;
    info!(
        target: "myreader_sync",
        event = "automerge.publish_complete",
        replica_id = %identity.replica_id,
        pushed,
        pending_outbox = diagnostics.pending_outbox,
        "Published Automerge sidecar changes"
    );
    Ok(pushed)
}

#[cfg(test)]
mod tests {
    use sea_orm::{DatabaseConnection, EntityTrait};

    use super::*;
    use crate::{
        db,
        entities::app::reading_progress,
        sync::automerge_document::{set_reading_position, ReadingPositionValue},
    };

    const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";
    const REPLICA_ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    async fn database() -> (tempfile::TempDir, DatabaseConnection) {
        let directory = tempfile::tempdir().unwrap();
        let db = db::open_db(directory.path().to_str().unwrap())
            .await
            .unwrap();
        (directory, db)
    }

    #[tokio::test]
    async fn should_initialize_shared_persistence_when_desktop_adapter_opens_document() {
        let (_directory, db) = database().await;
        let identity = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };

        ensure_library_sidecar_automerge_state(&db, &identity, 1)
            .await
            .unwrap();

        let path = database_path(&db).await.unwrap();
        let diagnostics = read_database_diagnostics(&path).unwrap();
        assert_eq!(diagnostics.changes, 1);
        assert_eq!(diagnostics.pending_outbox, 1);
    }

    #[tokio::test]
    async fn should_reuse_identical_bytes_when_publication_is_retried() {
        let (_directory, db) = database().await;
        let identity = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();

        let first = sync_library_sidecar_automerge(&db, &operator, &identity, 2)
            .await
            .unwrap();
        let second = sync_library_sidecar_automerge(&db, &operator, &identity, 3)
            .await
            .unwrap();

        assert_eq!(first, (1, 0));
        assert_eq!(second, (0, 0));
    }

    #[test]
    fn should_reject_remote_object_when_input_limits_are_exceeded() {
        assert!(validate_remote_object_count(MAX_REMOTE_OBJECTS_PER_SYNC).is_ok());
        assert!(validate_remote_object_count(MAX_REMOTE_OBJECTS_PER_SYNC + 1).is_err());
        assert!(validate_remote_object_size(MAX_REMOTE_OBJECT_BYTES).is_ok());
        assert!(validate_remote_object_size(MAX_REMOTE_OBJECT_BYTES + 1).is_err());
    }

    #[tokio::test]
    async fn should_project_latest_position_when_desktop_adapters_exchange_changes() {
        let (_desktop_directory, desktop_db) = database().await;
        let (_mobile_directory, mobile_db) = database().await;
        let desktop = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };
        let mobile = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb".to_owned(),
        };
        let desktop_replica_id = desktop.replica_id.clone();
        commit_library_sidecar_automerge_mutation(&desktop_db, &desktop, 2, |document| {
            set_reading_position(
                document,
                42,
                &ReadingPositionValue {
                    format: "PDF".to_owned(),
                    locator_json: r#"{"href":"page=7","type":"application/pdf"}"#.to_owned(),
                    display_progression_ppm: Some(700_000),
                    recorded_at: 2,
                    replica_id: desktop_replica_id,
                },
            )
            .map_err(map_sync_error)?;
            Ok(())
        })
        .await
        .unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();

        sync_library_sidecar_automerge(&desktop_db, &operator, &desktop, 3)
            .await
            .unwrap();
        let report = sync_library_sidecar_automerge(&mobile_db, &operator, &mobile, 4)
            .await
            .unwrap();

        assert_eq!(report.1, 2);
        let row = reading_progress::Entity::find()
            .one(&mobile_db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.book_id, 42);
        assert_eq!(
            row.locator_json,
            r#"{"href":"page=7","type":"application/pdf"}"#
        );
        assert_eq!(row.display_progression, Some(0.7));
    }
}
