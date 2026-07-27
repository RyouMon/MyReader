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

#[uniffi::export]
pub fn sync_contract_version() -> u32 {
    1
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
    .map_err(|error| match error {
        sync::SyncError::Sync(message) => RustComponentsError::Sync(message),
    })?;
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

uniffi::setup_scaffolding!();
