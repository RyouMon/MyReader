use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};

use crate::entities::app::file_state;
use crate::error::AppError;

pub struct SqliteFileStateRepository;

impl SqliteFileStateRepository {
    pub async fn open(sidecar_root: &str) -> Result<DatabaseConnection, AppError> {
        crate::db::open_db(sidecar_root).await
    }

    pub async fn get_by_path(
        db: &DatabaseConnection,
        path: &str,
    ) -> Result<Option<file_state::Model>, AppError> {
        file_state::Entity::find()
            .filter(file_state::Column::Path.eq(path))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))
    }

    pub async fn upsert(
        db: &DatabaseConnection,
        path: &str,
        local_state: &str,
        local_size: Option<i64>,
        local_mtime: Option<i64>,
    ) -> Result<(), AppError> {
        let existing = file_state::Entity::find()
            .filter(file_state::Column::Path.eq(path))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0.0, |d| d.as_secs_f64());

        if let Some(model) = existing {
            let mut active: file_state::ActiveModel = model.into();
            active.local_state = Set(local_state.to_string());
            active.local_size = Set(local_size);
            active.local_mtime = Set(local_mtime);
            active.updated_at = Set(updated_at);
            active
                .update(db)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        } else {
            let id = uuid::Uuid::new_v4().as_simple().to_string();
            let active = file_state::ActiveModel {
                id: Set(id),
                path: Set(path.to_string()),
                local_state: Set(local_state.to_string()),
                local_blake3: Set(None),
                local_size: Set(local_size),
                local_mtime: Set(local_mtime),
                updated_at: Set(updated_at),
            };
            active
                .insert(db)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        }
        Ok(())
    }

    pub async fn delete_by_path(db: &DatabaseConnection, path: &str) -> Result<(), AppError> {
        file_state::Entity::delete_many()
            .filter(file_state::Column::Path.eq(path))
            .exec(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    async fn open_temp_db() -> (tempfile::TempDir, DatabaseConnection) {
        let dir = tempdir().unwrap();
        let db = SqliteFileStateRepository::open(dir.path().to_str().unwrap())
            .await
            .expect("open temp db should succeed");
        (dir, db)
    }

    #[tokio::test]
    async fn get_by_path_should_return_none_when_row_does_not_exist() {
        let (_dir, db) = open_temp_db().await;
        let row = SqliteFileStateRepository::get_by_path(&db, "author/book/file.epub")
            .await
            .expect("query should succeed");
        assert!(row.is_none());
    }

    #[tokio::test]
    async fn upsert_should_insert_new_row_when_no_existing_row() {
        let (_dir, db) = open_temp_db().await;
        SqliteFileStateRepository::upsert(
            &db,
            "author/book/file.epub",
            "remote_only",
            Some(1024),
            Some(1234567890),
        )
        .await
        .expect("upsert should succeed");

        let row = SqliteFileStateRepository::get_by_path(&db, "author/book/file.epub")
            .await
            .expect("query should succeed")
            .expect("row should exist");

        assert_eq!(row.path, "author/book/file.epub");
        assert_eq!(row.local_state, "remote_only");
        assert_eq!(row.local_size, Some(1024));
        assert_eq!(row.local_mtime, Some(1234567890));
    }

    #[tokio::test]
    async fn upsert_should_update_existing_row_when_path_already_exists() {
        let (_dir, db) = open_temp_db().await;
        SqliteFileStateRepository::upsert(
            &db,
            "author/book/file.epub",
            "remote_only",
            Some(1024),
            Some(1234567890),
        )
        .await
        .unwrap();

        SqliteFileStateRepository::upsert(
            &db,
            "author/book/file.epub",
            "present",
            Some(2048),
            Some(1234567891),
        )
        .await
        .unwrap();

        let row = SqliteFileStateRepository::get_by_path(&db, "author/book/file.epub")
            .await
            .unwrap()
            .unwrap();

        assert_eq!(row.local_state, "present");
        assert_eq!(row.local_size, Some(2048));
        assert_eq!(row.local_mtime, Some(1234567891));
    }

    #[tokio::test]
    async fn delete_by_path_should_remove_matching_row() {
        let (_dir, db) = open_temp_db().await;
        SqliteFileStateRepository::upsert(
            &db,
            "author/book/file.epub",
            "present",
            Some(1024),
            None,
        )
        .await
        .unwrap();

        SqliteFileStateRepository::delete_by_path(&db, "author/book/file.epub")
            .await
            .unwrap();

        let row = SqliteFileStateRepository::get_by_path(&db, "author/book/file.epub")
            .await
            .unwrap();
        assert!(row.is_none());
    }

    #[tokio::test]
    async fn delete_by_path_should_leave_other_rows_untouched() {
        let (_dir, db) = open_temp_db().await;
        SqliteFileStateRepository::upsert(
            &db,
            "author/book/file.epub",
            "present",
            Some(1024),
            None,
        )
        .await
        .unwrap();
        SqliteFileStateRepository::upsert(
            &db,
            "author/book/other.epub",
            "present",
            Some(2048),
            None,
        )
        .await
        .unwrap();

        SqliteFileStateRepository::delete_by_path(&db, "author/book/file.epub")
            .await
            .unwrap();

        let other = SqliteFileStateRepository::get_by_path(&db, "author/book/other.epub")
            .await
            .unwrap();
        assert!(other.is_some());
    }
}
