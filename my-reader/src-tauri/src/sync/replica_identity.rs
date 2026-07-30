use myreader_rust_components::sync::{
    persistence::{ensure_database_identity, read_database_identity, DatabaseIdentity},
    SyncError,
};
use sea_orm::DatabaseConnection;

use crate::error::AppError;

use super::automerge_store::database_path;

pub type ReplicaIdentity = DatabaseIdentity;

fn map_sync_error(error: SyncError) -> AppError {
    match error {
        SyncError::Sync(message) => AppError::Sync(message),
    }
}

pub async fn read_replica_identity(
    db: &DatabaseConnection,
) -> Result<Option<ReplicaIdentity>, AppError> {
    read_database_identity(&database_path(db).await?).map_err(map_sync_error)
}

pub async fn ensure_replica_identity(
    db: &DatabaseConnection,
    library_uuid: &str,
) -> Result<ReplicaIdentity, AppError> {
    ensure_database_identity(&database_path(db).await?, library_uuid).map_err(map_sync_error)
}
