use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::LazyLock,
};

use sea_orm::{ConnectionTrait, Database, DatabaseConnection, DbBackend, Statement};
use sea_orm_migration::MigratorTrait;
use tokio::sync::Mutex;
use tracing::info;

use crate::{
    migration::{LibraryMigrator, LEGACY_MIGRATIONS},
    CoreError,
};

const MYREADER_LIBRARY_DIR_NAME: &str = ".myreader";
const MYREADER_LIBRARY_DB_FILE_NAME: &str = "myreader.db";

struct LibraryStore {
    database: DatabaseConnection,
}

static LIBRARY_STORES: LazyLock<Mutex<HashMap<PathBuf, LibraryStore>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Open and migrate a per-library SQLite database, then return the connection
/// for SeaORM entity queries.
pub async fn open_db(sidecar_root: &str) -> Result<DatabaseConnection, CoreError> {
    info!("Start to open library database.");
    let path = library_db_path(sidecar_root)?;
    open_database_file(&path).await
}

pub async fn open_database_file(path: &Path) -> Result<DatabaseConnection, CoreError> {
    let path = absolute_path(path)?;
    let mut stores = LIBRARY_STORES.lock().await;
    if path.exists() {
        if let Some(store) = stores.get(&path) {
            return Ok(store.database.clone());
        }
    } else {
        stores.remove(&path);
    }

    let url = format!("sqlite://{}?mode=rwc", path.display());
    let db = Database::connect(&url).await?;
    migrate_database(&db).await?;
    stores.insert(
        path.clone(),
        LibraryStore {
            database: db.clone(),
        },
    );

    info!(
        "Success to open library database. path: \"{}\"",
        path.display()
    );
    Ok(db)
}

fn absolute_path(path: &Path) -> Result<PathBuf, CoreError> {
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(std::env::current_dir()?.join(path))
    }
}

pub async fn migrate_database_file(path: &Path) -> Result<(), CoreError> {
    open_database_file(path).await.map(|_| ())
}

async fn migrate_database(db: &DatabaseConnection) -> Result<(), CoreError> {
    handoff_drizzle_migrations(db).await?;
    LibraryMigrator::up(db, None).await?;

    if table_exists(db, "__drizzle_migrations").await? {
        db.execute_unprepared("DROP TABLE __drizzle_migrations")
            .await?;
    }
    Ok(())
}

async fn handoff_drizzle_migrations(db: &DatabaseConnection) -> Result<(), CoreError> {
    if table_exists(db, "seaql_migrations").await?
        || !table_exists(db, "__drizzle_migrations").await?
    {
        return Ok(());
    }

    let last_applied_at = db
        .query_one_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT MAX(created_at) AS created_at FROM __drizzle_migrations",
        ))
        .await?
        .and_then(|row| row.try_get::<i64>("", "created_at").ok());

    LibraryMigrator::install(db).await?;
    let Some(last_applied_at) = last_applied_at else {
        return Ok(());
    };

    for migration in LEGACY_MIGRATIONS
        .iter()
        .take_while(|migration| migration.drizzle_timestamp_ms <= last_applied_at)
    {
        db.execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO seaql_migrations (version, applied_at) VALUES (?, ?)",
            [
                migration.name.into(),
                (migration.drizzle_timestamp_ms / 1_000).into(),
            ],
        ))
        .await?;
    }
    Ok(())
}

async fn table_exists(db: &DatabaseConnection, name: &str) -> Result<bool, CoreError> {
    let row = db
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
            [name.into()],
        ))
        .await?
        .ok_or_else(|| CoreError::Database("SQLite schema query returned no row".to_owned()))?;
    Ok(row.try_get::<i64>("", "count")? > 0)
}

pub fn ensure_library_data_dir(sidecar_root: &str) -> Result<PathBuf, CoreError> {
    let dir = Path::new(sidecar_root).join(MYREADER_LIBRARY_DIR_NAME);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub(crate) fn library_db_path(sidecar_root: &str) -> Result<PathBuf, CoreError> {
    Ok(ensure_library_data_dir(sidecar_root)?.join(MYREADER_LIBRARY_DB_FILE_NAME))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use sea_orm::{ConnectionTrait, DbBackend, Statement};
    use sea_orm_migration::MigratorTrait;
    use tokio::{sync::Barrier, task::JoinSet};

    use crate::migration::{LibraryMigrator, LEGACY_MIGRATIONS};

    use super::{migrate_database, open_db};

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
    async fn open_should_recreate_schema_when_cached_database_file_was_removed() {
        let temp = tempfile::tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();
        let database_path = super::library_db_path(&sidecar_root).unwrap();
        let database = open_db(&sidecar_root).await.expect("database should open");
        drop(database);
        std::fs::remove_file(&database_path).expect("database file should be removed");

        let reopened = open_db(&sidecar_root)
            .await
            .expect("removed database should be recreated");
        let table_count = reopened
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM sqlite_master \
                 WHERE type = 'table' AND name = 'sync_local_meta'",
            ))
            .await
            .expect("SQLite schema should be readable")
            .expect("table count should exist")
            .try_get::<i64>("", "count")
            .unwrap();

        assert_eq!(table_count, 1);
    }

    #[tokio::test]
    async fn bookmarks_schema_should_match_legacy_migration_when_library_database_is_created() {
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

    #[tokio::test]
    async fn should_replace_legacy_tables_when_automerge_sync_database_is_created() {
        let temp = tempfile::tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();
        let db = open_db(&sidecar_root).await.expect("database should open");

        let rows = db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT name FROM sqlite_master \
                 WHERE type = 'table' AND name LIKE 'sync_%' ORDER BY name",
            ))
            .await
            .expect("sync tables should be readable");
        let names: Vec<String> = rows
            .into_iter()
            .map(|row| row.try_get("", "name").unwrap())
            .collect();

        for table in [
            "sync_automerge_outbox",
            "sync_automerge_projection_meta",
            "sync_automerge_state",
            "sync_errors",
            "sync_local_meta",
            "sync_schedule_state",
        ] {
            assert!(names.contains(&table.to_owned()));
        }
        for table in [
            "sync_automerge_backups",
            "sync_automerge_changes",
            "sync_automerge_generation",
            "sync_automerge_receipts",
            "sync_cursors",
            "sync_hlc_state",
            "sync_meta",
            "sync_outbox",
            "sync_prepared_segments",
        ] {
            assert!(!names.contains(&table.to_owned()));
        }
    }

    #[tokio::test]
    async fn should_use_text_surrogate_primary_keys_when_sync_database_is_created() {
        let temp = tempfile::tempdir().unwrap();
        let sidecar_root = temp.path().to_string_lossy().to_string();
        let db = open_db(&sidecar_root).await.expect("database should open");

        for table in [
            "sync_automerge_outbox",
            "sync_automerge_projection_meta",
            "sync_automerge_state",
            "sync_errors",
            "sync_local_meta",
            "sync_schedule_state",
        ] {
            let columns = db
                .query_all_raw(Statement::from_string(
                    DbBackend::Sqlite,
                    format!("PRAGMA table_info('{table}')"),
                ))
                .await
                .expect("sync table columns should be readable");
            let id = columns
                .into_iter()
                .find(|row| row.try_get::<String>("", "name").unwrap() == "id")
                .expect("sync table should have an id column");

            assert_eq!(id.try_get::<String>("", "type").unwrap(), "TEXT");
            assert_eq!(id.try_get::<i64>("", "pk").unwrap(), 1);
        }

        for (table, index, expected_column) in [(
            "sync_automerge_outbox",
            "idx_sync_automerge_outbox_storage_key",
            "storage_key_json",
        )] {
            let unique = db
                .query_all_raw(Statement::from_string(
                    DbBackend::Sqlite,
                    format!("PRAGMA index_list('{table}')"),
                ))
                .await
                .expect("sync indexes should be readable")
                .into_iter()
                .find(|row| row.try_get::<String>("", "name").unwrap() == index)
                .expect("sync identity index should exist")
                .try_get::<i64>("", "unique")
                .unwrap();
            let columns = db
                .query_all_raw(Statement::from_string(
                    DbBackend::Sqlite,
                    format!("PRAGMA index_info('{index}')"),
                ))
                .await
                .expect("sync identity index should be readable")
                .into_iter()
                .map(|row| row.try_get::<String>("", "name").unwrap())
                .collect::<Vec<_>>();

            assert_eq!(unique, 1);
            assert_eq!(columns, vec![expected_column]);
        }
    }

    #[tokio::test]
    async fn migrate_should_adopt_drizzle_history_when_mobile_database_already_exists() {
        const LAST_DRIZZLE_MIGRATION_AT: i64 = 1_785_046_521_990;
        let db = sea_orm::Database::connect("sqlite::memory:").await.unwrap();
        for migration in LEGACY_MIGRATIONS
            .iter()
            .take_while(|migration| migration.drizzle_timestamp_ms <= LAST_DRIZZLE_MIGRATION_AT)
        {
            for statement in migration.sql.split("--> statement-breakpoint") {
                let statement = statement.trim();
                if !statement.is_empty() {
                    db.execute_unprepared(statement).await.unwrap();
                }
            }
        }
        db.execute_unprepared(
            "CREATE TABLE __drizzle_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hash TEXT NOT NULL,
                created_at NUMERIC
            );
            INSERT INTO __drizzle_migrations (hash, created_at)
            VALUES ('', 1785046521990);
            INSERT INTO favorite_books
                (id, book_id, added_at)
            VALUES ('favorite', 7, 1);",
        )
        .await
        .unwrap();

        migrate_database(&db).await.unwrap();

        let versions = db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT version FROM seaql_migrations ORDER BY version",
            ))
            .await
            .unwrap();
        assert_eq!(versions.len(), LibraryMigrator::migrations().len());

        let favorite_count = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM favorite_books WHERE book_id = 7",
            ))
            .await
            .unwrap()
            .unwrap()
            .try_get::<i64>("", "count")
            .unwrap();
        assert_eq!(favorite_count, 1);

        let drizzle_table_count = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM sqlite_master
                 WHERE type = 'table' AND name = '__drizzle_migrations'",
            ))
            .await
            .unwrap()
            .unwrap()
            .try_get::<i64>("", "count")
            .unwrap();
        assert_eq!(drizzle_table_count, 0);
    }
}
