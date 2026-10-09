pub mod catalog;
pub mod config;
pub mod content;
pub mod datasource;
pub mod library;
pub mod reading;
pub mod sync;
pub mod tts;

pub async fn migrate_library_database(path: &std::path::Path) -> Result<(), crate::CoreError> {
    crate::database::migrate_database_file(path).await
}

pub use crate::database::LibraryDatabaseRemoval;

/// Hold the returned guard through file/config cleanup, then commit the removal.
pub async fn close_library_database(
    path: &std::path::Path,
) -> Result<LibraryDatabaseRemoval, crate::CoreError> {
    crate::database::close_database_file(path).await
}
