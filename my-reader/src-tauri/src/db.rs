use std::path::{Path, PathBuf};

use log::info;
use rusqlite::Connection;

use crate::error::AppError;
use crate::storage_paths::{MYREADER_LIBRARY_DB_FILE_NAME, MYREADER_LIBRARY_DIR_NAME};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS reading_progress (
  book_id INTEGER NOT NULL,
  format TEXT NOT NULL COLLATE NOCASE,
  locator_json TEXT NOT NULL,
  updated_at REAL NOT NULL,
  PRIMARY KEY (book_id, format)
);
";

fn needs_legacy_table_drop(conn: &Connection) -> Result<bool, AppError> {
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='reading_progress'",
    )?;
    let exists = stmt.exists([])?;
    if !exists {
        return Ok(false);
    }
    let mut ci = conn.prepare("PRAGMA table_info(reading_progress)")?;
    let mut has_anchor = false;
    let mut has_locator = false;
    let names = ci.query_map([], |row| row.get::<_, String>(1))?;
    for n in names {
        let n = n?;
        if n == "anchor_json" {
            has_anchor = true;
        }
        if n == "locator_json" {
            has_locator = true;
        }
    }
    Ok(has_anchor && !has_locator)
}

/// 统一数据库 schema 初始化入口，确保生产与测试环境使用一致结构。
pub fn initialize_schema(conn: &Connection) -> Result<(), AppError> {
    if needs_legacy_table_drop(conn)? {
        conn.execute("DROP TABLE reading_progress", [])?;
        info!("Dropped legacy reading_progress (anchor_json schema).");
    }
    conn.execute_batch(SCHEMA)?;
    Ok(())
}

pub fn ensure_library_data_dir(library_path: &str) -> Result<PathBuf, AppError> {
    let dir = Path::new(library_path).join(MYREADER_LIBRARY_DIR_NAME);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn library_db_path(library_path: &str) -> Result<PathBuf, AppError> {
    Ok(ensure_library_data_dir(library_path)?.join(MYREADER_LIBRARY_DB_FILE_NAME))
}

/// Open a per-library SQLite connection with schema initialized.
/// Exposed for sync engine and legacy callers that need raw `Connection`.
pub fn open_db(library_path: &str) -> Result<Connection, AppError> {
    info!("Start to open reading progress database.");
    let path = library_db_path(library_path)?;
    let conn = Connection::open(&path)?;
    initialize_schema(&conn)?;
    info!(
        "Success to open reading progress database. path: \"{}\"",
        path.display()
    );
    Ok(conn)
}
