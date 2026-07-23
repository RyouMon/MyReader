//! Database sync engine.
//!
//! This module is the sync *algorithm* only. It knows how to produce and consume
//! `.myreader/changes/<device>/<seq>.jsonl` payloads from a SQLite sidecar DB.
//!
//! Low-level storage operators live in [`crate::storage`]; high-level
//! orchestration lives in [`crate::services::sync_service`].

pub mod contract;
pub mod db_sync;
pub mod hlc;
pub mod kernel;
pub mod merge;
pub mod metadata;
pub mod segment;
