use thiserror::Error;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("SYNC_ERROR: {0}")]
    Sync(String),

    #[error(
        "Remote Automerge object {object_path} is not valid Automerge data: {reason}. To recover, \
         restore it from another device or backup, then sync again."
    )]
    InvalidRemoteObject { object_path: String, reason: String },

    #[error(
        "Remote Automerge storage is incomplete. Objects: {object_paths}. Missing changes: \
         {change_hashes}. Restore the remote storage from a complete backup or device copy, then \
         sync again."
    )]
    MissingDependencies {
        change_hashes: String,
        object_paths: String,
    },
}
