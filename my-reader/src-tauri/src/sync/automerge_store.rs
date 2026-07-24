use std::{collections::HashSet, str::FromStr, sync::OnceLock};

use automerge::{AutoCommit, ChangeHash};
use opendal::Operator;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DatabaseTransaction, EntityTrait, ExprTrait,
    QueryFilter, QueryOrder, Set, TransactionTrait,
};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use tracing::info;
use uuid::Uuid;

use crate::entities::app::{
    sync_automerge_changes, sync_automerge_outbox, sync_automerge_projection_meta,
    sync_automerge_receipts, sync_automerge_state,
};
use crate::error::AppError;

use super::automerge_document::{
    apply_library_sidecar_incremental, library_sidecar_changes_since, library_sidecar_heads,
    library_sidecar_missing_dependencies, load_library_sidecar_document,
    load_library_sidecar_document_bytes, save_library_sidecar_document,
    save_library_sidecar_incremental, set_library_identity, validate_library_identity,
    LIBRARY_SIDECAR_GENESIS_HEAD, LIBRARY_SIDECAR_SCHEMA_VERSION,
};
use super::replica_identity::ReplicaIdentity;

const REMOTE_CHANGES_ROOT: &str = ".myreader/automerge/changes";
const PROJECTION_VERSION: i64 = 1;
const MAX_REMOTE_OBJECT_BYTES: usize = 4 * 1024 * 1024;
const MAX_REMOTE_OBJECTS_PER_SYNC: usize = 10_000;

static WRITER: OnceLock<Mutex<()>> = OnceLock::new();

fn writer() -> &'static Mutex<()> {
    WRITER.get_or_init(|| Mutex::new(()))
}

fn database_error(error: sea_orm::DbErr) -> AppError {
    AppError::Database(error.to_string())
}

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn now_i64(now_ms: u64) -> Result<i64, AppError> {
    i64::try_from(now_ms).map_err(|_| sync_error("Sync time is out of range"))
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

fn heads_json(doc: &mut AutoCommit) -> Result<String, AppError> {
    serde_json::to_string(&library_sidecar_heads(doc))
        .map_err(|error| sync_error(format!("Failed to encode Automerge heads: {error}")))
}

fn outbox_path(actor_id: &str, sequence: u64, hash: &str) -> String {
    format!("{REMOTE_CHANGES_ROOT}/{actor_id}/{sequence:020}-{hash}.am")
}

async fn read_state<C>(db: &C) -> Result<Option<sync_automerge_state::Model>, AppError>
where
    C: sea_orm::ConnectionTrait,
{
    sync_automerge_state::Entity::find_by_id("local")
        .one(db)
        .await
        .map_err(database_error)
}

async fn write_state(
    txn: &DatabaseTransaction,
    doc: &mut AutoCommit,
    now_ms: u64,
) -> Result<String, AppError> {
    let heads_json = heads_json(doc)?;
    let model = sync_automerge_state::ActiveModel {
        id: Set("local".to_owned()),
        schema_version: Set(
            i64::try_from(LIBRARY_SIDECAR_SCHEMA_VERSION).expect("schema version fits i64")
        ),
        snapshot_bytes: Set(save_library_sidecar_document(doc)),
        heads_json: Set(heads_json.clone()),
        updated_at: Set(now_i64(now_ms)?),
    };
    sync_automerge_state::Entity::insert(model)
        .on_conflict(
            sea_orm::sea_query::OnConflict::column(sync_automerge_state::Column::Id)
                .update_columns([
                    sync_automerge_state::Column::SchemaVersion,
                    sync_automerge_state::Column::SnapshotBytes,
                    sync_automerge_state::Column::HeadsJson,
                    sync_automerge_state::Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec(txn)
        .await
        .map_err(database_error)?;
    Ok(heads_json)
}

async fn write_projection_meta(
    txn: &DatabaseTransaction,
    heads_json: String,
    rebuilt_at: Option<i64>,
) -> Result<(), AppError> {
    let model = sync_automerge_projection_meta::ActiveModel {
        id: Set("local".to_owned()),
        projection_version: Set(PROJECTION_VERSION),
        heads_json: Set(heads_json),
        rebuilt_at: Set(rebuilt_at),
    };
    sync_automerge_projection_meta::Entity::insert(model)
        .on_conflict(
            sea_orm::sea_query::OnConflict::column(sync_automerge_projection_meta::Column::Id)
                .update_columns([
                    sync_automerge_projection_meta::Column::ProjectionVersion,
                    sync_automerge_projection_meta::Column::HeadsJson,
                    sync_automerge_projection_meta::Column::RebuiltAt,
                ])
                .to_owned(),
        )
        .exec(txn)
        .await
        .map_err(database_error)?;
    Ok(())
}

async fn insert_changes(
    txn: &DatabaseTransaction,
    changes: &[super::automerge_document::LibrarySidecarAutomergeChange],
    origin: &str,
    now_ms: u64,
) -> Result<(), AppError> {
    for change in changes {
        if let Some(existing) = sync_automerge_changes::Entity::find()
            .filter(
                sync_automerge_changes::Column::ChangeHash
                    .eq(&change.hash)
                    .or(sync_automerge_changes::Column::ActorId
                        .eq(&change.actor_id)
                        .and(
                            sync_automerge_changes::Column::ActorSequence
                                .eq(change.sequence.to_string()),
                        )),
            )
            .one(txn)
            .await
            .map_err(database_error)?
        {
            if existing.change_hash != change.hash {
                return Err(sync_error(format!(
                    "Automerge actor {} sequence {} is a fork",
                    change.actor_id, change.sequence
                )));
            }
            continue;
        }
        sync_automerge_changes::ActiveModel {
            id: Set(Uuid::new_v4().as_simple().to_string()),
            change_hash: Set(change.hash.clone()),
            actor_id: Set(change.actor_id.clone()),
            actor_sequence: Set(change.sequence.to_string()),
            bytes: Set(change.bytes.clone()),
            origin: Set(origin.to_owned()),
            created_at: Set(now_i64(now_ms)?),
        }
        .insert(txn)
        .await
        .map_err(database_error)?;
    }
    Ok(())
}

async fn insert_outbox(
    txn: &DatabaseTransaction,
    path: String,
    bytes: Vec<u8>,
    changes: &[super::automerge_document::LibrarySidecarAutomergeChange],
) -> Result<(), AppError> {
    let digest = sha256_hex(&bytes);
    if let Some(existing) = sync_automerge_outbox::Entity::find()
        .filter(sync_automerge_outbox::Column::ObjectPath.eq(&path))
        .one(txn)
        .await
        .map_err(database_error)?
    {
        if existing.sha256 != digest {
            return Err(sync_error(format!(
                "Automerge outbox path collision: {path}"
            )));
        }
        return Ok(());
    }
    sync_automerge_outbox::ActiveModel {
        id: Set(Uuid::new_v4().as_simple().to_string()),
        object_path: Set(path),
        bytes: Set(bytes),
        sha256: Set(digest),
        change_hashes_json: Set(serde_json::to_string(
            &changes
                .iter()
                .map(|change| change.hash.as_str())
                .collect::<Vec<_>>(),
        )
        .map_err(|error| sync_error(format!("Failed to encode change hashes: {error}")))?),
        published_at: Set(None),
    }
    .insert(txn)
    .await
    .map_err(database_error)?;
    Ok(())
}

fn load_state_document(
    state: sync_automerge_state::Model,
    identity: &ReplicaIdentity,
) -> Result<AutoCommit, AppError> {
    let mut doc = load_library_sidecar_document_bytes(&state.snapshot_bytes, &identity.replica_id)?;
    validate_library_identity(&doc, &identity.library_uuid)?;
    if heads_json(&mut doc)? != state.heads_json {
        return Err(sync_error(
            "Persisted Automerge heads do not match its snapshot",
        ));
    }
    Ok(doc)
}

async fn ensure_state_locked(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<AutoCommit, AppError> {
    if let Some(state) = read_state(db).await? {
        return load_state_document(state, identity);
    }
    let mut genesis = load_library_sidecar_document(&identity.replica_id)?;
    let genesis_head = ChangeHash::from_str(LIBRARY_SIDECAR_GENESIS_HEAD)
        .map_err(|_| sync_error("Canonical genesis head is invalid"))?;
    set_library_identity(&mut genesis, &identity.library_uuid, now_i64(now_ms)?)?;
    let changes = library_sidecar_changes_since(&mut genesis, &[genesis_head]);
    let incremental = save_library_sidecar_incremental(&mut genesis, &[genesis_head]);
    let last = changes
        .last()
        .ok_or_else(|| sync_error("Automerge initialization produced no change"))?;
    let path = outbox_path(&last.actor_id, last.sequence, &last.hash);
    let txn = db.begin().await.map_err(database_error)?;
    if let Some(existing) = read_state(&txn).await? {
        txn.commit().await.map_err(database_error)?;
        return load_state_document(existing, identity);
    }
    let heads = write_state(&txn, &mut genesis, now_ms).await?;
    insert_changes(&txn, &changes, "local", now_ms).await?;
    insert_outbox(&txn, path, incremental, &changes).await?;
    write_projection_meta(&txn, heads, Some(now_i64(now_ms)?)).await?;
    txn.commit().await.map_err(database_error)?;
    Ok(genesis)
}

async fn rebuild_projection_if_needed_locked(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
    projection: Option<&dyn AutomergeProjection>,
) -> Result<(), AppError> {
    let Some(projection) = projection else {
        return Ok(());
    };
    let state = read_state(db)
        .await?
        .ok_or_else(|| sync_error("Automerge state is not initialized"))?;
    let current_meta = sync_automerge_projection_meta::Entity::find_by_id("local")
        .one(db)
        .await
        .map_err(database_error)?;
    if current_meta.as_ref().is_some_and(|meta| {
        meta.projection_version == PROJECTION_VERSION && meta.heads_json == state.heads_json
    }) {
        return Ok(());
    }
    let mut document = load_state_document(state, identity)?;
    let heads = heads_json(&mut document)?;
    let txn = db.begin().await.map_err(database_error)?;
    projection.apply(&txn, &document, &heads).await?;
    write_projection_meta(&txn, heads, Some(now_i64(now_ms)?)).await?;
    txn.commit().await.map_err(database_error)?;
    Ok(())
}

pub async fn ensure_library_sidecar_automerge_state(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<(), AppError> {
    let _guard = writer().lock().await;
    ensure_state_locked(db, identity, now_ms).await?;
    Ok(())
}

pub async fn read_library_sidecar_automerge_document(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
) -> Result<AutoCommit, AppError> {
    let _guard = writer().lock().await;
    ensure_state_locked(db, identity, now_ms).await?;
    let state = read_state(db)
        .await?
        .ok_or_else(|| sync_error("Automerge state is not initialized"))?;
    load_state_document(state, identity)
}

pub async fn commit_library_sidecar_automerge_mutation<F>(
    db: &DatabaseConnection,
    identity: &ReplicaIdentity,
    now_ms: u64,
    mutate: F,
    projection: Option<&dyn AutomergeProjection>,
) -> Result<(), AppError>
where
    F: FnOnce(&mut AutoCommit) -> Result<(), AppError>,
{
    let _guard = writer().lock().await;
    ensure_state_locked(db, identity, now_ms).await?;
    let state = read_state(db)
        .await?
        .ok_or_else(|| sync_error("Automerge state is not initialized"))?;
    let mut doc = load_state_document(state, identity)?;
    let before_heads = doc.get_heads();
    mutate(&mut doc)?;
    validate_library_identity(&doc, &identity.library_uuid)?;
    let changes = library_sidecar_changes_since(&mut doc, &before_heads);
    if changes.is_empty() {
        return Ok(());
    }
    let incremental = save_library_sidecar_incremental(&mut doc, &before_heads);
    let last = changes
        .last()
        .ok_or_else(|| sync_error("Automerge mutation produced no change"))?;
    let path = outbox_path(&last.actor_id, last.sequence, &last.hash);
    let txn = db.begin().await.map_err(database_error)?;
    let heads = write_state(&txn, &mut doc, now_ms).await?;
    insert_changes(&txn, &changes, "local", now_ms).await?;
    insert_outbox(&txn, path, incremental, &changes).await?;
    if let Some(projection) = projection {
        projection.apply(&txn, &doc, &heads).await?;
    }
    write_projection_meta(&txn, heads, None).await?;
    txn.commit().await.map_err(database_error)?;
    Ok(())
}

async fn publish_locked(
    db: &DatabaseConnection,
    operator: &Operator,
    now_ms: u64,
) -> Result<usize, AppError> {
    let pending = sync_automerge_outbox::Entity::find()
        .filter(sync_automerge_outbox::Column::PublishedAt.is_null())
        .order_by_asc(sync_automerge_outbox::Column::ObjectPath)
        .all(db)
        .await
        .map_err(database_error)?;
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
        let txn = db.begin().await.map_err(database_error)?;
        let mut active: sync_automerge_outbox::ActiveModel = row.clone().into();
        active.published_at = Set(Some(now_i64(now_ms)?));
        active.update(&txn).await.map_err(database_error)?;
        txn.commit().await.map_err(database_error)?;
        pushed += serde_json::from_str::<Vec<String>>(&row.change_hashes_json)
            .map_err(|error| sync_error(format!("Invalid outbox change hashes: {error}")))?
            .len();
    }
    Ok(pushed)
}

#[derive(Debug)]
struct RemoteObject {
    path: String,
    head: ChangeHash,
    bytes: Vec<u8>,
    sha256: String,
}

fn parse_remote_path(path: &str) -> Option<(String, ChangeHash)> {
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
        .map(|hash| (actor.to_owned(), hash))
}

async fn list_remote_objects(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
) -> Result<Vec<RemoteObject>, AppError> {
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
    let receipt_paths = sync_automerge_receipts::Entity::find()
        .all(db)
        .await
        .map_err(database_error)?
        .into_iter()
        .map(|receipt| receipt.object_path)
        .collect::<HashSet<_>>();
    let mut objects = Vec::new();
    for entry in entries {
        let path = entry.path().trim_end_matches('/');
        let Some((actor, head)) = parse_remote_path(path) else {
            continue;
        };
        if actor == local_actor || receipt_paths.contains(path) {
            continue;
        }
        let bytes = operator
            .read(path)
            .await
            .map_err(|error| sync_error(format!("Read {path} failed: {error}")))?
            .to_vec();
        validate_remote_object_size(bytes.len())?;
        objects.push(RemoteObject {
            path: path.to_owned(),
            head,
            sha256: sha256_hex(&bytes),
            bytes,
        });
    }
    objects.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(objects)
}

async fn pull_locked(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
    now_ms: u64,
    projection: Option<&dyn AutomergeProjection>,
) -> Result<usize, AppError> {
    let objects = list_remote_objects(db, operator, identity).await?;
    if objects.is_empty() {
        return Ok(0);
    }
    let state = read_state(db)
        .await?
        .ok_or_else(|| sync_error("Automerge state is not initialized"))?;
    let mut doc = load_state_document(state, identity)?;
    let before_heads = doc.get_heads();
    for object in &objects {
        apply_library_sidecar_incremental(&mut doc, &object.bytes)?;
    }
    validate_library_identity(&doc, &identity.library_uuid)?;
    let accepted = objects
        .iter()
        .filter(|object| library_sidecar_missing_dependencies(&mut doc, &[object.head]).is_empty())
        .collect::<Vec<_>>();
    if accepted.len() != objects.len() {
        return Err(sync_error(
            "Remote Automerge objects have missing dependencies",
        ));
    }
    let changes = library_sidecar_changes_since(&mut doc, &before_heads);
    let txn = db.begin().await.map_err(database_error)?;
    let heads = write_state(&txn, &mut doc, now_ms).await?;
    insert_changes(&txn, &changes, "remote", now_ms).await?;
    for object in &accepted {
        sync_automerge_receipts::ActiveModel {
            id: Set(Uuid::new_v4().as_simple().to_string()),
            object_path: Set(object.path.clone()),
            sha256: Set(object.sha256.clone()),
            applied_at: Set(now_i64(now_ms)?),
        }
        .insert(&txn)
        .await
        .map_err(database_error)?;
    }
    if let Some(projection) = projection {
        projection.apply(&txn, &doc, &heads).await?;
    }
    write_projection_meta(&txn, heads, None).await?;
    txn.commit().await.map_err(database_error)?;
    Ok(accepted.len())
}

#[async_trait::async_trait]
pub trait AutomergeProjection: Send + Sync {
    async fn apply(
        &self,
        txn: &DatabaseTransaction,
        document: &AutoCommit,
        heads_json: &str,
    ) -> Result<(), AppError>;
}

pub async fn sync_library_sidecar_automerge(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
    now_ms: u64,
    projection: Option<&dyn AutomergeProjection>,
) -> Result<(usize, usize), AppError> {
    let _guard = writer().lock().await;
    ensure_state_locked(db, identity, now_ms).await?;
    rebuild_projection_if_needed_locked(db, identity, now_ms, projection).await?;
    let pushed = publish_locked(db, operator, now_ms).await?;
    let pulled = pull_locked(db, operator, identity, now_ms, projection).await?;
    let pending = sync_automerge_outbox::Entity::find()
        .filter(sync_automerge_outbox::Column::PublishedAt.is_null())
        .all(db)
        .await
        .map_err(database_error)?
        .len();
    let changes = sync_automerge_changes::Entity::find()
        .all(db)
        .await
        .map_err(database_error)?
        .len();
    let receipts = sync_automerge_receipts::Entity::find()
        .all(db)
        .await
        .map_err(database_error)?
        .len();
    let state = read_state(db)
        .await?
        .ok_or_else(|| sync_error("Automerge state is not initialized"))?;
    let projection_version = sync_automerge_projection_meta::Entity::find_by_id("local")
        .one(db)
        .await
        .map_err(database_error)?
        .map(|meta| meta.projection_version);
    info!(
        target: "myreader_sync",
        event = "automerge.complete",
        replica_id = %identity.replica_id,
        heads = %state.heads_json,
        projection_version = ?projection_version,
        pushed,
        pulled,
        changes,
        pending_outbox = pending,
        receipts,
        "Completed Automerge sidecar exchange"
    );
    Ok((pushed, pulled))
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database};

    use super::*;
    use crate::entities::app::reading_progress;
    use crate::migration::LibraryMigrator;
    use crate::sync::automerge_document::{set_reading_position, ReadingPositionValue};
    use crate::sync::automerge_projection::LibrarySidecarAutomergeProjection;
    use sea_orm_migration::MigratorTrait;

    const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";
    const REPLICA_ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    async fn database() -> DatabaseConnection {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        LibraryMigrator::up(&db, None).await.unwrap();
        db
    }

    #[tokio::test]
    async fn should_keep_state_and_outbox_atomic_when_initialization_commits() {
        let db = database().await;
        let identity = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };

        ensure_library_sidecar_automerge_state(&db, &identity, 1)
            .await
            .unwrap();

        assert!(read_state(&db).await.unwrap().is_some());
        assert_eq!(
            sync_automerge_outbox::Entity::find()
                .all(&db)
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            sync_automerge_changes::Entity::find()
                .all(&db)
                .await
                .unwrap()
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn should_rollback_document_and_actor_when_outbox_insert_fails() {
        let db = database().await;
        let identity = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };
        db.execute_unprepared(
            "CREATE TRIGGER fail_automerge_outbox
             BEFORE INSERT ON sync_automerge_outbox
             BEGIN SELECT RAISE(ABORT, 'outbox failed'); END",
        )
        .await
        .unwrap();

        assert!(ensure_library_sidecar_automerge_state(&db, &identity, 1)
            .await
            .is_err());
        assert!(read_state(&db).await.unwrap().is_none());
        assert!(sync_automerge_changes::Entity::find()
            .all(&db)
            .await
            .unwrap()
            .is_empty());

        db.execute_unprepared("DROP TRIGGER fail_automerge_outbox")
            .await
            .unwrap();
        ensure_library_sidecar_automerge_state(&db, &identity, 2)
            .await
            .unwrap();

        let state = read_state(&db).await.unwrap().unwrap();
        let mut document = load_state_document(state, &identity).unwrap();
        let changes = library_sidecar_changes_since(
            &mut document,
            &[ChangeHash::from_str(LIBRARY_SIDECAR_GENESIS_HEAD).unwrap()],
        );
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].sequence, 1);
    }

    #[tokio::test]
    async fn should_reuse_identical_bytes_when_publication_is_retried() {
        let db = database().await;
        let identity = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };
        ensure_library_sidecar_automerge_state(&db, &identity, 1)
            .await
            .unwrap();
        let directory = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(directory.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();

        let first = sync_library_sidecar_automerge(&db, &operator, &identity, 2, None)
            .await
            .unwrap();
        let second = sync_library_sidecar_automerge(&db, &operator, &identity, 3, None)
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
    async fn should_project_latest_position_when_one_device_pushes_and_another_pulls() {
        let desktop_db = database().await;
        let mobile_db = database().await;
        let desktop = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: REPLICA_ID.to_owned(),
        };
        let mobile = ReplicaIdentity {
            library_uuid: LIBRARY_UUID.to_owned(),
            replica_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb".to_owned(),
        };
        let projection = LibrarySidecarAutomergeProjection;
        commit_library_sidecar_automerge_mutation(
            &desktop_db,
            &desktop,
            2,
            |document| {
                set_reading_position(
                    document,
                    42,
                    &ReadingPositionValue {
                        format: "PDF".to_owned(),
                        locator_json: r#"{"href":"page=7","type":"application/pdf"}"#.to_owned(),
                        display_progression_ppm: Some(700_000),
                        recorded_at: 2,
                        replica_id: desktop.replica_id.clone(),
                    },
                )?;
                Ok(())
            },
            Some(&projection),
        )
        .await
        .unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = opendal::Operator::new(
            opendal::services::Fs::default().root(remote.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();

        sync_library_sidecar_automerge(&desktop_db, &operator, &desktop, 3, Some(&projection))
            .await
            .unwrap();
        let report =
            sync_library_sidecar_automerge(&mobile_db, &operator, &mobile, 4, Some(&projection))
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
        assert_eq!(row.sync_conflict_count, 1);
    }
}
