use std::path::{Path, PathBuf};

use sea_orm::{Database, DatabaseConnection};
use tracing::info;

use crate::constants::path::{MYREADER_LIBRARY_DB_FILE_NAME, MYREADER_LIBRARY_DIR_NAME};
use crate::error::AppError;

/// Open a per-library SQLite database, sync schema from Entity definitions,
/// and return the DatabaseConnection for ORM query use.
pub async fn open_db(sidecar_root: &str) -> Result<DatabaseConnection, AppError> {
    info!("Start to open reading progress database.");
    let path = library_db_path(sidecar_root)?;
    let url = format!("sqlite://{}?mode=rwc", path.display());

    let db = Database::connect(&url)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    db.get_schema_registry("my_reader_lib::entities::app::*")
        .sync(&db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    info!(
        "Success to open reading progress database. path: \"{}\"",
        path.display()
    );
    Ok(db)
}

pub fn ensure_library_data_dir(sidecar_root: &str) -> Result<PathBuf, AppError> {
    let dir = Path::new(sidecar_root).join(MYREADER_LIBRARY_DIR_NAME);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn library_db_path(sidecar_root: &str) -> Result<PathBuf, AppError> {
    Ok(ensure_library_data_dir(sidecar_root)?.join(MYREADER_LIBRARY_DB_FILE_NAME))
}
