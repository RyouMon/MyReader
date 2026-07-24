//! Database sync engine.
//!
//! This module is the sync *algorithm* only. It knows how to produce and consume
//! immutable `.myreader/changes-v4/<replica>/<sequence>-<hash>.json` segments
//! from a SQLite sidecar DB.
//!
//! Low-level storage operators live in [`crate::storage`]; high-level
//! orchestration lives in [`crate::services::sync_service`].

pub mod bookmark;
pub mod contract;
pub mod db_sync;
pub mod favorite;
pub mod hlc;
pub mod kernel;
pub mod merge;
pub mod metadata;
pub mod projection;
pub mod reading_position;
pub mod segment;
