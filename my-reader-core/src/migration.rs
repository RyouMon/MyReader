use sea_orm::ConnectionTrait;
use sea_orm_migration::{
    async_trait::async_trait, DbErr, MigrationName, MigrationTrait, MigratorTrait, SchemaManager,
};

#[derive(Clone, Copy)]
pub(crate) struct LegacyMigrationSpec {
    pub name: &'static str,
    pub drizzle_timestamp_ms: i64,
    pub sql: &'static str,
}

macro_rules! legacy_migration {
    ($name:literal, $timestamp:literal) => {
        LegacyMigrationSpec {
            name: $name,
            drizzle_timestamp_ms: $timestamp,
            sql: include_str!(concat!("../migrations/legacy/", $name, ".sql")),
        }
    };
}

pub(crate) const LEGACY_MIGRATIONS: &[LegacyMigrationSpec] = &[
    legacy_migration!("0000_initial", 1_779_021_476_646),
    legacy_migration!("0001_add_book_reading_format", 1_780_000_000_000),
    legacy_migration!("0002_add_favorite_books", 1_780_000_000_001),
    legacy_migration!("0003_add_book_cover_thumbnail_cache", 1_780_000_000_002),
    legacy_migration!("0004_add_bookmarks", 1_783_949_592_104),
    legacy_migration!("0005_add_annotations", 1_784_226_182_903),
    legacy_migration!(
        "0006_add_reading_progress_display_progression",
        1_784_618_458_102
    ),
    legacy_migration!("0007_add_reading_statistics", 1_784_658_006_413),
    legacy_migration!("0008_add_library_sidecar_sync_kernel", 1_784_815_521_994),
    legacy_migration!("0009_add_reading_progress_sync_clock", 1_784_828_886_707),
    legacy_migration!("0010_add_favorite_sync_projection", 1_784_903_303_909),
    legacy_migration!("0011_add_bookmark_sync_projection", 1_784_914_154_044),
    legacy_migration!("0012_add_automerge_sync_storage", 1_784_921_919_652),
    legacy_migration!(
        "0013_add_reading_position_conflict_projection",
        1_784_922_803_193
    ),
    legacy_migration!("0014_remove_legacy_sidecar_sync", 1_784_924_567_219),
    legacy_migration!("0015_remove_hlc_projection_columns", 1_784_925_791_603),
    legacy_migration!("0016_discard_legacy_sync_state", 1_784_927_312_000),
    legacy_migration!("0017_square_toro", 1_785_046_521_990),
    legacy_migration!("0018_add_automerge_recovery", 1_785_304_000_000),
    legacy_migration!("0019_adopt_automerge_repo_storage", 1_785_344_400_000),
];

pub struct LibraryMigrator;

#[async_trait]
impl MigratorTrait for LibraryMigrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        LEGACY_MIGRATIONS
            .iter()
            .copied()
            .map(|spec| Box::new(LegacyMigration(spec)) as Box<dyn MigrationTrait>)
            .collect()
    }
}

struct LegacyMigration(LegacyMigrationSpec);

impl MigrationName for LegacyMigration {
    fn name(&self) -> &str {
        self.0.name
    }
}

#[async_trait]
impl MigrationTrait for LegacyMigration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for statement in self.0.sql.split("--> statement-breakpoint") {
            let statement = statement.trim();
            if statement.is_empty() {
                continue;
            }

            manager
                .get_connection()
                .execute_unprepared(statement)
                .await?;
        }
        Ok(())
    }

    fn use_transaction(&self) -> Option<bool> {
        Some(true)
    }
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database, DbBackend, Statement};

    use super::*;

    async fn applied_versions(db: &sea_orm::DatabaseConnection) -> Vec<String> {
        db.query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT version FROM seaql_migrations ORDER BY version",
        ))
        .await
        .unwrap()
        .into_iter()
        .map(|row| row.try_get::<String>("", "version").unwrap())
        .collect()
    }

    fn migration_names() -> Vec<String> {
        LibraryMigrator::migrations()
            .into_iter()
            .map(|migration| migration.name().to_owned())
            .collect()
    }

    #[tokio::test]
    async fn up_should_record_every_legacy_migration_when_database_is_new() {
        let db = Database::connect("sqlite::memory:").await.unwrap();

        LibraryMigrator::up(&db, None).await.unwrap();

        assert_eq!(applied_versions(&db).await, migration_names());
    }

    #[tokio::test]
    async fn up_should_accept_sync_schedule_migration_when_original_name_was_applied() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        LibraryMigrator::up(&db, Some(17)).await.unwrap();
        db.execute_unprepared(
            "CREATE TABLE sync_schedule_state (
                id TEXT PRIMARY KEY NOT NULL,
                last_successful_pull_at INTEGER,
                next_retry_at INTEGER,
                transient_failure_count INTEGER DEFAULT 0 NOT NULL,
                suspended_reason TEXT
            );
            INSERT INTO seaql_migrations (version, applied_at)
            VALUES ('0017_square_toro', 1785046558);",
        )
        .await
        .unwrap();

        LibraryMigrator::up(&db, None).await.unwrap();

        assert_eq!(applied_versions(&db).await, migration_names());
    }

    #[tokio::test]
    async fn up_should_replace_legacy_sync_storage_when_automerge_repo_layout_is_adopted() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        LibraryMigrator::up(&db, Some(18)).await.unwrap();
        db.execute_unprepared(
            "INSERT INTO sync_local_meta (id, protocol, library_uuid, replica_id)
             VALUES ('legacy', 'library-sidecar-automerge', 'library', 'replica');
             INSERT INTO sync_automerge_changes
               (id, change_hash, actor_id, actor_sequence, bytes, origin, created_at)
             VALUES ('change', 'hash', 'actor', '1', X'00', 'local', 1);",
        )
        .await
        .unwrap();

        LibraryMigrator::up(&db, None).await.unwrap();

        let legacy_table = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM sqlite_master \
                 WHERE type = 'table' AND name = 'sync_automerge_changes'",
            ))
            .await
            .unwrap()
            .unwrap()
            .try_get::<i64>("", "count")
            .unwrap();
        assert_eq!(legacy_table, 0);

        let protocol = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT protocol FROM sync_local_meta LIMIT 1",
            ))
            .await
            .unwrap()
            .unwrap()
            .try_get::<String>("", "protocol")
            .unwrap();
        assert_eq!(protocol, "library-sidecar-automerge-repo");
    }
}
