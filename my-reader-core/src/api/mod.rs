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

/// Release cached connections before removing a library's local database files.
pub async fn close_library_database(path: &std::path::Path) -> Result<(), crate::CoreError> {
    crate::database::close_database_file(path).await
}
