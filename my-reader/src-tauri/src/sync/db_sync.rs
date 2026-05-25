//! Database sync: abstracted via `SyncProvider` trait.
//!
//! Current default `LwwProvider` uses row-level LWW by `updated_at`.
//! When real CRDT is needed, a `CrsqliteProvider` can be added behind the same trait.
//!
//! Sync payload format (written to `<prefix>/changes/<device>/<seq>.jsonl`):
//! Each line is a JSON object:
//! ```json
//! {"t":"reading_progress","k":{"book_id":1,"format":"EPUB"},
//!  "v":{"locator_json":"..","updated_at":1.72e12}}
//! ```

use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};

use crate::entities::app::{reading_progress, sync_meta};
use crate::error::AppError;
use opendal::Operator;

/// Syncable table spec: key columns + value columns.
pub struct TableSpec {
    pub name: &'static str,
    pub key_columns: &'static [&'static str],
    pub value_columns: &'static [&'static str],
}

/// `reading_progress` table sync spec.
/// library_id is not in key_columns — DB file path already determines library.
pub const READING_PROGRESS_SPEC: TableSpec = TableSpec {
    name: "reading_progress",
    key_columns: &["book_id", "format"],
    value_columns: &["locator_json", "updated_at"],
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRow {
    #[serde(rename = "t")]
    pub table: String,
    #[serde(rename = "k")]
    pub key: serde_json::Map<String, serde_json::Value>,
    #[serde(rename = "v")]
    pub value: serde_json::Map<String, serde_json::Value>,
}

#[async_trait]
pub trait SyncProvider: Send + Sync {
    async fn push_async(
        &self,
        db: &DatabaseConnection,
        op: &Operator,
        device_id: &str,
    ) -> Result<usize, AppError>;

    async fn pull_async(
        &self,
        db: &DatabaseConnection,
        op: &Operator,
        device_id: &str,
    ) -> Result<usize, AppError>;
}

/// LWW (Last-Writer-Wins by `updated_at`) implementation for single-user multi-device.
pub struct LwwProvider {
    pub tables: Vec<TableSpec>,
}

impl LwwProvider {
    pub fn default_for_myreader() -> Self {
        Self {
            tables: vec![READING_PROGRESS_SPEC],
        }
    }

    fn last_push_cursor_key(device: &str) -> String {
        format!("last_push_cursor::{device}")
    }

    fn last_pull_cursor_key(device: &str, remote: &str) -> String {
        format!("last_pull_cursor::{device}::{remote}")
    }

    async fn read_meta(db: &DatabaseConnection, key: &str) -> Result<Option<String>, AppError> {
        let model = sync_meta::Entity::find()
            .filter(sync_meta::Column::Key.eq(key))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(model.map(|m| m.value))
    }

    async fn write_meta(db: &DatabaseConnection, key: &str, value: &str) -> Result<(), AppError> {
        let existing = sync_meta::Entity::find()
            .filter(sync_meta::Column::Key.eq(key))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        if let Some(model) = existing {
            let mut active: sync_meta::ActiveModel = model.into();
            active.value = Set(value.to_string());
            active.update(db).await.map_err(|e| AppError::Database(e.to_string()))?;
        } else {
            let id = uuid::Uuid::new_v4().as_simple().to_string();
            let active = sync_meta::ActiveModel {
                id: Set(id),
                key: Set(key.to_string()),
                value: Set(value.to_string()),
            };
            active.insert(db).await.map_err(|e| AppError::Database(e.to_string()))?;
        }
        Ok(())
    }

    async fn export_rows(
        db: &DatabaseConnection,
        spec: &TableSpec,
        since_ms: f64,
    ) -> Result<Vec<ChangeRow>, AppError> {
        let rows = reading_progress::Entity::find()
            .filter(reading_progress::Column::UpdatedAt.gt(since_ms))
            .order_by_asc(reading_progress::Column::UpdatedAt)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut out = Vec::new();
        for row in &rows {
            let mut key = serde_json::Map::new();
            let mut value = serde_json::Map::new();
            key.insert("book_id".to_string(), serde_json::Value::from(row.book_id));
            key.insert("format".to_string(), serde_json::Value::String(row.format.clone()));
            value.insert(
                "locator_json".to_string(),
                serde_json::Value::String(row.locator_json.clone()),
            );
            value.insert("updated_at".to_string(), serde_json::json!(row.updated_at));
            out.push(ChangeRow {
                table: spec.name.to_string(),
                key,
                value,
            });
        }
        Ok(out)
    }

    async fn apply_row(
        db: &DatabaseConnection,
        spec: &TableSpec,
        change: &ChangeRow,
    ) -> Result<bool, AppError> {
        if change.table != spec.name {
            return Ok(false);
        }

        let incoming_ts = change
            .value
            .get("updated_at")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.0);

        let book_id = change
            .key
            .get("book_id")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let format = change
            .key
            .get("format")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // Check existing updated_at for LWW
        let existing = reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(book_id))
            .filter(reading_progress::Column::Format.eq(format))
            .one(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        if let Some(model) = &existing {
            if model.updated_at >= incoming_ts {
                return Ok(false);
            }
            // Update existing row
            let mut active: reading_progress::ActiveModel = model.clone().into();
            active.locator_json = Set(change.value.get("locator_json").and_then(|v| v.as_str()).unwrap_or("").to_string());
            active.updated_at = Set(incoming_ts);
            active.update(db).await.map_err(|e| AppError::Database(e.to_string()))?;
            return Ok(true);
        }

        // Insert new row
        let locator_json = change
            .value
            .get("locator_json")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let id = uuid::Uuid::new_v4().as_simple().to_string();
        let active = reading_progress::ActiveModel {
            id: Set(id),
            book_id: Set(book_id),
            format: Set(format.to_string()),
            locator_json: Set(locator_json.to_string()),
            updated_at: Set(incoming_ts),
        };
        active.insert(db).await.map_err(|e| AppError::Database(e.to_string()))?;
        Ok(true)
    }
}

#[async_trait]
impl SyncProvider for LwwProvider {
    async fn push_async(
        &self,
        db: &DatabaseConnection,
        op: &Operator,
        device_id: &str,
    ) -> Result<usize, AppError> {
        let cursor_key = Self::last_push_cursor_key(device_id);
        let since_ms: f64 = Self::read_meta(db, &cursor_key)
            .await?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0);

        let mut all = Vec::new();
        let mut max_ts = since_ms;
        for spec in &self.tables {
            let rows = Self::export_rows(db, spec, since_ms).await?;
            for r in &rows {
                if let Some(ts) = r.value.get("updated_at").and_then(|v| v.as_f64()) {
                    if ts > max_ts {
                        max_ts = ts;
                    }
                }
            }
            all.extend(rows);
        }
        if all.is_empty() {
            return Ok(0);
        }

        let mut payload = String::new();
        for row in &all {
            let line = serde_json::to_string(row).map_err(|e| AppError::Serialize(e.to_string()))?;
            payload.push_str(&line);
            payload.push('\n');
        }
        let seq = now_ms();
        let device_dir = format!(".myreader/changes/{device_id}/");
        if let Err(e) = op.create_dir(&device_dir).await {
            tracing::warn!("[db-sync] create_dir {device_dir} failed: {e}");
        }
        let object_path = format!(".myreader/changes/{device_id}/{seq}.jsonl");
        op.write(&object_path, payload.into_bytes())
            .await
            .map_err(|err| AppError::Config(format!("Upload DB changes failed: {err}")))?;

        Self::write_meta(db, &cursor_key, &format!("{max_ts}")).await?;
        Ok(all.len())
    }

    async fn pull_async(
        &self,
        db: &DatabaseConnection,
        op: &Operator,
        device_id: &str,
    ) -> Result<usize, AppError> {
        let device_dirs = match op.list(".myreader/changes/").await {
            Ok(e) => e,
            Err(err) if err.kind() == opendal::ErrorKind::NotFound => return Ok(0),
            Err(err) => {
                return Err(AppError::Config(format!("List .myreader/changes/ failed: {err}")));
            }
        };

        let mut applied = 0usize;

        for dir_entry in device_dirs {
            let dir_path = dir_entry.path().to_string();
            let remote_device = match dir_path
                .strip_prefix(".myreader/changes/")
                .and_then(|s| s.strip_suffix('/'))
            {
                Some(d) if !d.is_empty() && d != device_id => d.to_string(),
                _ => continue,
            };

            let cursor_key = Self::last_pull_cursor_key(device_id, &remote_device);
            let last_seq: i64 = Self::read_meta(db, &cursor_key)
                .await?
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);

            let file_entries = match op.list(&format!(".myreader/changes/{remote_device}/")).await
            {
                Ok(e) => e,
                Err(err) => {
                    tracing::warn!("List .myreader/changes/{remote_device}/ failed: {err}");
                    continue;
                }
            };

            let mut seq_files: Vec<(i64, String)> = file_entries
                .into_iter()
                .filter_map(|e| {
                    let p = e.path().to_string();
                    let prefix = format!(".myreader/changes/{remote_device}/");
                    let name = p.strip_prefix(&prefix)?;
                    let seq: i64 = name.strip_suffix(".jsonl")?.parse().ok()?;
                    if seq <= last_seq {
                        return None;
                    }
                    Some((seq, p))
                })
                .collect();
            seq_files.sort_by_key(|(seq, _)| *seq);

            for (seq, file_path) in seq_files {
                let buf = op
                    .read(&file_path)
                    .await
                    .map_err(|err| AppError::Config(format!("Read {file_path} failed: {err}")))?;
                let bytes = buf.to_vec();
                let text = std::str::from_utf8(&bytes)
                    .map_err(|err| AppError::Serialize(format!("Decode changes failed: {err}")))?;

                for line in text.lines() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let change: ChangeRow = serde_json::from_str(line)
                        .map_err(|err| AppError::Serialize(format!("Parse change failed: {err}")))?;
                    for spec in &self.tables {
                        if Self::apply_row(db, spec, &change).await? {
                            applied += 1;
                            break;
                        }
                    }
                }

                Self::write_meta(db, &cursor_key, &format!("{seq}")).await?;
            }
        }

        Ok(applied)
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}