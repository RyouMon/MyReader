//! 本地文件三态表：复用现有书库数据库（`.myreader/myreader.db`），避免再引入新库。
//!
//! 三态（外加 `dirty_push` 等中间态）：
//!
//! - `remote_only`：云端 manifest 有条目，本地无文件；UI 显示"下载"
//! - `present`：本地有完整文件且哈希匹配
//! - `local_only`：只在本地有（还未推到云端或 LocalDirect 模式）
//! - `dirty_push`：本地改过，等待上推

use rusqlite::{params, Connection};
use serde::Serialize;
use specta::Type;

use crate::error::AppError;

pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS file_state (
  path          TEXT PRIMARY KEY,
  local_state   TEXT NOT NULL CHECK(local_state IN ('remote_only','present','local_only','dirty_push')),
  local_blake3  TEXT,
  local_size    INTEGER,
  local_mtime   INTEGER,
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_file_state_local_state
  ON file_state(local_state);
";

/// 调用方负责传入已由 `reading_progress::initialize_schema` 初始化过的连接；
/// 本函数只在该连接上追加 `file_state` 表。
pub fn initialize_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(SCHEMA)
        .map_err(|e| AppError::Database(e.to_string()))
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileStateRow {
    pub path: String,
    pub local_state: String,
    pub local_blake3: Option<String>,
    pub local_size: Option<i64>,
    pub local_mtime: Option<i64>,
}

pub fn upsert(
    conn: &Connection,
    path: &str,
    local_state: &str,
    local_blake3: Option<&str>,
    local_size: Option<i64>,
    local_mtime: Option<i64>,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO file_state (path, local_state, local_blake3, local_size, local_mtime, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%s','now'))
         ON CONFLICT(path) DO UPDATE SET
           local_state  = excluded.local_state,
           local_blake3 = excluded.local_blake3,
           local_size   = excluded.local_size,
           local_mtime  = excluded.local_mtime,
           updated_at   = excluded.updated_at",
        params![path, local_state, local_blake3, local_size, local_mtime],
    )
    .map(|_| ())
    .map_err(|e| AppError::Database(e.to_string()))
}

pub fn get(conn: &Connection, path: &str) -> Result<Option<FileStateRow>, AppError> {
    let row = conn.query_row(
        "SELECT path, local_state, local_blake3, local_size, local_mtime
           FROM file_state WHERE path = ?1",
        params![path],
        |row| {
            Ok(FileStateRow {
                path: row.get(0)?,
                local_state: row.get(1)?,
                local_blake3: row.get(2)?,
                local_size: row.get(3)?,
                local_mtime: row.get(4)?,
            })
        },
    );
    match row {
        Ok(r) => Ok(Some(r)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e.to_string())),
    }
}

pub fn list_by_state(conn: &Connection, state: &str) -> Result<Vec<FileStateRow>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT path, local_state, local_blake3, local_size, local_mtime
               FROM file_state WHERE local_state = ?1 ORDER BY path",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    let rows = stmt
        .query_map(params![state], |row| {
            Ok(FileStateRow {
                path: row.get(0)?,
                local_state: row.get(1)?,
                local_blake3: row.get(2)?,
                local_size: row.get(3)?,
                local_mtime: row.get(4)?,
            })
        })
        .map_err(|e| AppError::Database(e.to_string()))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| AppError::Database(e.to_string()))?);
    }
    Ok(out)
}

pub fn delete(conn: &Connection, path: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM file_state WHERE path = ?1", params![path])
        .map(|_| ())
        .map_err(|e| AppError::Database(e.to_string()))
}

pub fn clear(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM file_state", [])
        .map(|_| ())
        .map_err(|e| AppError::Database(e.to_string()))
}
