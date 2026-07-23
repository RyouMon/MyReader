use std::collections::{HashMap, HashSet};

use opendal::Operator;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DatabaseTransaction, EntityTrait,
    QueryFilter, QueryOrder, QuerySelect, Set, TransactionTrait,
};
use uuid::{Uuid, Variant};

use crate::entities::app::{
    sync_cursors, sync_errors, sync_hlc_state, sync_local_meta, sync_outbox, sync_prepared_segments,
};
use crate::error::AppError;

use super::contract::{Change, DomainState, Segment, PROTOCOL};
use super::segment::{
    decode_segment_file, parse_segment_file_name, prepare_segment, sha256_hex, PreparedSegment,
    SegmentErrorCode,
};

const DEFAULT_SEGMENT_CHANGE_LIMIT: u64 = 100;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReplicaIdentity {
    pub library_uuid: String,
    pub replica_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedSegmentFile {
    pub name: String,
    pub sequence: String,
    pub hash_prefix: String,
}

#[async_trait::async_trait]
pub trait SegmentProjection: Send + Sync {
    async fn apply(&self, txn: &DatabaseTransaction, segment: &Segment) -> Result<(), AppError>;
}

fn database_error(error: sea_orm::DbErr) -> AppError {
    AppError::Database(error.to_string())
}

fn sync_error(message: impl Into<String>) -> AppError {
    AppError::Sync(message.into())
}

fn protocol_error_code(code: SegmentErrorCode) -> &'static str {
    match code {
        SegmentErrorCode::ReplicaFork => "replica_fork",
        SegmentErrorCode::FutureClock => "future_clock",
        SegmentErrorCode::MissingSequence => "missing_sequence",
        SegmentErrorCode::FileHashMismatch => "file_hash_mismatch",
        SegmentErrorCode::InvalidJson => "invalid_json",
        SegmentErrorCode::UnsupportedProtocol => "unsupported_protocol",
        SegmentErrorCode::UnsupportedDomain => "unsupported_domain",
        SegmentErrorCode::LibraryMismatch => "library_mismatch",
        SegmentErrorCode::InvalidChange => "invalid_change",
        SegmentErrorCode::ProjectionFailed => "projection_failed",
    }
}

fn domain_name(state: &DomainState) -> &'static str {
    match state {
        DomainState::Favorite(_) => "book_favorite.v1",
        DomainState::Position(_) => "reading_position.v1",
        DomainState::Bookmark(_) => "bookmark.v1",
        DomainState::Annotation(_) => "annotation.v1",
        DomainState::ReadingSession(_) => "reading_session.v1",
        DomainState::ReadingCompletion(_) => "reading_completion.v1",
    }
}

fn parse_sequence(sequence: &str) -> Result<u64, AppError> {
    let value = sequence
        .parse::<u64>()
        .map_err(|_| sync_error("Invalid local segment sequence"))?;
    if value == 0 || value.to_string() != sequence {
        return Err(sync_error("Invalid local segment sequence"));
    }
    Ok(value)
}

fn map_prepared(model: sync_prepared_segments::Model) -> PreparedSegment {
    PreparedSegment {
        sequence: model.sequence,
        path: model.path,
        bytes: model.bytes,
        sha256: model.sha256,
        change_ids: serde_json::from_str(&model.change_ids_json)
            .expect("prepared change IDs are validated before insert"),
    }
}

async fn read_local_meta<C>(db: &C) -> Result<Option<sync_local_meta::Model>, AppError>
where
    C: sea_orm::ConnectionTrait,
{
    sync_local_meta::Entity::find()
        .one(db)
        .await
        .map_err(database_error)
}

async fn read_pending_prepared<C>(db: &C) -> Result<Option<sync_prepared_segments::Model>, AppError>
where
    C: sea_orm::ConnectionTrait,
{
    sync_prepared_segments::Entity::find()
        .filter(sync_prepared_segments::Column::PublishedAt.is_null())
        .one(db)
        .await
        .map_err(database_error)
}

pub async fn ensure_replica_identity(
    db: &DatabaseConnection,
    library_uuid: &str,
) -> Result<ReplicaIdentity, AppError> {
    let parsed_library_uuid =
        Uuid::parse_str(library_uuid).map_err(|_| sync_error("Invalid library UUID"))?;
    if parsed_library_uuid.get_variant() != Variant::RFC4122
        || !(1..=8).contains(&parsed_library_uuid.get_version_num())
        || parsed_library_uuid.hyphenated().to_string() != library_uuid
    {
        return Err(sync_error("Invalid library UUID"));
    }
    let txn = db.begin().await.map_err(database_error)?;
    if let Some(existing) = read_local_meta(&txn).await? {
        if existing.protocol != PROTOCOL || existing.library_uuid != library_uuid {
            return Err(sync_error(
                "Local sidecar identity does not match this library",
            ));
        }
        super::hlc::Hlc {
            physical_ms: 0,
            counter: 0,
            replica_id: Uuid::parse_str(&existing.replica_id)
                .map_err(|_| sync_error("Invalid local replica ID"))?,
        }
        .encode()
        .map_err(|_| sync_error("Invalid local replica ID"))?;
        txn.commit().await.map_err(database_error)?;
        return Ok(ReplicaIdentity {
            library_uuid: existing.library_uuid,
            replica_id: existing.replica_id,
        });
    }

    let replica_id = Uuid::new_v4().to_string();
    sync_local_meta::ActiveModel {
        id: Set(Uuid::new_v4().as_simple().to_string()),
        protocol: Set(PROTOCOL.to_owned()),
        library_uuid: Set(library_uuid.to_owned()),
        replica_id: Set(replica_id.clone()),
        next_sequence: Set("1".to_owned()),
    }
    .insert(&txn)
    .await
    .map_err(database_error)?;
    txn.commit().await.map_err(database_error)?;
    Ok(ReplicaIdentity {
        library_uuid: library_uuid.to_owned(),
        replica_id,
    })
}

pub async fn read_hlc_state(txn: &DatabaseTransaction) -> Result<Option<(u64, u64)>, AppError> {
    let Some(model) = sync_hlc_state::Entity::find()
        .one(txn)
        .await
        .map_err(database_error)?
    else {
        return Ok(None);
    };
    Ok(Some((
        model
            .physical_ms
            .parse()
            .map_err(|_| sync_error("Invalid persisted HLC physical time"))?,
        model
            .counter
            .parse()
            .map_err(|_| sync_error("Invalid persisted HLC counter"))?,
    )))
}

pub async fn write_hlc_state(
    txn: &DatabaseTransaction,
    physical_ms: u64,
    counter: u64,
) -> Result<(), AppError> {
    if let Some(model) = sync_hlc_state::Entity::find()
        .one(txn)
        .await
        .map_err(database_error)?
    {
        let mut active: sync_hlc_state::ActiveModel = model.into();
        active.physical_ms = Set(physical_ms.to_string());
        active.counter = Set(counter.to_string());
        active.update(txn).await.map_err(database_error)?;
    } else {
        sync_hlc_state::ActiveModel {
            id: Set(Uuid::new_v4().as_simple().to_string()),
            physical_ms: Set(physical_ms.to_string()),
            counter: Set(counter.to_string()),
        }
        .insert(txn)
        .await
        .map_err(database_error)?;
    }
    Ok(())
}

pub async fn enqueue_change(txn: &DatabaseTransaction, change: &Change) -> Result<(), AppError> {
    sync_outbox::ActiveModel {
        id: Set(Uuid::new_v4().as_simple().to_string()),
        change_id: Set(change.change_id.clone()),
        clock: Set(change.clock.clone()),
        domain: Set(domain_name(&change.state).to_owned()),
        state_json: Set(
            serde_json::to_string(&change.state).map_err(|error| sync_error(error.to_string()))?
        ),
        segment_sequence: Set(None),
    }
    .insert(txn)
    .await
    .map_err(database_error)?;
    Ok(())
}

pub async fn prepare_next_segment(
    db: &DatabaseConnection,
    now_ms: u64,
) -> Result<Option<PreparedSegment>, AppError> {
    let txn = db.begin().await.map_err(database_error)?;
    if let Some(existing) = read_pending_prepared(&txn).await? {
        txn.commit().await.map_err(database_error)?;
        return Ok(Some(map_prepared(existing)));
    }
    let meta = read_local_meta(&txn)
        .await?
        .ok_or_else(|| sync_error("Library sidecar identity is not initialized"))?;
    let outbox = sync_outbox::Entity::find()
        .filter(sync_outbox::Column::SegmentSequence.is_null())
        .order_by_asc(sync_outbox::Column::Clock)
        .order_by_asc(sync_outbox::Column::ChangeId)
        .limit(DEFAULT_SEGMENT_CHANGE_LIMIT)
        .all(&txn)
        .await
        .map_err(database_error)?;
    if outbox.is_empty() {
        txn.commit().await.map_err(database_error)?;
        return Ok(None);
    }

    let mut changes = Vec::with_capacity(outbox.len());
    for row in &outbox {
        let state: DomainState = serde_json::from_str(&row.state_json)
            .map_err(|error| sync_error(format!("Invalid outbox state: {error}")))?;
        if domain_name(&state) != row.domain {
            return Err(sync_error("Outbox domain does not match state JSON"));
        }
        changes.push(Change {
            change_id: row.change_id.clone(),
            clock: row.clock.clone(),
            state,
        });
    }
    let segment = Segment {
        protocol: PROTOCOL.to_owned(),
        library_uuid: meta.library_uuid.clone(),
        replica_id: meta.replica_id.clone(),
        sequence: meta.next_sequence.clone(),
        changes,
    };
    let prepared =
        prepare_segment(&segment, now_ms).map_err(|error| sync_error(error.to_string()))?;
    sync_prepared_segments::ActiveModel {
        id: Set(Uuid::new_v4().as_simple().to_string()),
        sequence: Set(prepared.sequence.clone()),
        path: Set(prepared.path.clone()),
        bytes: Set(prepared.bytes.clone()),
        sha256: Set(prepared.sha256.clone()),
        change_ids_json: Set(serde_json::to_string(&prepared.change_ids)
            .map_err(|error| sync_error(error.to_string()))?),
        published_at: Set(None),
    }
    .insert(&txn)
    .await
    .map_err(database_error)?;

    for row in outbox {
        let mut active: sync_outbox::ActiveModel = row.into();
        active.segment_sequence = Set(Some(prepared.sequence.clone()));
        active.update(&txn).await.map_err(database_error)?;
    }
    let mut active: sync_local_meta::ActiveModel = meta.into();
    active.next_sequence = Set(parse_sequence(&prepared.sequence)?
        .checked_add(1)
        .ok_or_else(|| sync_error("Local segment sequence overflow"))?
        .to_string());
    active.update(&txn).await.map_err(database_error)?;
    txn.commit().await.map_err(database_error)?;
    Ok(Some(prepared))
}

pub async fn mark_segment_published(
    db: &DatabaseConnection,
    sequence: &str,
    published_at: i64,
) -> Result<(), AppError> {
    let txn = db.begin().await.map_err(database_error)?;
    let model = sync_prepared_segments::Entity::find()
        .filter(sync_prepared_segments::Column::Sequence.eq(sequence))
        .one(&txn)
        .await
        .map_err(database_error)?
        .filter(|model| model.published_at.is_none())
        .ok_or_else(|| sync_error(format!("Prepared segment {sequence} is not pending")))?;
    let mut active: sync_prepared_segments::ActiveModel = model.into();
    active.published_at = Set(Some(published_at));
    active.update(&txn).await.map_err(database_error)?;
    sync_outbox::Entity::delete_many()
        .filter(sync_outbox::Column::SegmentSequence.eq(sequence))
        .exec(&txn)
        .await
        .map_err(database_error)?;
    txn.commit().await.map_err(database_error)?;
    Ok(())
}

pub async fn publish_segments(
    db: &DatabaseConnection,
    operator: &Operator,
    now_ms: u64,
) -> Result<usize, AppError> {
    let mut pushed = 0;
    loop {
        let Some(prepared) = prepare_next_segment(db, now_ms).await? else {
            return Ok(pushed);
        };
        operator
            .write(&prepared.path, prepared.bytes.clone())
            .await
            .map_err(|error| sync_error(format!("Write {} failed: {error}", prepared.path)))?;
        mark_segment_published(
            db,
            &prepared.sequence,
            i64::try_from(now_ms).map_err(|_| sync_error("Publish time is out of range"))?,
        )
        .await?;
        pushed += prepared.change_ids.len();
    }
}

pub async fn read_cursor<C>(
    db: &C,
    replica_id: &str,
) -> Result<Option<sync_cursors::Model>, AppError>
where
    C: sea_orm::ConnectionTrait,
{
    sync_cursors::Entity::find()
        .filter(sync_cursors::Column::ReplicaId.eq(replica_id))
        .one(db)
        .await
        .map_err(database_error)
}

pub async fn write_cursor(
    txn: &DatabaseTransaction,
    replica_id: &str,
    sequence: &str,
    file_hash: &str,
) -> Result<(), AppError> {
    let model = sync_cursors::ActiveModel {
        id: Set(Uuid::new_v4().as_simple().to_string()),
        replica_id: Set(replica_id.to_owned()),
        sequence: Set(sequence.to_owned()),
        file_hash: Set(file_hash.to_owned()),
    };
    sync_cursors::Entity::insert(model)
        .on_conflict(
            sea_orm::sea_query::OnConflict::column(sync_cursors::Column::ReplicaId)
                .update_columns([
                    sync_cursors::Column::Sequence,
                    sync_cursors::Column::FileHash,
                ])
                .to_owned(),
        )
        .exec(txn)
        .await
        .map_err(database_error)?;
    Ok(())
}

async fn record_protocol_error(
    db: &DatabaseConnection,
    code: SegmentErrorCode,
    replica_id: Option<&str>,
    sequence: Option<&str>,
    file_hash: Option<&str>,
    now_ms: u64,
) -> Result<(), AppError> {
    sync_errors::ActiveModel {
        id: Set(Uuid::new_v4().as_simple().to_string()),
        code: Set(protocol_error_code(code).to_owned()),
        replica_id: Set(replica_id.map(str::to_owned)),
        sequence: Set(sequence.map(str::to_owned)),
        domain: Set(None),
        file_hash: Set(file_hash.map(str::to_owned)),
        created_at: Set(
            i64::try_from(now_ms).map_err(|_| sync_error("Sync error time is out of range"))?
        ),
    }
    .insert(db)
    .await
    .map_err(database_error)?;
    Ok(())
}

pub fn plan_replica_files(
    names: &[String],
    cursor_sequence: &str,
) -> Result<Vec<PlannedSegmentFile>, super::segment::SegmentError> {
    let cursor = cursor_sequence.parse::<u64>().map_err(|_| {
        super::segment::SegmentError::external(
            SegmentErrorCode::InvalidChange,
            "invalid cursor sequence",
        )
    })?;
    let mut groups: HashMap<u64, Vec<PlannedSegmentFile>> = HashMap::new();
    for name in names {
        if name == "replica.json" || !name.ends_with(".json") {
            continue;
        }
        let parsed = parse_segment_file_name(name)?;
        let sequence = parsed.sequence.parse::<u64>().expect("validated sequence");
        if sequence <= cursor {
            continue;
        }
        groups
            .entry(sequence)
            .or_default()
            .push(PlannedSegmentFile {
                name: name.clone(),
                sequence: parsed.sequence,
                hash_prefix: parsed.hash_prefix,
            });
    }

    let mut sequences: Vec<_> = groups.into_iter().collect();
    sequences.sort_by_key(|(sequence, _)| *sequence);
    let mut expected = cursor.checked_add(1).ok_or_else(|| {
        super::segment::SegmentError::external(
            SegmentErrorCode::MissingSequence,
            "cursor sequence overflow",
        )
    })?;
    let mut planned = Vec::new();
    for (sequence, mut files) in sequences {
        if files.len() > 1 {
            return Err(super::segment::SegmentError::external(
                SegmentErrorCode::ReplicaFork,
                format!("replica has multiple files for sequence {sequence}"),
            ));
        }
        if sequence != expected {
            return Err(super::segment::SegmentError::external(
                SegmentErrorCode::MissingSequence,
                format!("replica is missing sequence {expected}"),
            ));
        }
        planned.push(files.remove(0));
        expected = expected.checked_add(1).ok_or_else(|| {
            super::segment::SegmentError::external(
                SegmentErrorCode::MissingSequence,
                "segment sequence overflow",
            )
        })?;
    }
    Ok(planned)
}

async fn list_replica_ids(operator: &Operator) -> Result<Vec<String>, AppError> {
    const ROOT: &str = ".myreader/changes-v4";
    let entries = match operator.list_with(ROOT).recursive(true).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == opendal::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(sync_error(format!("List {ROOT} failed: {error}"))),
    };
    let prefix = format!("{ROOT}/");
    let mut replica_ids = HashSet::new();
    for entry in entries {
        let Some(relative) = entry.path().strip_prefix(&prefix) else {
            continue;
        };
        let Some(replica_id) = relative.split('/').next() else {
            continue;
        };
        if !replica_id.is_empty() {
            replica_ids.insert(replica_id.to_owned());
        }
    }
    Ok(replica_ids.into_iter().collect())
}

async fn list_replica_file_names(
    operator: &Operator,
    replica_id: &str,
) -> Result<Vec<String>, AppError> {
    let dir = format!(".myreader/changes-v4/{replica_id}");
    let entries = match operator.list_with(&dir).recursive(true).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == opendal::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(sync_error(format!("List {dir} failed: {error}"))),
    };
    let prefix = format!("{dir}/");
    Ok(entries
        .into_iter()
        .filter_map(|entry| entry.path().strip_prefix(&prefix).map(str::to_owned))
        .filter(|value| !value.is_empty() && !value.contains('/'))
        .collect())
}

async fn pull_replica(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
    replica_id: &str,
    projection: &dyn SegmentProjection,
    now_ms: u64,
) -> Result<usize, AppError> {
    let cursor = read_cursor(db, replica_id).await?;
    let cursor_sequence = cursor
        .as_ref()
        .map_or("0", |cursor| cursor.sequence.as_str());
    let names = list_replica_file_names(operator, replica_id).await?;
    let planned = match plan_replica_files(&names, cursor_sequence) {
        Ok(planned) => planned,
        Err(error) => {
            record_protocol_error(db, error.code, Some(replica_id), None, None, now_ms).await?;
            return Ok(0);
        }
    };
    let mut pulled = 0;

    for file in planned {
        let path = format!(".myreader/changes-v4/{replica_id}/{}", file.name);
        let bytes = operator
            .read(&path)
            .await
            .map_err(|error| sync_error(format!("Read {path} failed: {error}")))?
            .to_vec();
        let segment = match decode_segment_file(
            &file.name,
            &bytes,
            &identity.library_uuid,
            replica_id,
            now_ms,
        ) {
            Ok(segment) => segment,
            Err(error) => {
                record_protocol_error(
                    db,
                    error.code,
                    Some(replica_id),
                    Some(&file.sequence),
                    Some(&sha256_hex(&bytes)),
                    now_ms,
                )
                .await?;
                break;
            }
        };
        let file_hash = sha256_hex(&bytes);
        let txn = db.begin().await.map_err(database_error)?;
        if projection.apply(&txn, &segment).await.is_err() {
            txn.rollback().await.map_err(database_error)?;
            record_protocol_error(
                db,
                SegmentErrorCode::ProjectionFailed,
                Some(replica_id),
                Some(&file.sequence),
                Some(&file_hash),
                now_ms,
            )
            .await?;
            break;
        }
        write_cursor(&txn, replica_id, &file.sequence, &file_hash).await?;
        txn.commit().await.map_err(database_error)?;
        pulled += segment.changes.len();
    }
    Ok(pulled)
}

pub async fn pull_segments(
    db: &DatabaseConnection,
    operator: &Operator,
    identity: &ReplicaIdentity,
    projection: &dyn SegmentProjection,
    now_ms: u64,
) -> Result<usize, AppError> {
    let mut pulled = 0;
    for replica_id in list_replica_ids(operator).await? {
        if replica_id == identity.replica_id {
            continue;
        }
        let valid_replica = Uuid::parse_str(&replica_id)
            .ok()
            .filter(|uuid| uuid.get_version_num() == 4 && uuid.get_variant() == Variant::RFC4122)
            .filter(|uuid| uuid.hyphenated().to_string() == replica_id)
            .is_some();
        if !valid_replica {
            record_protocol_error(
                db,
                SegmentErrorCode::InvalidChange,
                Some(&replica_id),
                None,
                None,
                now_ms,
            )
            .await?;
            continue;
        }
        pulled += pull_replica(db, operator, identity, &replica_id, projection, now_ms).await?;
    }
    Ok(pulled)
}

#[cfg(test)]
mod tests {
    use opendal::{services::Fs, Operator};
    use sea_orm::{Database, EntityTrait};
    use sea_orm_migration::MigratorTrait;

    use crate::sync::contract::{FavoriteState, FavoriteValue, Lww};

    use super::*;

    const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";

    async fn database() -> DatabaseConnection {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        crate::migration::LibraryMigrator::up(&db, None)
            .await
            .unwrap();
        db
    }

    async fn enqueue_favorite(db: &DatabaseConnection, identity: &ReplicaIdentity) {
        let clock = super::super::hlc::Hlc {
            physical_ms: 1_771_836_263_919,
            counter: 1,
            replica_id: Uuid::parse_str(&identity.replica_id).unwrap(),
        }
        .encode()
        .unwrap();
        let txn = db.begin().await.unwrap();
        enqueue_change(
            &txn,
            &Change {
                change_id: "018f2f8d980b40efb72ec6e86cb70042".to_owned(),
                clock: clock.clone(),
                state: DomainState::Favorite(FavoriteState {
                    book_id: 42,
                    register: Lww {
                        clock,
                        value: FavoriteValue {
                            is_favorite: true,
                            added_at_ms: Some(1_771_831_715_000),
                        },
                    },
                }),
            },
        )
        .await
        .unwrap();
        txn.commit().await.unwrap();
    }

    fn assert_compact_uuid_v4(value: &str) {
        let uuid = Uuid::parse_str(value).unwrap();
        assert_eq!(uuid.get_version_num(), 4);
        assert_eq!(uuid.as_simple().to_string(), value);
    }

    fn remote_segment() -> Segment {
        let mut fixture: serde_json::Value =
            serde_json::from_str(include_str!("fixtures/contract.json")).unwrap();
        fixture["segment"]["sequence"] = serde_json::json!("1");
        serde_json::from_value(fixture["segment"].clone()).unwrap()
    }

    struct NoopProjection;

    #[async_trait::async_trait]
    impl SegmentProjection for NoopProjection {
        async fn apply(
            &self,
            _txn: &DatabaseTransaction,
            _segment: &Segment,
        ) -> Result<(), AppError> {
            Ok(())
        }
    }

    struct FailingProjection;

    #[async_trait::async_trait]
    impl SegmentProjection for FailingProjection {
        async fn apply(
            &self,
            _txn: &DatabaseTransaction,
            _segment: &Segment,
        ) -> Result<(), AppError> {
            Err(sync_error("projection failed"))
        }
    }

    #[tokio::test]
    async fn should_reuse_replica_when_identity_is_initialized_again() {
        let db = database().await;

        let first = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        let second = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();

        assert_eq!(second, first);
    }

    #[tokio::test]
    async fn should_reuse_identical_prepared_bytes_when_publish_is_retried() {
        let db = database().await;
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        enqueue_favorite(&db, &identity).await;

        let first = prepare_next_segment(&db, 1_771_836_263_919)
            .await
            .unwrap()
            .unwrap();
        let second = prepare_next_segment(&db, 1_771_836_263_920)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(second.path, first.path);
        assert_eq!(second.bytes, first.bytes);
        assert_eq!(second.sha256, first.sha256);
    }

    #[tokio::test]
    async fn should_generate_compact_uuid_ids_when_sync_rows_are_inserted() {
        let db = database().await;
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        let local_meta = sync_local_meta::Entity::find()
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_compact_uuid_v4(&local_meta.id);

        let txn = db.begin().await.unwrap();
        write_hlc_state(&txn, 1_771_836_263_919, 1).await.unwrap();
        txn.commit().await.unwrap();
        let hlc_state = sync_hlc_state::Entity::find()
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_compact_uuid_v4(&hlc_state.id);

        enqueue_favorite(&db, &identity).await;

        let outbox = sync_outbox::Entity::find().one(&db).await.unwrap().unwrap();
        assert_compact_uuid_v4(&outbox.id);

        let prepared = prepare_next_segment(&db, 1_771_836_263_919)
            .await
            .unwrap()
            .unwrap();
        let prepared_row = sync_prepared_segments::Entity::find()
            .filter(sync_prepared_segments::Column::Sequence.eq(&prepared.sequence))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_compact_uuid_v4(&prepared_row.id);

        let txn = db.begin().await.unwrap();
        write_cursor(&txn, &identity.replica_id, "1", &prepared.sha256)
            .await
            .unwrap();
        txn.commit().await.unwrap();
        let cursor = read_cursor(&db, &identity.replica_id)
            .await
            .unwrap()
            .unwrap();
        assert_compact_uuid_v4(&cursor.id);
    }

    #[tokio::test]
    async fn should_rollback_hlc_and_outbox_when_business_transaction_fails() {
        let db = database().await;
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        let clock = super::super::hlc::Hlc {
            physical_ms: 1_771_836_263_919,
            counter: 1,
            replica_id: Uuid::parse_str(&identity.replica_id).unwrap(),
        }
        .encode()
        .unwrap();
        let txn = db.begin().await.unwrap();
        write_hlc_state(&txn, 1_771_836_263_919, 1).await.unwrap();
        enqueue_change(
            &txn,
            &Change {
                change_id: "018f2f8d980b40efb72ec6e86cb70042".to_owned(),
                clock: clock.clone(),
                state: DomainState::Favorite(FavoriteState {
                    book_id: 42,
                    register: Lww {
                        clock,
                        value: FavoriteValue {
                            is_favorite: true,
                            added_at_ms: Some(1_771_831_715_000),
                        },
                    },
                }),
            },
        )
        .await
        .unwrap();
        txn.rollback().await.unwrap();

        let verify = db.begin().await.unwrap();
        assert!(read_hlc_state(&verify).await.unwrap().is_none());
        verify.commit().await.unwrap();
        assert_eq!(sync_outbox::Entity::find().all(&db).await.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn should_clear_outbox_when_prepared_segment_is_published() {
        let db = database().await;
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        enqueue_favorite(&db, &identity).await;
        let prepared = prepare_next_segment(&db, 1_771_836_263_919)
            .await
            .unwrap()
            .unwrap();

        mark_segment_published(&db, &prepared.sequence, 1_771_836_263_919)
            .await
            .unwrap();

        assert_eq!(sync_outbox::Entity::find().all(&db).await.unwrap().len(), 0);
        assert!(sync_prepared_segments::Entity::find()
            .filter(sync_prepared_segments::Column::Sequence.eq(&prepared.sequence))
            .one(&db)
            .await
            .unwrap()
            .unwrap()
            .published_at
            .is_some());
    }

    #[tokio::test]
    async fn should_publish_prepared_bytes_when_transport_is_available() {
        let db = database().await;
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        enqueue_favorite(&db, &identity).await;
        let remote = tempfile::tempdir().unwrap();
        let operator = Operator::new(Fs::default().root(remote.path().to_string_lossy().as_ref()))
            .unwrap()
            .finish();

        assert_eq!(
            publish_segments(&db, &operator, 1_771_836_263_919)
                .await
                .unwrap(),
            1
        );
        let paths = operator
            .list_with(".myreader/changes-v4")
            .recursive(true)
            .await
            .unwrap();
        assert!(paths.iter().any(|entry| entry.path().ends_with(".json")));
    }

    #[test]
    fn should_stop_replica_stream_when_sequence_is_missing() {
        let error = plan_replica_files(
            &[
                "1-00000000000000000000000000000000.json".to_owned(),
                "3-00000000000000000000000000000000.json".to_owned(),
            ],
            "0",
        )
        .unwrap_err();

        assert_eq!(error.code, SegmentErrorCode::MissingSequence);
    }

    #[test]
    fn should_report_replica_fork_when_sequence_has_two_files() {
        let error = plan_replica_files(
            &[
                "1-00000000000000000000000000000000.json".to_owned(),
                "1-11111111111111111111111111111111.json".to_owned(),
            ],
            "0",
        )
        .unwrap_err();

        assert_eq!(error.code, SegmentErrorCode::ReplicaFork);
    }

    #[tokio::test]
    async fn should_keep_cursor_unchanged_when_transaction_is_rolled_back() {
        let db = database().await;
        let txn = db.begin().await.unwrap();
        write_cursor(
            &txn,
            "018f2f8d-980b-40ef-b72e-c6e86cb7cc29",
            "1",
            &"0".repeat(64),
        )
        .await
        .unwrap();
        txn.rollback().await.unwrap();

        assert!(read_cursor(&db, "018f2f8d-980b-40ef-b72e-c6e86cb7cc29")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn should_advance_cursor_when_remote_segment_is_applied() {
        let db = database().await;
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = Operator::new(Fs::default().root(remote.path().to_string_lossy().as_ref()))
            .unwrap()
            .finish();
        let segment = remote_segment();
        let prepared = prepare_segment(&segment, 1_771_836_263_919).unwrap();
        operator
            .write(&prepared.path, prepared.bytes)
            .await
            .unwrap();

        assert_eq!(
            pull_segments(
                &db,
                &operator,
                &identity,
                &NoopProjection,
                1_771_836_263_919,
            )
            .await
            .unwrap(),
            1
        );
        assert_eq!(
            read_cursor(&db, &segment.replica_id)
                .await
                .unwrap()
                .unwrap()
                .sequence,
            "1"
        );
    }

    #[tokio::test]
    async fn should_keep_cursor_unchanged_when_remote_projection_fails() {
        let db = database().await;
        let identity = ensure_replica_identity(&db, LIBRARY_UUID).await.unwrap();
        let remote = tempfile::tempdir().unwrap();
        let operator = Operator::new(Fs::default().root(remote.path().to_string_lossy().as_ref()))
            .unwrap()
            .finish();
        let segment = remote_segment();
        let prepared = prepare_segment(&segment, 1_771_836_263_919).unwrap();
        operator
            .write(&prepared.path, prepared.bytes)
            .await
            .unwrap();

        assert_eq!(
            pull_segments(
                &db,
                &operator,
                &identity,
                &FailingProjection,
                1_771_836_263_919,
            )
            .await
            .unwrap(),
            0
        );
        assert!(read_cursor(&db, &segment.replica_id)
            .await
            .unwrap()
            .is_none());
        assert_eq!(
            sync_errors::Entity::find()
                .one(&db)
                .await
                .unwrap()
                .unwrap()
                .code,
            "projection_failed"
        );
    }
}
