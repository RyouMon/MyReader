pub mod catalog;
pub mod content;
pub mod datasource;
pub mod library;
pub mod reading;
pub mod registry;
pub mod sync;

pub async fn migrate_library_database(path: &std::path::Path) -> Result<(), crate::CoreError> {
    crate::database::migrate_database_file(path).await
}
