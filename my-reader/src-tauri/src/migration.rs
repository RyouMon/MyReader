use sea_orm::ConnectionTrait;
use sea_orm_migration::{
    async_trait::async_trait, DbErr, MigrationName, MigrationTrait, MigratorTrait, SchemaManager,
};

pub struct LibraryMigrator;

#[async_trait]
impl MigratorTrait for LibraryMigrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        include!(concat!(env!("OUT_DIR"), "/library_drizzle_migrations.rs"))
    }
}

struct DrizzleMigration {
    name: &'static str,
    sql: &'static str,
}

impl DrizzleMigration {
    const fn new(name: &'static str, sql: &'static str) -> Self {
        Self { name, sql }
    }
}

impl MigrationName for DrizzleMigration {
    fn name(&self) -> &str {
        self.name
    }
}

#[async_trait]
impl MigrationTrait for DrizzleMigration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for statement in self.sql.split("--> statement-breakpoint") {
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
    async fn up_should_record_every_drizzle_migration_when_database_is_new() {
        let db = Database::connect("sqlite::memory:").await.unwrap();

        LibraryMigrator::up(&db, None).await.unwrap();

        assert_eq!(applied_versions(&db).await, migration_names());
    }
}
