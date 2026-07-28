//! Platform-independent MyReader sidecar synchronization.

pub mod document;
pub mod document_engine;
mod error;
pub mod exchange;
pub mod persistence;
pub mod scheduler;
pub mod transport;

pub use error::SyncError;

#[cfg(test)]
mod tests;
