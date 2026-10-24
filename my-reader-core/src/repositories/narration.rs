use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement, TransactionTrait};
use uuid::Uuid;

use crate::{
    models::{BookNarrationSettings, NarrationPlan, NarrationRequest},
    CoreError,
};

pub(crate) struct NarrationRepository<'a> {
    db: &'a DatabaseConnection,
}

pub(crate) struct Session {
    pub id: String,
    pub epoch: i64,
}

pub(crate) struct HistoryEntry {
    pub seq: i64,
    pub position: f64,
    pub request: NarrationRequest,
    pub plan: NarrationPlan,
}

pub(crate) struct Checkpoint {
    pub through_seq: i64,
    pub position: f64,
    pub summary: String,
}

impl<'a> NarrationRepository<'a> {
    pub(crate) fn new(db: &'a DatabaseConnection) -> Self {
        Self { db }
    }

    pub(crate) async fn settings(&self, book_id: i64) -> Result<BookNarrationSettings, CoreError> {
        let row = self
            .db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT settings_json FROM book_narration WHERE book_id = ?",
                [book_id.into()],
            ))
            .await?;
        match row {
            Some(row) => Ok(serde_json::from_str(
                &row.try_get::<String>("", "settings_json")?,
            )?),
            None => Ok(BookNarrationSettings::new(book_id)),
        }
    }

    pub(crate) async fn save_settings(
        &self,
        settings: &BookNarrationSettings,
        expected: u32,
    ) -> Result<(), CoreError> {
        let result = self.db.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "INSERT INTO book_narration(book_id, revision, settings_json) VALUES (?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET revision = excluded.revision, settings_json = excluded.settings_json WHERE book_narration.revision = ?",
            vec![settings.book_id.into(), settings.revision.into(), serde_json::to_string(settings)?.into(), expected.into()])).await?;
        if result.rows_affected() != 1 {
            return Err(stale());
        }
        Ok(())
    }

    pub(crate) async fn session(&self, book_id: i64, version: &str) -> Result<Session, CoreError> {
        self.db.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "INSERT OR IGNORE INTO narration_sessions(id, book_id, content_version) VALUES (?, ?, ?)",
            vec![Uuid::new_v4().to_string().into(), book_id.into(), version.into()])).await?;
        let row = self.db.query_one_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "SELECT id, epoch FROM narration_sessions WHERE book_id = ? AND content_version = ?",
            vec![book_id.into(), version.into()])).await?.ok_or_else(stale)?;
        Ok(Session {
            id: row.try_get("", "id")?,
            epoch: row.try_get("", "epoch")?,
        })
    }

    pub(crate) async fn invalidate(&self, book_id: i64) -> Result<(), CoreError> {
        self.db
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "UPDATE narration_sessions SET epoch = epoch + 1 WHERE book_id = ?",
                [book_id.into()],
            ))
            .await?;
        Ok(())
    }

    pub(crate) async fn cached(
        &self,
        session: &Session,
        key: &str,
    ) -> Result<Option<NarrationPlan>, CoreError> {
        self.db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "SELECT plan_json FROM narration_entries WHERE session_id = ? AND cache_key = ?",
                vec![session.id.clone().into(), key.into()],
            ))
            .await?
            .map(|row| {
                Ok(serde_json::from_str(
                    &row.try_get::<String>("", "plan_json")?,
                )?)
            })
            .transpose()
    }

    pub(crate) async fn checkpoint(
        &self,
        session: &Session,
        position: f64,
        identity_revision: u32,
    ) -> Result<Checkpoint, CoreError> {
        let row = self.db.query_one_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "SELECT through_seq, position, summary FROM narration_checkpoints WHERE session_id = ? AND position < ? AND identity_revision = ? ORDER BY position DESC, through_seq DESC LIMIT 1",
            vec![session.id.clone().into(), position.into(), identity_revision.into()])).await?;
        match row {
            Some(row) => Ok(Checkpoint {
                through_seq: row.try_get("", "through_seq")?,
                position: row.try_get("", "position")?,
                summary: row.try_get("", "summary")?,
            }),
            None => Ok(Checkpoint {
                through_seq: 0,
                position: -1.0,
                summary: String::new(),
            }),
        }
    }

    pub(crate) async fn history(
        &self,
        session: &Session,
        position: f64,
        after: i64,
        after_position: f64,
        identity_revision: u32,
    ) -> Result<Vec<HistoryEntry>, CoreError> {
        let rows = self.db.query_all_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "SELECT seq, position, request_json, plan_json FROM narration_entries WHERE session_id = ? AND (seq > ? OR position > ?) AND position < ? AND identity_revision = ? ORDER BY position DESC, seq DESC LIMIT 64",
            vec![session.id.clone().into(), after.into(), after_position.into(), position.into(), identity_revision.into()])).await?;
        let mut entries: Vec<HistoryEntry> = rows
            .into_iter()
            .map(|row| {
                Ok(HistoryEntry {
                    seq: row.try_get("", "seq")?,
                    position: row.try_get("", "position")?,
                    request: serde_json::from_str(&row.try_get::<String>("", "request_json")?)?,
                    plan: serde_json::from_str(&row.try_get::<String>("", "plan_json")?)?,
                })
            })
            .collect::<Result<_, CoreError>>()?;
        entries.reverse();
        Ok(entries)
    }

    pub(crate) async fn commit(
        &self,
        session: &Session,
        settings: &BookNarrationSettings,
        key: &str,
        request: &NarrationRequest,
        plan: &NarrationPlan,
        checkpoint: Option<(i64, f64, String)>,
    ) -> Result<(), CoreError> {
        let transaction = self.db.begin().await?;
        let current = transaction.query_one_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "SELECT s.epoch, b.settings_json FROM narration_sessions s JOIN book_narration b ON b.book_id = s.book_id WHERE s.id = ?",
            [session.id.clone().into()])).await?.ok_or_else(stale)?;
        let saved: BookNarrationSettings =
            serde_json::from_str(&current.try_get::<String>("", "settings_json")?)?;
        if current.try_get::<i64>("", "epoch")? != session.epoch
            || !saved.enabled
            || saved.identity_revision != settings.identity_revision
        {
            return Err(stale());
        }
        transaction.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "INSERT OR IGNORE INTO narration_entries(session_id, seq, cache_key, identity_revision, position, source_key, request_json, plan_json) SELECT ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ?, ? FROM narration_entries WHERE session_id = ?",
            vec![session.id.clone().into(), key.into(), settings.identity_revision.into(), request.position.into(), request.source_key.clone().into(), serde_json::to_string(request)?.into(), serde_json::to_string(plan)?.into(), session.id.clone().into()])).await?;
        if let Some((seq, position, summary)) = checkpoint {
            transaction.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
                "INSERT OR REPLACE INTO narration_checkpoints(session_id, through_seq, position, identity_revision, summary) VALUES (?, ?, ?, ?, ?)",
                vec![session.id.clone().into(), seq.into(), position.into(), settings.identity_revision.into(), summary.into()])).await?;
        }
        transaction.commit().await?;
        Ok(())
    }
}

fn stale() -> CoreError {
    CoreError::Config("NARRATION_STALE_REQUEST".into())
}
