use super::{stale, NarrationRepository};
use crate::{
    models::{BookEntry, BookNarrationSettings, NarrationMergeSource},
    CoreError,
};
use sea_orm::{ConnectionTrait, DbBackend, Statement, TransactionTrait};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub(super) async fn read_settings(
    db: &impl ConnectionTrait,
    book_id: i64,
) -> Result<BookNarrationSettings, CoreError> {
    let row = db.query_one_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
        "SELECT s.settings_json FROM narration_books b JOIN narration_scopes s ON s.id = b.scope_id WHERE b.book_id = ?",
        [book_id.into()])).await?;
    let mut settings = match row {
        Some(row) => serde_json::from_str(&row.try_get::<String>("", "settings_json")?)?,
        None => BookNarrationSettings::new(book_id),
    };
    settings.book_id = book_id;
    settings.merge_sources = db
        .query_all_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT source_json FROM narration_merge_sources WHERE scope_id = ? ORDER BY source_id",
            [settings.scope_id.clone().into()],
        ))
        .await?
        .into_iter()
        .map(|row| {
            Ok(serde_json::from_str(
                &row.try_get::<String>("", "source_json")?,
            )?)
        })
        .collect::<Result<_, CoreError>>()?;
    Ok(settings)
}

async fn write_scope(
    db: &impl ConnectionTrait,
    settings: &BookNarrationSettings,
) -> Result<(), CoreError> {
    let mut stored = settings.clone();
    stored.merge_sources.clear();
    db.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
        "INSERT INTO narration_scopes(id, revision, settings_json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, settings_json = excluded.settings_json",
        vec![stored.scope_id.clone().into(), stored.revision.into(), serde_json::to_string(&stored)?.into()])).await?;
    Ok(())
}

async fn bind_book(
    db: &impl ConnectionTrait,
    book_id: i64,
    scope: &str,
    series: Option<&str>,
) -> Result<(), CoreError> {
    db.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
        "INSERT INTO narration_books(book_id, scope_id, series_name) VALUES (?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET scope_id = excluded.scope_id, series_name = excluded.series_name",
        vec![book_id.into(), scope.into(), series.map(str::to_owned).into()])).await?;
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "UPDATE narration_sessions SET epoch = epoch + 1 WHERE book_id = ?",
        [book_id.into()],
    ))
    .await?;
    Ok(())
}

async fn add_source(
    db: &impl ConnectionTrait,
    scope: &str,
    source: &NarrationMergeSource,
) -> Result<bool, CoreError> {
    if scope == source.scope_id {
        return Ok(false);
    }
    let result = db.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
        "INSERT OR IGNORE INTO narration_merge_sources(scope_id, source_id, source_json) VALUES (?, ?, ?)",
        vec![scope.into(), source.scope_id.clone().into(), serde_json::to_string(source)?.into()])).await?;
    Ok(result.rows_affected() == 1)
}

impl NarrationRepository<'_> {
    pub(crate) async fn resolve_scope(
        &self,
        book: &BookEntry,
        members: &[BookEntry],
    ) -> Result<BookNarrationSettings, CoreError> {
        let Some(series) = book
            .series
            .as_deref()
            .filter(|name| !name.trim().is_empty())
        else {
            return self.detach_series(book.id).await;
        };
        let scope = format!("series:{:x}", Sha256::digest(series.as_bytes()));
        let transaction = self.db.begin().await?;
        let existing = transaction
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT settings_json FROM narration_scopes WHERE id = ?",
                [scope.clone().into()],
            ))
            .await?;
        let mut target: BookNarrationSettings = match &existing {
            Some(row) => serde_json::from_str(&row.try_get::<String>("", "settings_json")?)?,
            None => BookNarrationSettings::new(book.id),
        };
        let mut pending = Vec::new();
        let mut bindings = Vec::new();
        let mut sorted: Vec<_> = members.iter().collect();
        sorted.sort_by_key(|member| member.id);
        for member in sorted {
            let current = read_settings(&transaction, member.id).await?;
            if current.scope_id == scope {
                continue;
            }
            if current.revision > 0 {
                if existing.is_none() && target.revision == 0 {
                    target = current.clone();
                } else if current.characters != target.characters {
                    pending.push(NarrationMergeSource {
                        scope_id: current.scope_id.clone(),
                        title: current
                            .scope_name
                            .clone()
                            .unwrap_or_else(|| member.title.clone()),
                        characters: current.characters.clone(),
                    });
                }
                pending.extend(current.merge_sources);
            }
            bindings.push(member.id);
        }
        target.scope_id = scope.clone();
        target.scope_name = Some(series.to_owned());
        target.merge_sources.clear();
        if existing.is_none() {
            target.revision = target.revision.saturating_add(1);
            write_scope(&transaction, &target).await?;
        }
        let mut changed = false;
        for source in pending {
            changed |= add_source(&transaction, &scope, &source).await?;
        }
        if changed {
            target.revision = target.revision.saturating_add(1);
            write_scope(&transaction, &target).await?;
            transaction.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
                "UPDATE narration_sessions SET epoch = epoch + 1 WHERE book_id IN (SELECT book_id FROM narration_books WHERE scope_id = ?)",
                [scope.clone().into()])).await?;
        }
        for book_id in bindings {
            bind_book(&transaction, book_id, &scope, Some(series)).await?;
        }
        let settings = read_settings(&transaction, book.id).await?;
        transaction.commit().await?;
        Ok(settings)
    }

    async fn detach_series(&self, book_id: i64) -> Result<BookNarrationSettings, CoreError> {
        let transaction = self.db.begin().await?;
        let mut settings = read_settings(&transaction, book_id).await?;
        let binding = transaction
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT series_name FROM narration_books WHERE book_id = ?",
                [book_id.into()],
            ))
            .await?;
        if binding.is_some_and(|row| {
            row.try_get::<Option<String>>("", "series_name")
                .ok()
                .flatten()
                .is_some()
        }) {
            settings.scope_id = format!("book:{book_id}:{}", Uuid::new_v4());
            settings.scope_name = None;
            settings.revision = settings.revision.saturating_add(1);
            write_scope(&transaction, &settings).await?;
            for source in &settings.merge_sources {
                add_source(&transaction, &settings.scope_id, source).await?;
            }
            bind_book(&transaction, book_id, &settings.scope_id, None).await?;
        }
        transaction.commit().await?;
        Ok(settings)
    }

    pub(crate) async fn store_settings(
        &self,
        settings: &BookNarrationSettings,
        expected: u32,
        merged_source: Option<&str>,
    ) -> Result<(), CoreError> {
        let transaction = self.db.begin().await?;
        let current = read_settings(&transaction, settings.book_id).await?;
        if current.scope_id != settings.scope_id || current.revision != expected {
            return Err(stale());
        }
        write_scope(&transaction, settings).await?;
        transaction
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT OR IGNORE INTO narration_books(book_id, scope_id) VALUES (?, ?)",
                vec![settings.book_id.into(), settings.scope_id.clone().into()],
            ))
            .await?;
        if let Some(source) = merged_source {
            let result = transaction
                .execute_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "DELETE FROM narration_merge_sources WHERE scope_id = ? AND source_id = ?",
                    vec![settings.scope_id.clone().into(), source.into()],
                ))
                .await?;
            if result.rows_affected() != 1 {
                return Err(stale());
            }
        }
        transaction.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "UPDATE narration_sessions SET epoch = epoch + 1 WHERE book_id IN (SELECT book_id FROM narration_books WHERE scope_id = ?)",
            [settings.scope_id.clone().into()])).await?;
        transaction.commit().await?;
        Ok(())
    }
}
