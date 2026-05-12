use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::error::AppError;
use crate::models::ReadingProgressDto;
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

const LOG_TARGET: &str = "my_reader_lib::repositories::progress_repo";

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
fn initialize_schema(conn: &Connection) -> Result<(), AppError> {
    if needs_legacy_table_drop(conn)? {
        conn.execute("DROP TABLE reading_progress", [])?;
        log::info!(target: LOG_TARGET, "Dropped legacy reading_progress (anchor_json schema).");
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

/// Repository trait for reading progress data access.
pub trait ReadingProgressRepository {
    fn get_progress(
        &self,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError>;
    fn set_progress(
        &self,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        updated_at: f64,
    ) -> Result<(), AppError>;
}

/// SQLite-backed reading progress repository.
pub struct SqliteProgressRepository {
    conn: Connection,
}

impl SqliteProgressRepository {
    pub fn open(library_path: &str) -> Result<Self, AppError> {
        log::info!(target: LOG_TARGET, "Start to open reading progress database.");
        let path = library_db_path(library_path)?;
        let conn = Connection::open(&path)?;
        initialize_schema(&conn)?;
        log::info!(
            target: LOG_TARGET,
            "Success to open reading progress database. path: \"{}\"",
            path.display()
        );
        Ok(Self { conn })
    }
}

impl ReadingProgressRepository for SqliteProgressRepository {
    fn get_progress(
        &self,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let fmt = format.to_uppercase();
        log::info!(
            target: LOG_TARGET,
            "Start to get reading progress row. book id: {book_id}, format: \"{fmt}\""
        );
        let row = self.conn.query_row(
            "SELECT locator_json, updated_at FROM reading_progress \
             WHERE book_id = ?1 AND format = ?2",
            rusqlite::params![book_id, fmt],
            |row| {
                let j: String = row.get(0)?;
                let u: f64 = row.get(1)?;
                Ok((j, u))
            },
        );
        let (s, updated_at) = match row {
            Ok(v) => v,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                log::info!(
                    target: LOG_TARGET,
                    "Success to get reading progress row. found: false, book id: {book_id}, format: \"{fmt}\""
                );
                return Ok(None);
            }
            Err(e) => {
                log::error!(
                    target: LOG_TARGET,
                    "Failed to get reading progress row. book id: {book_id}, format: \"{fmt}\", error: {e}"
                );
                return Err(e.into());
            }
        };

        let locator: serde_json::Value = serde_json::from_str(&s)?;

        log::info!(
            target: LOG_TARGET,
            "Success to get reading progress row. found: true, updated at: {updated_at}, locator json length: {}",
            s.len(),
        );

        Ok(Some(ReadingProgressDto {
            library_id: library_id.to_string(),
            book_id,
            format: fmt,
            locator,
            updated_at,
        }))
    }

    fn set_progress(
        &self,
        book_id: i64,
        format: &str,
        locator: &serde_json::Value,
        updated_at: f64,
    ) -> Result<(), AppError> {
        let fmt = format.to_uppercase();
        let json = serde_json::to_string(locator)?;
        log::info!(
            target: LOG_TARGET,
            "Start to set reading progress row. book id: {book_id}, format: \"{fmt}\", updated at: {updated_at}, json length: {}",
            json.len(),
        );
        self.conn.execute(
            "INSERT OR REPLACE INTO reading_progress \
             (book_id, format, locator_json, updated_at) \
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![book_id, fmt, json, updated_at],
        )?;
        log::info!(
            target: LOG_TARGET,
            "Success to set reading progress row. book id: {book_id}, format: \"{fmt}\""
        );
        Ok(())
    }
}
