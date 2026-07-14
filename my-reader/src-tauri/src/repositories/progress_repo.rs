use std::collections::HashMap;

use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, DbBackend, EntityTrait, QueryFilter,
    Statement,
};

use crate::entities::app::reading_progress;
use crate::error::AppError;
use crate::models::ReadingProgressDto;

pub struct SqliteProgressRepository;

impl SqliteProgressRepository {
    pub async fn open(library_path: &str) -> Result<DatabaseConnection, AppError> {
        crate::db::open_db(library_path).await
    }

    pub async fn get_progress(
        db: &DatabaseConnection,
        library_id: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<ReadingProgressDto>, AppError> {
        let model = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(book_id))
            .filter(reading_progress::Column::Format.eq(format))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        match model {
            Some(m) => {
                let locator: serde_json::Value = serde_json::from_str(&m.locator_json)
                    .map_err(|e| AppError::Serialize(e.to_string()))?;
                Ok(Some(ReadingProgressDto {
                    library_id: library_id.to_string(),
                    book_id: m.book_id,
                    format: m.format,
                    locator,
                    updated_at: m.updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn list_all_progress(
        db: &DatabaseConnection,
        library_id: &str,
    ) -> Result<Vec<ReadingProgressDto>, AppError> {
        let rows = reading_progress::Entity::find()
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        rows.into_iter()
            .map(|m| {
                let locator: serde_json::Value = serde_json::from_str(&m.locator_json)
                    .map_err(|e| AppError::Serialize(e.to_string()))?;
                Ok(ReadingProgressDto {
                    library_id: library_id.to_string(),
                    book_id: m.book_id,
                    format: m.format,
                    locator,
                    updated_at: m.updated_at,
                })
            })
            .collect()
    }

    pub async fn set_progress(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_json: &str,
        updated_at: f64,
    ) -> Result<(), AppError> {
        db.execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            r#"
INSERT INTO reading_progress (id, book_id, format, locator_json, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(book_id, format) DO UPDATE SET
    locator_json = excluded.locator_json,
    updated_at = MAX(excluded.updated_at, reading_progress.updated_at + 1.0)
"#,
            vec![
                uuid::Uuid::new_v4().as_simple().to_string().into(),
                book_id.into(),
                format.to_string().into(),
                locator_json.to_string().into(),
                updated_at.into(),
            ],
        ))
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    pub async fn apply_sync_revision(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_json: &str,
        updated_at: f64,
    ) -> Result<bool, AppError> {
        let result = db
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
INSERT INTO reading_progress (id, book_id, format, locator_json, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(book_id, format) DO UPDATE SET
    locator_json = excluded.locator_json,
    updated_at = excluded.updated_at
WHERE
    excluded.updated_at > reading_progress.updated_at
    OR (
        excluded.updated_at = reading_progress.updated_at
        AND excluded.locator_json COLLATE BINARY
            > reading_progress.locator_json COLLATE BINARY
    )
"#,
                vec![
                    uuid::Uuid::new_v4().as_simple().to_string().into(),
                    book_id.into(),
                    format.to_string().into(),
                    locator_json.to_string().into(),
                    updated_at.into(),
                ],
            ))
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn list_latest_book_updates(
        db: &DatabaseConnection,
    ) -> Result<HashMap<i64, f64>, AppError> {
        let rows = reading_progress::Entity::find()
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut latest = HashMap::new();
        for row in rows {
            latest
                .entry(row.book_id)
                .and_modify(|updated_at: &mut f64| {
                    if row.updated_at > *updated_at {
                        *updated_at = row.updated_at;
                    }
                })
                .or_insert(row.updated_at);
        }
        Ok(latest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REMOTE_LOCATOR: &str = r#"{"href":"remote.xhtml"}"#;
    const LOCAL_LOCATOR: &str = r#"{"href":"local.xhtml"}"#;

    async fn open_temp() -> (tempfile::TempDir, DatabaseConnection) {
        let temp = tempfile::tempdir().unwrap();
        let db = SqliteProgressRepository::open(temp.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        (temp, db)
    }

    #[tokio::test]
    async fn local_set_should_advance_from_current_row_when_remote_revision_is_newer() {
        let (_temp, db) = open_temp().await;
        SqliteProgressRepository::apply_sync_revision(&db, 1, "EPUB", REMOTE_LOCATOR, 300.0)
            .await
            .unwrap();

        SqliteProgressRepository::set_progress(&db, 1, "EPUB", LOCAL_LOCATOR, 200.0)
            .await
            .unwrap();

        let model = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(1))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(model.locator_json, LOCAL_LOCATOR);
        assert_eq!(model.updated_at, 301.0);
    }

    #[tokio::test]
    async fn local_and_remote_sets_should_linearize_without_timestamp_regression() {
        let (_temp, db) = open_temp().await;
        let local = SqliteProgressRepository::set_progress(&db, 1, "EPUB", LOCAL_LOCATOR, 200.0);
        let remote =
            SqliteProgressRepository::apply_sync_revision(&db, 1, "EPUB", REMOTE_LOCATOR, 300.0);

        let (local_result, remote_result) = tokio::join!(local, remote);
        local_result.unwrap();
        remote_result.unwrap();
        let model = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(1))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert!(model.updated_at >= 300.0);
        assert!(model.locator_json == REMOTE_LOCATOR || model.locator_json == LOCAL_LOCATOR);
    }
}
