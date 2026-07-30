//! Shared backend for MyReader desktop and mobile applications.

pub mod api;
pub mod models;

mod database;
#[allow(dead_code, unused_imports)]
mod entities;
mod error;
mod infrastructure;
mod migration;
mod repositories;
mod services;
mod sync;

pub use error::CoreError;

#[cfg(feature = "test-support")]
pub mod test_support {
    pub use crate::database::open_db;

    pub mod entities {
        pub use crate::entities::*;
    }
}
