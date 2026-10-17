//! Async entry points for the synchronous transactional store. SQLx queries
//! already run on their own workers and do not use this boundary.
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, LazyLock, Mutex, Weak},
};

use tokio::sync::Mutex as AsyncMutex;

use super::{
    ApplyRemoteDatabaseResult, DatabaseIdentity, DocumentCommandResult,
    PublishableDatabaseSnapshot, SyncDatabaseCommand, SyncError, SyncOutboxEntry, SyncRemoteObject,
    SyncScheduleState,
};
use crate::sync::blocking;

static QUEUES: LazyLock<Mutex<HashMap<PathBuf, Weak<AsyncMutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn queue(path: &str) -> Result<Arc<AsyncMutex<()>>, SyncError> {
    let path = PathBuf::from(path);
    let key = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|error| SyncError::Sync(error.to_string()))?
            .join(path)
    };
    let mut queues = QUEUES.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(queue) = queues.get(&key).and_then(Weak::upgrade) {
        return Ok(queue);
    }
    queues.retain(|_, queue| queue.strong_count() > 0);
    let queue = Arc::new(AsyncMutex::new(()));
    queues.insert(key, Arc::downgrade(&queue));
    Ok(queue)
}

async fn with_database<T, F>(path: &str, work: F) -> Result<T, SyncError>
where
    T: Send + 'static,
    F: FnOnce(&str) -> Result<T, SyncError> + Send + 'static,
{
    // Same-library waiters yield without occupying either executor or blocking
    // threads. Other libraries have independent queues.
    let guard = queue(path)?.lock_owned().await;
    let path = path.to_owned();
    blocking::run(move || {
        let _guard = guard;
        // The store opens a leased connection here. Removal rejects queued work
        // or waits for that connection to close, even if the caller is aborted.
        work(&path)
    })
    .await
}

pub(crate) async fn ensure_database_identity(
    path: &str,
    library_uuid: &str,
) -> Result<DatabaseIdentity, SyncError> {
    let library_uuid = library_uuid.to_owned();
    with_database(path, move |path| {
        super::ensure_database_identity(path, &library_uuid)
    })
    .await
}

pub(crate) async fn ensure_database_document(
    path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
) -> Result<DocumentCommandResult, SyncError> {
    let identity = identity.clone();
    with_database(path, move |path| {
        super::ensure_database_document(path, &identity, now_ms)
    })
    .await
}

pub(crate) async fn execute_local_database_command(
    path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    command: SyncDatabaseCommand,
) -> Result<DocumentCommandResult, SyncError> {
    let identity = identity.clone();
    with_database(path, move |path| {
        super::execute_local_database_command(path, &identity, now_ms, command)
    })
    .await
}

/// Return the mutation's business result across the thread boundary, without
/// shared mutable captures or an extra query outside the transaction.
pub(crate) async fn mutate_document<T, F>(
    path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    mutate: F,
) -> Result<T, SyncError>
where
    T: Send + 'static,
    F: FnOnce(&mut automerge::AutoCommit) -> Result<T, SyncError> + Send + 'static,
{
    let identity = identity.clone();
    with_database(path, move |path| {
        let mut result = None;
        super::execute_local_database_mutation(path, &identity, now_ms, |document| {
            result = Some(mutate(document)?);
            Ok(())
        })?;
        Ok(result.expect("successful transaction executes its mutation"))
    })
    .await
}

pub(crate) async fn apply_remote_database_objects(
    path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
    objects: Vec<SyncRemoteObject>,
) -> Result<ApplyRemoteDatabaseResult, SyncError> {
    let identity = identity.clone();
    let path = path.to_owned();
    blocking::run_background(move || {
        super::apply_remote_database_objects(&path, &identity, now_ms, objects)
    })
    .await
}

pub(crate) async fn prepare_for_sync(
    path: &str,
    identity: &DatabaseIdentity,
    now_ms: i64,
) -> Result<(), SyncError> {
    apply_remote_database_objects(path, identity, now_ms, Vec::new()).await?;
    Ok(())
}

/// Sync inspection never joins the local writer queue or holds a SQLite lock
/// while decoding/projecting the CRDT snapshot.
pub(crate) async fn inspect_for_sync(
    path: &str,
    identity: &DatabaseIdentity,
) -> Result<DocumentCommandResult, SyncError> {
    let path = path.to_owned();
    let identity = identity.clone();
    blocking::run_background(move || {
        let connection = super::open_connection(&path)?;
        let mut state =
            super::decode_state(super::remote::snapshot_token(&connection)?, &identity)?
                .ok_or_else(|| super::sync_error("Local Automerge state is missing"))?;
        let document = super::take_document(&mut state, &identity)?;
        super::execute_loaded_document_command(
            document,
            super::request(&identity, state.heads, super::DocumentCommand::Inspect),
            None,
            super::ProjectionMode::Full,
        )
    })
    .await
}

// Upgrade fallback only. Normal reads use the indexed SQLite projection; an
// existing database can still expose conflicts before its first sync/backfill.
pub(crate) async fn read_position_candidates(
    path: &str,
    identity: &DatabaseIdentity,
    book_id: i64,
    format: &str,
) -> Result<Vec<crate::sync::document::ReadingPositionCandidate>, SyncError> {
    let path = path.to_owned();
    let identity = identity.clone();
    let format = format.to_owned();
    blocking::run(move || {
        let mut connection = super::open_connection(&path)?;
        let transaction = connection
            .transaction_with_behavior(rusqlite::TransactionBehavior::Deferred)
            .map_err(super::database_error)?;
        let token = super::remote::snapshot_token(&transaction)?;
        transaction.commit().map_err(super::database_error)?;
        let Some(mut state) = super::decode_state(token, &identity)? else {
            return Ok(Vec::new());
        };
        let document = super::take_document(&mut state, &identity)?;
        crate::sync::document::reading_position_candidates(&document, book_id, &format)
    })
    .await
}

pub(crate) async fn load_publishable_database_snapshot(
    path: &str,
    identity: &DatabaseIdentity,
) -> Result<Option<PublishableDatabaseSnapshot>, SyncError> {
    let identity = identity.clone();
    let path = path.to_owned();
    blocking::run_background(move || super::load_publishable_database_snapshot(&path, &identity))
        .await
}

pub(crate) async fn list_publishable_outbox(
    path: &str,
) -> Result<Option<Vec<SyncOutboxEntry>>, SyncError> {
    with_database(path, super::list_publishable_outbox).await
}

pub(crate) async fn delete_outbox_entry(path: &str, key: &[String]) -> Result<(), SyncError> {
    let key = key.to_owned();
    with_database(path, move |path| super::delete_outbox_entry(path, &key)).await
}

pub(crate) async fn read_schedule_state(
    path: &str,
) -> Result<Option<SyncScheduleState>, SyncError> {
    with_database(path, super::read_schedule_state).await
}

pub(crate) async fn write_schedule_state(
    path: &str,
    state: &SyncScheduleState,
) -> Result<(), SyncError> {
    let state = state.clone();
    with_database(path, move |path| super::write_schedule_state(path, &state)).await
}

pub(crate) async fn mark_schedule_succeeded(
    path: &str,
    last_pull: Option<i64>,
) -> Result<(), SyncError> {
    with_database(path, move |path| {
        super::mark_schedule_succeeded(path, last_pull)
    })
    .await
}

#[cfg(test)]
#[path = "../tests/async_persistence_contract.rs"]
mod tests;
