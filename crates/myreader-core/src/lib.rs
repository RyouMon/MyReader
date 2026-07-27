//! Shared backend for MyReader desktop and mobile applications.

pub mod database;
pub mod entities;
pub mod migration;

mod error;

pub use error::CoreError;
