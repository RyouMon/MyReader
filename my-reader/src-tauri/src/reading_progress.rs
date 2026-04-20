use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tauri::AppHandle;

use crate::error::AppError;
use crate::models::{BookAnchor, ReadingProgressDto};
use crate::storage_paths::{MYREADER_LIBRARY_DB_FILE_NAME, MYREADER_LIBRARY_DIR_NAME};

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

const LOG_TARGET: &str = "my_reader_lib::reading_progress";

pub fn ensure_library_data_dir(library_path: &str) -> Result<PathBuf, AppError> {
    let dir = Path::new(library_path).join(MYREADER_LIBRARY_DIR_NAME);
    std::fs::create_dir_all(&dir).map_err(AppError::Io)?;
    Ok(dir)
}

fn library_db_path(library_path: &str) -> Result<PathBuf, AppError> {
    Ok(ensure_library_data_dir(library_path)?.join(MYREADER_LIBRARY_DB_FILE_NAME))
}

/// 每个书库根目录下的 `.myreader/myreader.db`（可跨客户端同步的书库级数据）。
pub fn open_db(
    _app: &AppHandle,
    library_path: &str,
    _library_id: &str,
) -> Result<Connection, AppError> {
    log::info!(target: LOG_TARGET, "Start to open reading progress database.");
    let result = (|| {
        let path = library_db_path(library_path)?;
        let conn = Connection::open(&path).map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute_batch(SCHEMA)
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok((conn, path))
    })();

    match result {
        Ok((conn, path)) => {
            log::info!(
                target: LOG_TARGET,
                "Success to open reading progress database. path: \"{}\"",
                path.display()
            );
            Ok(conn)
        }
        Err(err) => {
            log::error!(
                target: LOG_TARGET,
                "Failed to open reading progress database. error: {err}"
            );
            Err(err)
        }
    }
}

/// 按书库 id、书籍 id、格式读取一条进度；`format` 大小写不敏感。
pub fn get_progress(
    conn: &Connection,
    library_id: &str,
    book_id: i64,
    format: &str,
) -> Result<Option<ReadingProgressDto>, AppError> {
    let fmt = format.to_uppercase();
    log::info!(
        target: LOG_TARGET,
        "Start to get reading progress row. library id: \"{library_id}\", book id: {book_id}, format: \"{fmt}\""
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
            log::info!(
                target: LOG_TARGET,
                "Success to get reading progress row. found: false, library id: \"{library_id}\", book id: {book_id}, format: \"{fmt}\""
            );
            return Ok(None);
        }
        Err(e) => {
            log::error!(
                target: LOG_TARGET,
                "Failed to get reading progress row. library id: \"{library_id}\", book id: {book_id}, format: \"{fmt}\", error: {e}"
            );
            return Err(AppError::Database(e.to_string()));
        }
    };

    let anchor: BookAnchor =
        serde_json::from_str(&s).map_err(|e| AppError::Serialize(e.to_string()))?;

    log::info!(
        target: LOG_TARGET,
        "Success to get reading progress row. found: true, updated at: {updated_at}, chapter index: {}, char offset: {:?}, anchor json length: {}",
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
    let json = serde_json::to_string(anchor).map_err(|e| AppError::Serialize(e.to_string()))?;
    log::info!(
        target: LOG_TARGET,
        "Start to set reading progress row. library id: \"{library_id}\", book id: {book_id}, format: \"{fmt}\", updated at: {updated_at}, chapter index: {}, char offset: {:?}, json length: {}",
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
        log::error!(
            target: LOG_TARGET,
            "Failed to set reading progress row. library id: \"{library_id}\", book id: {book_id}, format: \"{fmt}\", error: {e}"
        );
        AppError::Database(e.to_string())
    })?;
    log::info!(
        target: LOG_TARGET,
        "Success to set reading progress row. library id: \"{library_id}\", book id: {book_id}, format: \"{fmt}\""
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{get_progress, set_progress, SCHEMA};
    use crate::models::BookAnchor;

    /// 创建仅用于单元测试的内存数据库连接并初始化 schema。
    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().expect("expected in-memory sqlite");
        conn.execute_batch(SCHEMA)
            .expect("expected reading progress schema to be applied");
        conn
    }

    /// set_progress 与 get_progress 应保持锚点数据一致且格式查询大小写不敏感。
    #[test]
    fn set_and_get_progress_roundtrip() {
        let conn = test_connection();
        let anchor = BookAnchor {
            chapter_index: 8,
            char_offset: Some(256),
            text_snippet: Some("hello".into()),
            text_snippet_after: Some("world".into()),
        };
        set_progress(&conn, "lib-1", 42, "EPUB", &anchor, 1712345678.0)
            .expect("expected set_progress success");

        let loaded = get_progress(&conn, "lib-1", 42, "epub")
            .expect("expected get_progress success")
            .expect("expected existing progress row");

        assert_eq!(loaded.library_id, "lib-1");
        assert_eq!(loaded.book_id, 42);
        assert_eq!(loaded.format, "EPUB");
        assert_eq!(loaded.anchor.chapter_index, 8);
        assert_eq!(loaded.anchor.char_offset, Some(256));
        assert_eq!(loaded.anchor.text_snippet.as_deref(), Some("hello"));
        assert_eq!(loaded.anchor.text_snippet_after.as_deref(), Some("world"));
    }
}
