use std::path::{Path, PathBuf};

use sea_orm::{Database, DatabaseConnection};
use sea_orm_migration::MigratorTrait;
use tracing::info;

use crate::constants::path::{MYREADER_LIBRARY_DB_FILE_NAME, MYREADER_LIBRARY_DIR_NAME};
use crate::error::AppError;
use crate::migration::LibraryMigrator;

/// Open and migrate a per-library SQLite database, then return the connection
/// for SeaORM entity queries.
pub async fn open_db(sidecar_root: &str) -> Result<DatabaseConnection, AppError> {
    info!("Start to open library database.");
    let path = library_db_path(sidecar_root)?;
    let url = format!("sqlite://{}?mode=rwc", path.display());

    let db = Database::connect(&url)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    LibraryMigrator::up(&db, None)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    info!(
        "Success to open library database. path: \"{}\"",
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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use sea_orm::{ConnectionTrait, DbBackend, Statement};
    use tokio::{sync::Barrier, task::JoinSet};

    use super::open_db;

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn open_should_succeed_when_library_database_is_opened_concurrently() {
        const OPEN_COUNT: usize = 8;

        let temp = tempfile::tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();
        open_db(&sidecar_root)
            .await
            .expect("initial database open should apply library migrations");

        let barrier = Arc::new(Barrier::new(OPEN_COUNT));
        let mut opens = JoinSet::new();
        for _ in 0..OPEN_COUNT {
            let barrier = Arc::clone(&barrier);
            let sidecar_root = sidecar_root.clone();
            opens.spawn(async move {
                barrier.wait().await;
                open_db(&sidecar_root).await
            });
        }

        let mut errors = Vec::new();
        while let Some(result) = opens.join_next().await {
            match result.expect("database open task should complete") {
                Ok(_) => {}
                Err(error) => errors.push(error.to_string()),
            }
        }

        assert!(errors.is_empty(), "concurrent opens failed: {errors:?}");
    }

    #[tokio::test]
    async fn open_should_use_seaorm_migration_state_when_library_database_is_created() {
        let temp = tempfile::tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();
        let db = open_db(&sidecar_root).await.expect("database should open");

        let applied_count = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM seaql_migrations",
            ))
            .await
            .expect("SeaORM migration state should be readable")
            .expect("migration count should exist")
            .try_get::<i64>("", "count")
            .unwrap();
        assert!(applied_count > 0);

        let drizzle_table_count = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM sqlite_master \
                 WHERE type = 'table' AND name = '__drizzle_migrations'",
            ))
            .await
            .expect("SQLite schema should be readable")
            .expect("table count should exist")
            .try_get::<i64>("", "count")
            .unwrap();
        assert_eq!(drizzle_table_count, 0);
    }

    #[tokio::test]
    async fn bookmarks_schema_should_match_drizzle_migration_when_library_database_is_created() {
        let temp = tempfile::tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();
        let db = open_db(&sidecar_root).await.expect("database should open");

        let columns = db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "PRAGMA table_info('bookmarks')",
            ))
            .await
            .expect("columns should be readable");
        let actual: Vec<(String, String, i64)> = columns
            .into_iter()
            .map(|row| {
                let declared_type: String = row.try_get("", "type").unwrap();
                let column_type = match declared_type.to_ascii_uppercase().as_str() {
                    "DOUBLE" => "REAL".to_string(),
                    _ => declared_type.to_ascii_uppercase(),
                };
                (
                    row.try_get("", "name").unwrap(),
                    column_type,
                    row.try_get("", "notnull").unwrap(),
                )
            })
            .collect();
        assert_eq!(
            actual,
            vec![
                ("id".into(), "TEXT".into(), 1),
                ("book_id".into(), "INTEGER".into(), 1),
                ("format".into(), "TEXT".into(), 1),
                ("locator_key".into(), "TEXT".into(), 1),
                ("locator_json".into(), "TEXT".into(), 1),
                ("created_at".into(), "REAL".into(), 1),
                ("updated_at".into(), "REAL".into(), 1),
                ("deleted_at".into(), "REAL".into(), 0),
            ]
        );

        let indexes = db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "PRAGMA index_list('bookmarks')",
            ))
            .await
            .expect("indexes should be readable");
        let mut actual_indexes: Vec<(String, i64)> = indexes
            .into_iter()
            .filter_map(|row| {
                let name: String = row.try_get("", "name").ok()?;
                (!name.starts_with("sqlite_autoindex_"))
                    .then(|| (name, row.try_get("", "unique").unwrap()))
            })
            .collect();
        actual_indexes.sort();
        assert_eq!(
            actual_indexes,
            vec![
                ("idx_bookmarks_book_format_locator".into(), 1),
                ("idx_bookmarks_updated_at".into(), 0),
            ]
        );

        let unique_columns = db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "PRAGMA index_info('idx_bookmarks_book_format_locator')",
            ))
            .await
            .expect("unique index columns should be readable")
            .into_iter()
            .map(|row| row.try_get::<String>("", "name").unwrap())
            .collect::<Vec<_>>();
        assert_eq!(unique_columns, vec!["book_id", "format", "locator_key"]);

        let updated_at_columns = db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "PRAGMA index_info('idx_bookmarks_updated_at')",
            ))
            .await
            .expect("updated-at index columns should be readable")
            .into_iter()
            .map(|row| row.try_get::<String>("", "name").unwrap())
            .collect::<Vec<_>>();
        assert_eq!(updated_at_columns, vec!["updated_at"]);
    }
}
