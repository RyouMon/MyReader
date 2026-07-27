use thiserror::Error;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("SYNC_ERROR: {0}")]
    Sync(String),
}
