//! Platform-independent MyReader sidecar synchronization.

pub mod document;
pub mod document_engine;
mod error;
pub mod persistence;

pub use error::SyncError;
