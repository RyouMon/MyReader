//! Aggregation root for MyReader Rust components.

pub use myreader_sync as sync;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum RustComponentsError {
    #[error("SYNC_ERROR: {0}")]
    Sync(String),
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncDocumentChange {
    pub actor_id: String,
    pub sequence: String,
    pub hash: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncDocumentCommandResult {
    pub schema_version: u32,
    pub library_uuid: Option<String>,
    pub snapshot_bytes: Vec<u8>,
    pub heads: Vec<String>,
    pub incremental_bytes: Vec<u8>,
    pub changes: Vec<SyncDocumentChange>,
    pub missing_dependencies: Vec<String>,
    pub projection_json: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncOutboxEntry {
    pub object_path: String,
    pub bytes: Vec<u8>,
    pub sha256: String,
    pub change_hashes_json: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncRemoteObject {
    pub object_path: String,
    pub head: String,
    pub bytes: Vec<u8>,
    pub sha256: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ApplyRemoteDatabaseResult {
    pub document: SyncDocumentCommandResult,
    pub applied_objects: u32,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncDatabaseDiagnostics {
    pub schema_version: Option<i64>,
    pub heads: Vec<String>,
    pub changes: i64,
    pub pending_outbox: i64,
    pub receipts: i64,
    pub projection_version: Option<i64>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SyncLibrarySidecarReport {
    pub pushed: u32,
    pub pulled: u32,
}

#[uniffi::export]
pub fn sync_contract_version() -> u32 {
    3
}

fn map_document_result(
    result: sync::document_engine::DocumentCommandResult,
) -> Result<SyncDocumentCommandResult, RustComponentsError> {
    let projection_json = serde_json::to_string(&result.projection)
        .map_err(|error| RustComponentsError::Sync(format!("Invalid projection: {error}")))?;
    Ok(SyncDocumentCommandResult {
        schema_version: u32::try_from(result.schema_version)
            .map_err(|_| RustComponentsError::Sync("Schema version is out of range".to_owned()))?,
        library_uuid: result.library_uuid,
        snapshot_bytes: result.snapshot_bytes,
        heads: result.heads,
        incremental_bytes: result.incremental_bytes,
        changes: result
            .changes
            .into_iter()
            .map(|change| SyncDocumentChange {
                actor_id: change.actor_id,
                sequence: change.sequence.to_string(),
                hash: change.hash,
                bytes: change.bytes,
            })
            .collect(),
        missing_dependencies: result.missing_dependencies,
        projection_json,
    })
}

fn map_sync_error(error: sync::SyncError) -> RustComponentsError {
    match error {
        sync::SyncError::Sync(message) => RustComponentsError::Sync(message),
    }
}

fn parse_now_ms(value: &str) -> Result<i64, RustComponentsError> {
    value
        .parse()
        .map_err(|_| RustComponentsError::Sync("Sync timestamp is invalid".to_owned()))
}

#[uniffi::export]
pub fn execute_sync_document_command(
    snapshot_bytes: Option<Vec<u8>>,
    request_json: String,
    payload_bytes: Option<Vec<u8>>,
) -> Result<SyncDocumentCommandResult, RustComponentsError> {
    let request = serde_json::from_str(&request_json)
        .map_err(|error| RustComponentsError::Sync(format!("Invalid document command: {error}")))?;
    let result = sync::document_engine::execute_document_command(
        snapshot_bytes.as_deref(),
        request,
        payload_bytes.as_deref(),
    )
    .map_err(map_sync_error)?;
    map_document_result(result)
}

#[uniffi::export]
pub fn ensure_sync_database_document(
    database_path: String,
    library_uuid: String,
    replica_id: String,
    now_ms: String,
) -> Result<SyncDocumentCommandResult, RustComponentsError> {
    let identity = sync::persistence::DatabaseIdentity {
        library_uuid,
        replica_id,
    };
    let result = sync::persistence::ensure_database_document(
        &database_path,
        &identity,
        parse_now_ms(&now_ms)?,
    )
    .map_err(map_sync_error)?;
    map_document_result(result)
}

#[uniffi::export]
pub fn execute_sync_database_command(
    database_path: String,
    library_uuid: String,
    replica_id: String,
    now_ms: String,
    command_json: String,
) -> Result<SyncDocumentCommandResult, RustComponentsError> {
    let identity = sync::persistence::DatabaseIdentity {
        library_uuid,
        replica_id,
    };
    let command = serde_json::from_str(&command_json).map_err(|error| {
        RustComponentsError::Sync(format!("Invalid sync database command: {error}"))
    })?;
    let result = sync::persistence::execute_local_database_command(
        &database_path,
        &identity,
        parse_now_ms(&now_ms)?,
        command,
    )
    .map_err(map_sync_error)?;
    map_document_result(result)
}

#[uniffi::export]
pub fn list_sync_database_outbox(
    database_path: String,
) -> Result<Vec<SyncOutboxEntry>, RustComponentsError> {
    sync::persistence::list_pending_outbox(&database_path)
        .map(|entries| {
            entries
                .into_iter()
                .map(|entry| SyncOutboxEntry {
                    object_path: entry.object_path,
                    bytes: entry.bytes,
                    sha256: entry.sha256,
                    change_hashes_json: entry.change_hashes_json,
                })
                .collect()
        })
        .map_err(map_sync_error)
}

#[uniffi::export]
pub fn mark_sync_database_outbox_published(
    database_path: String,
    object_path: String,
    published_at: String,
) -> Result<(), RustComponentsError> {
    sync::persistence::mark_outbox_published(
        &database_path,
        &object_path,
        parse_now_ms(&published_at)?,
    )
    .map_err(map_sync_error)
}

#[uniffi::export]
pub fn has_sync_database_receipt(
    database_path: String,
    object_path: String,
) -> Result<bool, RustComponentsError> {
    sync::persistence::has_receipt(&database_path, &object_path).map_err(map_sync_error)
}

#[uniffi::export]
pub fn apply_sync_database_remote_objects(
    database_path: String,
    library_uuid: String,
    replica_id: String,
    now_ms: String,
    objects: Vec<SyncRemoteObject>,
) -> Result<ApplyRemoteDatabaseResult, RustComponentsError> {
    let identity = sync::persistence::DatabaseIdentity {
        library_uuid,
        replica_id,
    };
    let result = sync::persistence::apply_remote_database_objects(
        &database_path,
        &identity,
        parse_now_ms(&now_ms)?,
        objects
            .into_iter()
            .map(|object| sync::persistence::SyncRemoteObject {
                object_path: object.object_path,
                head: object.head,
                bytes: object.bytes,
                sha256: object.sha256,
            })
            .collect(),
    )
    .map_err(map_sync_error)?;
    Ok(ApplyRemoteDatabaseResult {
        document: map_document_result(result.document)?,
        applied_objects: u32::try_from(result.applied_objects).map_err(|_| {
            RustComponentsError::Sync("Applied object count is out of range".to_owned())
        })?,
    })
}

#[uniffi::export]
pub fn read_sync_database_diagnostics(
    database_path: String,
) -> Result<SyncDatabaseDiagnostics, RustComponentsError> {
    sync::persistence::read_database_diagnostics(&database_path)
        .map(|diagnostics| SyncDatabaseDiagnostics {
            schema_version: diagnostics.schema_version,
            heads: diagnostics.heads,
            changes: diagnostics.changes,
            pending_outbox: diagnostics.pending_outbox,
            receipts: diagnostics.receipts,
            projection_version: diagnostics.projection_version,
        })
        .map_err(map_sync_error)
}

#[uniffi::export]
pub async fn sync_library_sidecar(
    database_path: String,
    library_uuid: String,
    replica_id: String,
    now_ms: String,
    mode: String,
    storage_json: String,
) -> Result<SyncLibrarySidecarReport, RustComponentsError> {
    let mode = match mode.as_str() {
        "push_only" => sync::exchange::SyncMode::PushOnly,
        "full" => sync::exchange::SyncMode::Full,
        _ => {
            return Err(RustComponentsError::Sync(
                "Sync mode is unsupported".to_owned(),
            ))
        }
    };
    let storage = serde_json::from_str(&storage_json)
        .map_err(|error| RustComponentsError::Sync(format!("Invalid storage config: {error}")))?;
    let report = sync::transport::sync_database(
        &database_path,
        &sync::persistence::DatabaseIdentity {
            library_uuid,
            replica_id,
        },
        parse_now_ms(&now_ms)?,
        mode,
        &storage,
    )
    .await
    .map_err(map_sync_error)?;
    Ok(SyncLibrarySidecarReport {
        pushed: u32::try_from(report.pushed)
            .map_err(|_| RustComponentsError::Sync("Pushed count is out of range".to_owned()))?,
        pulled: u32::try_from(report.pulled)
            .map_err(|_| RustComponentsError::Sync("Pulled count is out of range".to_owned()))?,
    })
}

uniffi::setup_scaffolding!();
