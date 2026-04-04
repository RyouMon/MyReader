use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::models::{BookAnchor, ReadingProgressDto};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS reading_progress (
  library_id TEXT NOT NULL,
  book_id INTEGER NOT NULL,
  format TEXT NOT NULL COLLATE NOCASE,
  anchor_json TEXT NOT NULL,
  updated_at REAL NOT NULL,
  PRIMARY KEY (library_id, book_id, format)
);
CREATE INDEX IF NOT EXISTS idx_reading_progress_library_id
  ON reading_progress(library_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_book_id
  ON reading_progress(book_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_format
  ON reading_progress(format);
";

/// 应用数据目录下的 `my-reader.db`（MyReader 本地数据，未来可扩展多表；阅读进度见表 `reading_progress`）。
pub fn open_db(app: &AppHandle) -> Result<Connection, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Config(e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(AppError::Io)?;
    let path = dir.join("my-reader.db");
    let conn = Connection::open(&path).map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute_batch(SCHEMA)
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(conn)
}

/// 按书库 id、书籍 id、格式读取一条进度；`format` 大小写不敏感。
pub fn get_progress(
    conn: &Connection,
    library_id: &str,
    book_id: i64,
    format: &str,
) -> Result<Option<ReadingProgressDto>, AppError> {
    let fmt = format.to_uppercase();
    log::debug!(
        target: "my_reader::reading_progress",
        "get_progress request library_id={library_id} book_id={book_id} format={fmt}"
    );
    let row = conn.query_row(
        "SELECT anchor_json, updated_at FROM reading_progress \
         WHERE library_id = ?1 AND book_id = ?2 AND format = ?3",
        rusqlite::params![library_id, book_id, fmt],
        |row| {
            let j: String = row.get(0)?;
            let u: f64 = row.get(1)?;
            Ok((j, u))
        },
    );
    let (s, updated_at) = match row {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            log::debug!(
                target: "my_reader::reading_progress",
                "get_progress no_row library_id={library_id} book_id={book_id} format={fmt}"
            );
            return Ok(None);
        }
        Err(e) => {
            log::warn!(
                target: "my_reader::reading_progress",
                "get_progress query_failed library_id={library_id} book_id={book_id} format={fmt} err={e}"
            );
            return Err(AppError::Database(e.to_string()));
        }
    };

    let anchor: BookAnchor =
        serde_json::from_str(&s).map_err(|e| AppError::Serialize(e.to_string()))?;

    log::debug!(
        target: "my_reader::reading_progress",
        "get_progress hit updated_at={updated_at} chapter_index={} char_offset={:?} anchor_json_len={}",
        anchor.chapter_index,
        anchor.char_offset,
        s.len(),
    );

    Ok(Some(ReadingProgressDto {
        library_id: library_id.to_string(),
        book_id,
        format: fmt,
        anchor,
        updated_at,
    }))
}

/// `INSERT OR REPLACE`，主键为 (library_id, book_id, format)。
pub fn set_progress(
    conn: &Connection,
    library_id: &str,
    book_id: i64,
    format: &str,
    anchor: &BookAnchor,
    updated_at: f64,
) -> Result<(), AppError> {
    let fmt = format.to_uppercase();
    let json =
        serde_json::to_string(anchor).map_err(|e| AppError::Serialize(e.to_string()))?;
    log::debug!(
        target: "my_reader::reading_progress",
        "set_progress write library_id={library_id} book_id={book_id} format={fmt} updated_at={updated_at} chapter_index={} char_offset={:?} json_len={}",
        anchor.chapter_index,
        anchor.char_offset,
        json.len(),
    );
    conn.execute(
        "INSERT OR REPLACE INTO reading_progress \
         (library_id, book_id, format, anchor_json, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![library_id, book_id, fmt, json, updated_at],
    )
    .map_err(|e| {
        log::warn!(
            target: "my_reader::reading_progress",
            "set_progress write_failed library_id={library_id} book_id={book_id} format={fmt} err={e}"
        );
        AppError::Database(e.to_string())
    })?;
    log::debug!(
        target: "my_reader::reading_progress",
        "set_progress ok library_id={library_id} book_id={book_id} format={fmt}"
    );
    Ok(())
}
