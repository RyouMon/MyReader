//! Shared backend for MyReader desktop and mobile applications.

pub mod api;
pub mod database;
pub mod entities;
pub mod migration;
pub mod models;
pub mod sync;

mod error;
mod infrastructure;
mod repositories;
mod services;

pub use error::CoreError;
