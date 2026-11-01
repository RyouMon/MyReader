use super::NarrationRepository;
use crate::{
    models::{BookNarrationSettings, NarrationMergeSource, RemovedTtsSelection},
    CoreError,
};
use sea_orm::{ConnectionTrait, DbBackend, Statement, TransactionTrait};

impl NarrationRepository<'_> {
    pub(crate) async fn tts_settings(&self) -> Result<Vec<BookNarrationSettings>, CoreError> {
        let rows = self.db.query_all_raw(Statement::from_string(DbBackend::Sqlite,
            "SELECT s.settings_json, MIN(b.book_id) AS book_id, MAX(c.title) AS book_title FROM narration_scopes s JOIN narration_books b ON b.scope_id = s.id LEFT JOIN books c ON c.id = b.book_id GROUP BY s.id ORDER BY s.id".to_owned())).await?;
        let mut settings = Vec::new();
        for row in rows {
            let mut value: BookNarrationSettings =
                serde_json::from_str(&row.try_get::<String>("", "settings_json")?)?;
            value.book_id = row.try_get("", "book_id")?;
            value.scope_name = value.scope_name.or(row.try_get("", "book_title")?);
            value.merge_sources = super::scopes::read_settings(self.db, value.book_id)
                .await?
                .merge_sources;
            settings.push(value);
        }
        Ok(settings)
    }

    pub(crate) async fn reset_tts_references(
        &self,
        removed: &[RemovedTtsSelection],
    ) -> Result<(), CoreError> {
        let transaction = self.db.begin().await?;
        // Include detached scopes so a later series merge cannot restore a deleted binding.
        let rows = transaction
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT settings_json FROM narration_scopes".to_owned(),
            ))
            .await?;
        for row in rows {
            let mut settings: BookNarrationSettings =
                serde_json::from_str(&row.try_get::<String>("", "settings_json")?)?;
            if reset_characters(&mut settings.characters, removed) {
                settings.revision = settings.revision.saturating_add(1);
                super::scopes::write_scope(&transaction, &settings).await?;
                transaction.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
                    "UPDATE narration_sessions SET epoch = epoch + 1 WHERE book_id IN (SELECT book_id FROM narration_books WHERE scope_id = ?)",
                    [settings.scope_id.into()])).await?;
            }
        }
        let sources = transaction
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT scope_id, source_id, source_json FROM narration_merge_sources".to_owned(),
            ))
            .await?;
        for row in sources {
            let mut source: NarrationMergeSource =
                serde_json::from_str(&row.try_get::<String>("", "source_json")?)?;
            if reset_characters(&mut source.characters, removed) {
                transaction.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
                    "UPDATE narration_merge_sources SET source_json = ? WHERE scope_id = ? AND source_id = ?",
                    vec![serde_json::to_string(&source)?.into(), row.try_get::<String>("", "scope_id")?.into(), row.try_get::<String>("", "source_id")?.into()])).await?;
            }
        }
        transaction.commit().await?;
        Ok(())
    }
}

fn reset_characters(
    characters: &mut [crate::models::BookCharacter],
    removed: &[RemovedTtsSelection],
) -> bool {
    let mut changed = false;
    for character in characters {
        if character
            .voice
            .as_ref()
            .is_some_and(|voice| removed.iter().any(|item| item.matches(voice)))
        {
            character.voice = None;
            changed = true;
        }
    }
    changed
}
