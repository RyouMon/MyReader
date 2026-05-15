use tracing::{error, info};
use rusqlite::Connection;

use crate::db;
use crate::error::AppError;
use crate::models::ReadingProgressDto;

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
        let conn = db::open_db(library_path)?;
        Ok(Self { conn })
    }

    /// Construct from an existing connection (useful for in-memory tests).
    pub fn from_connection(conn: Connection) -> Result<Self, AppError> {
        db::initialize_schema(&conn)?;
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
        info!(
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
                info!(
                    "Success to get reading progress row. found: false, book id: {book_id}, format: \"{fmt}\""
                );
                return Ok(None);
            }
            Err(e) => {
                error!(
                    "Failed to get reading progress row. book id: {book_id}, format: \"{fmt}\", error: {e}"
                );
                return Err(e.into());
            }
        };

        let locator: serde_json::Value = serde_json::from_str(&s)?;

        info!(
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
        info!(
            "Start to set reading progress row. book id: {book_id}, format: \"{fmt}\", updated at: {updated_at}, json length: {}",
            json.len(),
        );
        self.conn.execute(
            "INSERT OR REPLACE INTO reading_progress \
             (book_id, format, locator_json, updated_at) \
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![book_id, fmt, json, updated_at],
        )?;
        info!(
            "Success to set reading progress row. book id: {book_id}, format: \"{fmt}\""
        );
        Ok(())
    }
}
