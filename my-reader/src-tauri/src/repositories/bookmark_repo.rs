use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, DbBackend, EntityTrait, FromQueryResult,
    QueryFilter, QueryOrder, Statement,
};

use crate::entities::app::bookmarks;
use crate::error::AppError;

pub struct SqliteBookmarkRepository;

impl SqliteBookmarkRepository {
    pub async fn open(library_path: &str) -> Result<DatabaseConnection, AppError> {
        crate::db::open_db(library_path).await
    }

    pub async fn list(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
    ) -> Result<Vec<bookmarks::Model>, AppError> {
        bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(book_id))
            .filter(bookmarks::Column::Format.eq(format))
            .filter(bookmarks::Column::DeletedAt.is_null())
            .order_by_asc(bookmarks::Column::CreatedAt)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub async fn upsert(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_key: &str,
        locator_json: &str,
        now: f64,
    ) -> Result<bookmarks::Model, AppError> {
        let id = uuid::Uuid::new_v4().as_simple().to_string();
        let row = db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
INSERT INTO bookmarks (
    id, book_id, format, locator_key, locator_json, created_at, updated_at, deleted_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
ON CONFLICT(book_id, format, locator_key) DO UPDATE SET
    locator_json = excluded.locator_json,
    updated_at = MAX(excluded.updated_at, bookmarks.updated_at + 1.0),
    deleted_at = NULL
RETURNING id, book_id, format, locator_key, locator_json, created_at, updated_at, deleted_at
"#,
                vec![
                    id.into(),
                    book_id.into(),
                    format.to_string().into(),
                    locator_key.to_string().into(),
                    locator_json.to_string().into(),
                    now.into(),
                    now.into(),
                ],
            ))
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        let row =
            row.ok_or_else(|| AppError::Database("Bookmark upsert returned no row".into()))?;
        bookmarks::Model::from_query_result(&row, "").map_err(|e| AppError::Database(e.to_string()))
    }

    pub async fn tombstone(
        db: &DatabaseConnection,
        book_id: i64,
        format: &str,
        locator_key: &str,
        now: f64,
    ) -> Result<bool, AppError> {
        let row = db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
UPDATE bookmarks
SET
    updated_at = CASE
        WHEN deleted_at IS NULL THEN MAX(?, updated_at + 1.0)
        ELSE updated_at
    END,
    deleted_at = CASE
        WHEN deleted_at IS NULL THEN MAX(?, updated_at + 1.0)
        ELSE deleted_at
    END
WHERE book_id = ? AND format = ? AND locator_key = ?
RETURNING id
"#,
                vec![
                    now.into(),
                    now.into(),
                    book_id.into(),
                    format.to_string().into(),
                    locator_key.to_string().into(),
                ],
            ))
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(row.is_some())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn apply_sync_revision(
        db: &DatabaseConnection,
        id: &str,
        book_id: i64,
        format: &str,
        locator_key: &str,
        locator_json: &str,
        created_at: f64,
        updated_at: f64,
        deleted_at: Option<f64>,
    ) -> Result<bool, AppError> {
        // Equal timestamps converge on the greatest tuple:
        // [is_deleted, id, locator_json, created_at, deleted_at_or_-1].
        // Explicit BINARY collation keeps string ordering byte-stable across SQLite clients.
        let result = db
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                r#"
INSERT INTO bookmarks (
    id, book_id, format, locator_key, locator_json, created_at, updated_at, deleted_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(book_id, format, locator_key) DO UPDATE SET
    id = excluded.id,
    locator_json = excluded.locator_json,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at
WHERE
    excluded.updated_at > bookmarks.updated_at
    OR (
        excluded.updated_at = bookmarks.updated_at
        AND (
            (excluded.deleted_at IS NOT NULL AND bookmarks.deleted_at IS NULL)
            OR (
                (excluded.deleted_at IS NULL) = (bookmarks.deleted_at IS NULL)
                AND (
                    excluded.id COLLATE BINARY > bookmarks.id COLLATE BINARY
                    OR (
                        excluded.id = bookmarks.id
                        AND excluded.locator_json COLLATE BINARY
                            > bookmarks.locator_json COLLATE BINARY
                    )
                    OR (
                        excluded.id = bookmarks.id
                        AND excluded.locator_json = bookmarks.locator_json
                        AND excluded.created_at > bookmarks.created_at
                    )
                    OR (
                        excluded.id = bookmarks.id
                        AND excluded.locator_json = bookmarks.locator_json
                        AND excluded.created_at = bookmarks.created_at
                        AND COALESCE(excluded.deleted_at, -1.0)
                            > COALESCE(bookmarks.deleted_at, -1.0)
                    )
                )
            )
        )
    )
"#,
                vec![
                    id.to_string().into(),
                    book_id.into(),
                    format.to_string().into(),
                    locator_key.to_string().into(),
                    locator_json.to_string().into(),
                    created_at.into(),
                    updated_at.into(),
                    deleted_at.into(),
                ],
            ))
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(result.rows_affected() > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REMOTE_LOCATOR: &str = r#"{"href":"remote.xhtml","type":"application/xhtml+xml"}"#;
    const LOCAL_LOCATOR: &str = r#"{"href":"local.xhtml","type":"application/xhtml+xml"}"#;

    async fn open_temp() -> (tempfile::TempDir, DatabaseConnection) {
        let temp = tempfile::tempdir().unwrap();
        let db = SqliteBookmarkRepository::open(temp.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        (temp, db)
    }

    #[tokio::test]
    async fn local_upsert_should_advance_from_current_row_when_remote_revision_is_newer() {
        let (_temp, db) = open_temp().await;
        SqliteBookmarkRepository::apply_sync_revision(
            &db,
            "remote-id",
            1,
            "EPUB",
            "chapter",
            REMOTE_LOCATOR,
            50.0,
            500.0,
            Some(500.0),
        )
        .await
        .unwrap();

        let revived =
            SqliteBookmarkRepository::upsert(&db, 1, "EPUB", "chapter", LOCAL_LOCATOR, 100.0)
                .await
                .unwrap();

        assert_eq!(revived.id, "remote-id");
        assert_eq!(revived.locator_json, LOCAL_LOCATOR);
        assert_eq!(revived.updated_at, 501.0);
        assert_eq!(revived.deleted_at, None);
    }

    #[tokio::test]
    async fn local_tombstone_should_advance_once_from_current_row_when_remote_revision_is_newer() {
        let (_temp, db) = open_temp().await;
        SqliteBookmarkRepository::apply_sync_revision(
            &db,
            "remote-id",
            1,
            "EPUB",
            "chapter",
            REMOTE_LOCATOR,
            50.0,
            500.0,
            None,
        )
        .await
        .unwrap();

        assert!(
            SqliteBookmarkRepository::tombstone(&db, 1, "EPUB", "chapter", 100.0)
                .await
                .unwrap()
        );
        assert!(
            SqliteBookmarkRepository::tombstone(&db, 1, "EPUB", "chapter", 900.0)
                .await
                .unwrap()
        );

        let model = bookmarks::Entity::find_by_id("remote-id")
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(model.updated_at, 501.0);
        assert_eq!(model.deleted_at, Some(501.0));
    }

    #[tokio::test]
    async fn local_and_remote_upserts_should_linearize_without_timestamp_regression() {
        let (_temp, db) = open_temp().await;
        let local =
            SqliteBookmarkRepository::upsert(&db, 1, "EPUB", "chapter", LOCAL_LOCATOR, 100.0);
        let remote = SqliteBookmarkRepository::apply_sync_revision(
            &db,
            "remote-id",
            1,
            "EPUB",
            "chapter",
            REMOTE_LOCATOR,
            50.0,
            1_000.0,
            None,
        );

        let (local_result, remote_result) = tokio::join!(local, remote);
        local_result.unwrap();
        remote_result.unwrap();
        let model = bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(1))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert!(model.updated_at >= 1_000.0);
        assert!(model.locator_json == REMOTE_LOCATOR || model.locator_json == LOCAL_LOCATOR);
    }
}
