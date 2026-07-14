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
//! {"t":"bookmarks","k":{"book_id":1,"format":"EPUB","locator_key":"..."},
//!  "v":{"id":"...","locator_json":"..","created_at":1.72e12,
//!       "updated_at":1.72e12,"deleted_at":null}}
//! ```

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicI64, Ordering};

use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};

use crate::entities::app::{bookmarks, reading_progress, sync_meta};
use crate::error::AppError;
use crate::models::is_valid_reader_locator;
use crate::repositories::bookmark_repo::SqliteBookmarkRepository;
use crate::repositories::progress_repo::SqliteProgressRepository;
use opendal::Operator;

static PUSH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static LAST_PUSH_SEQ: AtomicI64 = AtomicI64::new(0);
const FNV1A_128_OFFSET: u128 = 0x6c62272e07bb014262b821756295c58d;
const FNV1A_128_PRIME: u128 = 0x0000000001000000000000000000013b;
const MAX_SAFE_JSON_INTEGER: f64 = 9_007_199_254_740_991.0;

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

/// `bookmarks` table sync spec. Deletions are retained as tombstones so they
/// can propagate through the incremental JSONL stream.
pub const BOOKMARKS_SPEC: TableSpec = TableSpec {
    name: "bookmarks",
    key_columns: &["book_id", "format", "locator_key"],
    value_columns: &[
        "id",
        "locator_json",
        "created_at",
        "updated_at",
        "deleted_at",
    ],
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct PushCursor {
    ts: f64,
    #[serde(default)]
    seen: Vec<String>,
}

impl Default for PushCursor {
    fn default() -> Self {
        Self {
            ts: 0.0,
            seen: Vec::new(),
        }
    }
}

impl PushCursor {
    fn parse(value: Option<&str>) -> Self {
        let Some(value) = value else {
            return Self::default();
        };

        if let Ok(mut cursor) = serde_json::from_str::<Self>(value) {
            if cursor.ts.is_finite() && cursor.ts >= 0.0 {
                cursor.seen.retain(|fingerprint| !fingerprint.is_empty());
                cursor.seen.sort();
                cursor.seen.dedup();
                return cursor;
            }
        }

        value
            .parse::<f64>()
            .ok()
            .filter(|ts| ts.is_finite() && *ts >= 0.0)
            .map(|ts| Self {
                ts,
                seen: Vec::new(),
            })
            .unwrap_or_default()
    }

    fn serialize(&self) -> Result<String, AppError> {
        serde_json::to_string(self).map_err(|e| AppError::Serialize(e.to_string()))
    }
}

fn revision_timestamp(row: &ChangeRow) -> Result<f64, AppError> {
    row.value
        .get("updated_at")
        .and_then(serde_json::Value::as_f64)
        .filter(|ts| ts.is_finite() && *ts >= 0.0)
        .ok_or_else(|| AppError::Sync("Invalid sync revision updated_at".into()))
}

fn canonical_json(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Array(values) => {
            serde_json::Value::Array(values.into_iter().map(canonical_json).collect())
        }
        serde_json::Value::Object(values) => {
            let mut entries = values.into_iter().collect::<Vec<_>>();
            entries.sort_by(|(left, _), (right, _)| left.cmp(right));
            serde_json::Value::Object(
                entries
                    .into_iter()
                    .map(|(key, value)| (key, canonical_json(value)))
                    .collect(),
            )
        }
        serde_json::Value::Number(number) => {
            let Some(value) = number.as_f64() else {
                return serde_json::Value::Number(number);
            };
            if value.fract() == 0.0 && value.abs() <= MAX_SAFE_JSON_INTEGER {
                serde_json::Value::Number(serde_json::Number::from(value as i64))
            } else {
                serde_json::Value::Number(number)
            }
        }
        value => value,
    }
}

fn revision_fingerprint(row: &ChangeRow) -> Result<String, AppError> {
    let value = serde_json::to_value(row).map_err(|e| AppError::Serialize(e.to_string()))?;
    let bytes = serde_json::to_vec(&canonical_json(value))
        .map_err(|e| AppError::Serialize(e.to_string()))?;
    let hash = bytes.iter().fold(FNV1A_128_OFFSET, |hash, byte| {
        (hash ^ u128::from(*byte)).wrapping_mul(FNV1A_128_PRIME)
    });
    Ok(format!("{hash:032x}"))
}

fn next_push_seq(timestamp_ms: i64, persisted_sequence: i64) -> i64 {
    let mut current = LAST_PUSH_SEQ.load(Ordering::Relaxed);
    loop {
        let next = timestamp_ms
            .max(persisted_sequence.saturating_add(1))
            .max(current.saturating_add(1));
        match LAST_PUSH_SEQ.compare_exchange_weak(
            current,
            next,
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => return next,
            Err(observed) => current = observed,
        }
    }
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
            tables: vec![READING_PROGRESS_SPEC, BOOKMARKS_SPEC],
        }
    }

    fn last_push_cursor_key(device: &str) -> String {
        format!("last_push_cursor_v2::{device}")
    }

    fn last_pull_cursor_key(device: &str, remote: &str) -> String {
        format!("last_pull_cursor_v2::{device}::{remote}")
    }

    fn last_local_sequence_key(device: &str) -> String {
        format!("last_local_change_seq_v2::{device}")
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
            active
                .update(db)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        } else {
            let id = uuid::Uuid::new_v4().as_simple().to_string();
            let active = sync_meta::ActiveModel {
                id: Set(id),
                key: Set(key.to_string()),
                value: Set(value.to_string()),
            };
            active
                .insert(db)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        }
        Ok(())
    }

    async fn export_rows(
        db: &DatabaseConnection,
        spec: &TableSpec,
        since_ms: f64,
    ) -> Result<Vec<ChangeRow>, AppError> {
        match spec.name {
            "reading_progress" => Self::export_reading_progress_rows(db, since_ms).await,
            "bookmarks" => Self::export_bookmark_rows(db, since_ms).await,
            name => Err(AppError::Sync(format!("Unsupported sync table: {name}"))),
        }
    }

    async fn export_reading_progress_rows(
        db: &DatabaseConnection,
        since_ms: f64,
    ) -> Result<Vec<ChangeRow>, AppError> {
        let rows = reading_progress::Entity::find()
            .filter(reading_progress::Column::UpdatedAt.gte(since_ms))
            .order_by_asc(reading_progress::Column::UpdatedAt)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|row| ChangeRow {
                table: READING_PROGRESS_SPEC.name.to_string(),
                key: serde_json::Map::from_iter([
                    ("book_id".to_string(), serde_json::json!(row.book_id)),
                    (
                        "format".to_string(),
                        serde_json::json!(row.format.to_ascii_uppercase()),
                    ),
                ]),
                value: serde_json::Map::from_iter([
                    (
                        "locator_json".to_string(),
                        serde_json::json!(row.locator_json),
                    ),
                    ("updated_at".to_string(), serde_json::json!(row.updated_at)),
                ]),
            })
            .collect())
    }

    async fn export_bookmark_rows(
        db: &DatabaseConnection,
        since_ms: f64,
    ) -> Result<Vec<ChangeRow>, AppError> {
        let rows = bookmarks::Entity::find()
            .filter(bookmarks::Column::UpdatedAt.gte(since_ms))
            .order_by_asc(bookmarks::Column::UpdatedAt)
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|row| ChangeRow {
                table: BOOKMARKS_SPEC.name.to_string(),
                key: serde_json::Map::from_iter([
                    ("book_id".to_string(), serde_json::json!(row.book_id)),
                    (
                        "format".to_string(),
                        serde_json::json!(row.format.to_ascii_uppercase()),
                    ),
                    (
                        "locator_key".to_string(),
                        serde_json::json!(row.locator_key),
                    ),
                ]),
                value: serde_json::Map::from_iter([
                    ("id".to_string(), serde_json::json!(row.id)),
                    (
                        "locator_json".to_string(),
                        serde_json::json!(row.locator_json),
                    ),
                    ("created_at".to_string(), serde_json::json!(row.created_at)),
                    ("updated_at".to_string(), serde_json::json!(row.updated_at)),
                    ("deleted_at".to_string(), serde_json::json!(row.deleted_at)),
                ]),
            })
            .collect())
    }

    async fn apply_row(
        db: &DatabaseConnection,
        spec: &TableSpec,
        change: &ChangeRow,
    ) -> Result<bool, AppError> {
        if change.table != spec.name {
            return Ok(false);
        }

        match spec.name {
            "reading_progress" => Self::apply_reading_progress_row(db, change).await,
            "bookmarks" => Self::apply_bookmark_row(db, change).await,
            name => Err(AppError::Sync(format!("Unsupported sync table: {name}"))),
        }
    }

    async fn apply_reading_progress_row(
        db: &DatabaseConnection,
        change: &ChangeRow,
    ) -> Result<bool, AppError> {
        let incoming_ts = change
            .value
            .get("updated_at")
            .and_then(serde_json::Value::as_f64)
            .filter(|updated_at| updated_at.is_finite() && *updated_at > 0.0)
            .ok_or_else(|| AppError::Sync("Invalid reading progress updated_at".into()))?;

        let book_id = change
            .key
            .get("book_id")
            .and_then(serde_json::Value::as_i64)
            .filter(|book_id| *book_id > 0)
            .ok_or_else(|| AppError::Sync("Invalid reading progress book_id".into()))?;
        let format = change
            .key
            .get("format")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|format| !format.is_empty())
            .map(str::to_ascii_uppercase)
            .ok_or_else(|| AppError::Sync("Invalid reading progress format".into()))?;
        let locator_json = change
            .value
            .get("locator_json")
            .and_then(serde_json::Value::as_str)
            .filter(|locator| !locator.is_empty())
            .ok_or_else(|| AppError::Sync("Invalid reading progress locator".into()))?;

        SqliteProgressRepository::apply_sync_revision(
            db,
            book_id,
            &format,
            locator_json,
            incoming_ts,
        )
        .await
    }

    async fn apply_bookmark_row(
        db: &DatabaseConnection,
        change: &ChangeRow,
    ) -> Result<bool, AppError> {
        let incoming_ts = change
            .value
            .get("updated_at")
            .and_then(serde_json::Value::as_f64)
            .filter(|updated_at| updated_at.is_finite() && *updated_at > 0.0)
            .ok_or_else(|| AppError::Sync("Invalid bookmark sync updated_at".into()))?;
        let book_id = change
            .key
            .get("book_id")
            .and_then(serde_json::Value::as_i64)
            .filter(|book_id| *book_id > 0)
            .ok_or_else(|| AppError::Sync("Invalid bookmark sync book_id".into()))?;
        let format = change
            .key
            .get("format")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|format| !format.is_empty())
            .map(str::to_ascii_uppercase)
            .ok_or_else(|| AppError::Sync("Invalid bookmark sync format".into()))?;
        let locator_key = change
            .key
            .get("locator_key")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|locator_key| !locator_key.is_empty() && locator_key.len() <= 2048)
            .ok_or_else(|| AppError::Sync("Invalid bookmark sync locator_key".into()))?;

        let id = change
            .value
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| AppError::Sync("Invalid bookmark sync id".into()))?;
        let locator_json = change
            .value
            .get("locator_json")
            .and_then(serde_json::Value::as_str)
            .filter(|locator| !locator.is_empty())
            .ok_or_else(|| AppError::Sync("Invalid bookmark sync locator".into()))?;
        let locator = serde_json::from_str(locator_json)
            .map_err(|_| AppError::Sync("Invalid bookmark sync locator".into()))?;
        if !is_valid_reader_locator(&locator) {
            return Err(AppError::Sync("Invalid bookmark sync locator".into()));
        }
        let created_at = change
            .value
            .get("created_at")
            .and_then(serde_json::Value::as_f64)
            .filter(|created_at| created_at.is_finite() && *created_at > 0.0)
            .ok_or_else(|| AppError::Sync("Invalid bookmark sync created_at".into()))?;
        let deleted_at = match change.value.get("deleted_at") {
            Some(serde_json::Value::Null) => None,
            Some(value) => Some(
                value
                    .as_f64()
                    .filter(|deleted_at| deleted_at.is_finite() && *deleted_at > 0.0)
                    .ok_or_else(|| AppError::Sync("Invalid bookmark sync deleted_at".into()))?,
            ),
            None => return Err(AppError::Sync("Invalid bookmark sync deleted_at".into())),
        };

        SqliteBookmarkRepository::apply_sync_revision(
            db,
            id,
            book_id,
            &format,
            locator_key,
            locator_json,
            created_at,
            incoming_ts,
            deleted_at,
        )
        .await
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
        // A single process may trigger sync from multiple UI paths. Serializing the
        // whole push keeps cursor advancement and file creation one transaction-like unit.
        let _push_guard = PUSH_LOCK.lock().await;
        let cursor_key = Self::last_push_cursor_key(device_id);
        let cursor_value = Self::read_meta(db, &cursor_key).await?;
        let cursor = PushCursor::parse(cursor_value.as_deref());
        let seen = cursor.seen.iter().cloned().collect::<BTreeSet<_>>();
        let sequence_key = Self::last_local_sequence_key(device_id);
        let persisted_sequence = Self::read_meta(db, &sequence_key)
            .await?
            .and_then(|value| value.parse::<i64>().ok())
            .filter(|sequence| *sequence >= 0)
            .unwrap_or(0);

        let mut snapshot = Vec::new();
        for spec in &self.tables {
            for row in Self::export_rows(db, spec, cursor.ts).await? {
                let timestamp = revision_timestamp(&row)?;
                let fingerprint = revision_fingerprint(&row)?;
                snapshot.push((row, timestamp, fingerprint));
            }
        }

        let mut pending = snapshot
            .iter()
            .filter(|(_, timestamp, fingerprint)| {
                *timestamp > cursor.ts || (*timestamp == cursor.ts && !seen.contains(fingerprint))
            })
            .cloned()
            .collect::<Vec<_>>();
        if pending.is_empty() {
            return Ok(0);
        }

        pending.sort_by(|left, right| {
            left.1
                .total_cmp(&right.1)
                .then_with(|| left.2.cmp(&right.2))
        });

        let mut payload = String::new();
        for (row, _, _) in &pending {
            let line =
                serde_json::to_string(row).map_err(|e| AppError::Serialize(e.to_string()))?;
            payload.push_str(&line);
            payload.push('\n');
        }
        let seq = next_push_seq(now_ms(), persisted_sequence);
        let device_dir = format!(".myreader/changes/{device_id}/");
        if let Err(e) = op.create_dir(&device_dir).await {
            tracing::warn!("[db-sync] create_dir {device_dir} failed: {e}");
        }
        let object_path = format!(".myreader/changes/{device_id}/{seq}.jsonl");
        op.write(&object_path, payload.into_bytes())
            .await
            .map_err(|err| AppError::Config(format!("Upload DB changes failed: {err}")))?;
        Self::write_meta(db, &sequence_key, &seq.to_string()).await?;

        let max_ts = pending
            .iter()
            .map(|(_, timestamp, _)| *timestamp)
            .max_by(f64::total_cmp)
            .ok_or_else(|| AppError::Sync("No pending revisions after filtering".into()))?;
        let mut next_seen = if max_ts == cursor.ts {
            seen
        } else {
            BTreeSet::new()
        };
        next_seen.extend(
            snapshot
                .iter()
                .filter(|(_, timestamp, _)| *timestamp == max_ts)
                .map(|(_, _, fingerprint)| fingerprint.clone()),
        );
        let next_cursor = PushCursor {
            ts: max_ts,
            seen: next_seen.into_iter().collect(),
        };
        Self::write_meta(db, &cursor_key, &next_cursor.serialize()?).await?;
        Ok(pending.len())
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
                return Err(AppError::Config(format!(
                    "List .myreader/changes/ failed: {err}"
                )));
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

            let file_entries = match op
                .list(&format!(".myreader/changes/{remote_device}/"))
                .await
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
                let text = String::from_utf8_lossy(&bytes);

                for (line_index, line) in text.lines().enumerate() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let change: ChangeRow = match serde_json::from_str(line) {
                        Ok(change) => change,
                        Err(err) => {
                            tracing::warn!(
                                "[db-sync] quarantined malformed change at {file_path}:{}: {err}",
                                line_index + 1
                            );
                            continue;
                        }
                    };
                    let Some(spec) = self.tables.iter().find(|spec| spec.name == change.table)
                    else {
                        tracing::warn!(
                            "[db-sync] quarantined unsupported table at {file_path}:{}: {}",
                            line_index + 1,
                            change.table
                        );
                        continue;
                    };
                    match Self::apply_row(db, spec, &change).await {
                        Ok(true) => {
                            applied += 1;
                        }
                        Ok(false) => {}
                        Err(AppError::Sync(err)) => tracing::warn!(
                            "[db-sync] quarantined invalid change at {file_path}:{}: {err}",
                            line_index + 1
                        ),
                        Err(err) => return Err(err),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repositories::bookmark_repo::SqliteBookmarkRepository;
    use opendal::services::Fs;
    use std::path::Path;

    fn create_temp_operator(root: &Path) -> Operator {
        let builder = Fs::default().root(root.to_string_lossy().as_ref());
        Operator::new(builder).unwrap().finish()
    }

    fn bookmark_change(
        id: &str,
        locator_json: &str,
        created_at: f64,
        updated_at: f64,
        deleted_at: Option<f64>,
    ) -> ChangeRow {
        ChangeRow {
            table: "bookmarks".into(),
            key: serde_json::Map::from_iter([
                ("book_id".into(), serde_json::json!(5)),
                ("format".into(), serde_json::json!("epub")),
                ("locator_key".into(), serde_json::json!("chapter@0.5")),
            ]),
            value: serde_json::Map::from_iter([
                ("id".into(), serde_json::json!(id)),
                ("locator_json".into(), serde_json::json!(locator_json)),
                ("created_at".into(), serde_json::json!(created_at)),
                ("updated_at".into(), serde_json::json!(updated_at)),
                ("deleted_at".into(), serde_json::json!(deleted_at)),
            ]),
        }
    }

    fn progress_change(locator_json: &str, updated_at: f64) -> ChangeRow {
        ChangeRow {
            table: "reading_progress".into(),
            key: serde_json::Map::from_iter([
                ("book_id".into(), serde_json::json!(8)),
                ("format".into(), serde_json::json!("epub")),
            ]),
            value: serde_json::Map::from_iter([
                ("locator_json".into(), serde_json::json!(locator_json)),
                ("updated_at".into(), serde_json::json!(updated_at)),
            ]),
        }
    }

    async fn resolve_bookmark(first: &ChangeRow, second: &ChangeRow) -> bookmarks::Model {
        let temp = tempfile::tempdir().unwrap();
        let db = SqliteBookmarkRepository::open(temp.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        LwwProvider::apply_row(&db, &BOOKMARKS_SPEC, first)
            .await
            .unwrap();
        LwwProvider::apply_row(&db, &BOOKMARKS_SPEC, second)
            .await
            .unwrap();
        bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(5))
            .one(&db)
            .await
            .unwrap()
            .unwrap()
    }

    async fn resolve_progress(first: &ChangeRow, second: &ChangeRow) -> reading_progress::Model {
        let temp = tempfile::tempdir().unwrap();
        let db = SqliteBookmarkRepository::open(temp.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        LwwProvider::apply_row(&db, &READING_PROGRESS_SPEC, first)
            .await
            .unwrap();
        LwwProvider::apply_row(&db, &READING_PROGRESS_SPEC, second)
            .await
            .unwrap();
        reading_progress::Entity::find()
            .filter(reading_progress::Column::BookId.eq(8))
            .one(&db)
            .await
            .unwrap()
            .unwrap()
    }

    fn jsonl_sequences(root: &Path, device_id: &str) -> Vec<i64> {
        let dir = root.join(".myreader/changes").join(device_id);
        let Ok(entries) = std::fs::read_dir(dir) else {
            return Vec::new();
        };
        let mut sequences = entries
            .filter_map(Result::ok)
            .filter_map(|entry| {
                entry
                    .file_name()
                    .to_str()?
                    .strip_suffix(".jsonl")?
                    .parse::<i64>()
                    .ok()
            })
            .collect::<Vec<_>>();
        sequences.sort_unstable();
        sequences
    }

    #[test]
    fn cursor_keys_should_use_v2_when_bookmark_table_is_enabled() {
        assert_eq!(
            LwwProvider::last_push_cursor_key("device-a"),
            "last_push_cursor_v2::device-a"
        );
        assert_eq!(
            LwwProvider::last_pull_cursor_key("device-a", "device-b"),
            "last_pull_cursor_v2::device-a::device-b"
        );
        assert_eq!(
            LwwProvider::last_local_sequence_key("device-a"),
            "last_local_change_seq_v2::device-a"
        );
        assert_eq!(
            LwwProvider::default_for_myreader()
                .tables
                .iter()
                .map(|spec| spec.name)
                .collect::<Vec<_>>(),
            vec!["reading_progress", "bookmarks"]
        );
    }

    #[test]
    fn revision_fingerprint_should_match_shared_fnv128_golden_value() {
        let change = ChangeRow {
            table: "bookmarks".into(),
            key: serde_json::Map::from_iter([
                ("book_id".into(), serde_json::json!(1)),
                ("format".into(), serde_json::json!("EPUB")),
                ("locator_key".into(), serde_json::json!("chapter.xhtml@0.5")),
            ]),
            value: serde_json::Map::from_iter([
                ("id".into(), serde_json::json!("bookmark-1")),
                (
                    "locator_json".into(),
                    serde_json::json!(r#"{"href":"chapter.xhtml","type":"application/xhtml+xml"}"#),
                ),
                ("created_at".into(), serde_json::json!(100.0)),
                ("updated_at".into(), serde_json::json!(100.0)),
                ("deleted_at".into(), serde_json::Value::Null),
            ]),
        };

        assert_eq!(
            revision_fingerprint(&change).unwrap(),
            "ec2250ea97bbfec70f52eb0ddbb315b3"
        );
    }

    #[test]
    fn push_sequence_should_increase_when_wall_clock_and_process_restart_values_do_not() {
        let first = next_push_seq(1_000, 0);
        let second = next_push_seq(1_000, 0);
        assert!(second > first);

        let persisted = second.saturating_add(10);
        assert_eq!(next_push_seq(1_000, persisted), persisted + 1);
    }

    #[tokio::test]
    async fn export_should_include_full_bookmark_and_tombstone_when_rows_change() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().to_string_lossy().to_string();
        let db = SqliteBookmarkRepository::open(&root).await.unwrap();
        let locator = r#"{"href":"chapter.xhtml","type":"application/xhtml+xml"}"#;
        let model =
            SqliteBookmarkRepository::upsert(&db, 3, "epub", "chapter.xhtml@0.4", locator, 100.0)
                .await
                .unwrap();

        let rows = LwwProvider::export_rows(&db, &BOOKMARKS_SPEC, 0.0)
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].key.get("book_id"), Some(&serde_json::json!(3)));
        assert_eq!(rows[0].key.get("format"), Some(&serde_json::json!("EPUB")));
        assert_eq!(
            rows[0].key.get("locator_key"),
            Some(&serde_json::json!("chapter.xhtml@0.4"))
        );
        assert_eq!(rows[0].value.get("id"), Some(&serde_json::json!(model.id)));
        assert_eq!(
            rows[0].value.get("deleted_at"),
            Some(&serde_json::Value::Null)
        );

        SqliteBookmarkRepository::tombstone(&db, 3, "epub", "chapter.xhtml@0.4", 200.0)
            .await
            .unwrap();
        let rows = LwwProvider::export_rows(&db, &BOOKMARKS_SPEC, 100.0)
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(
            rows[0].value.get("deleted_at"),
            Some(&serde_json::json!(200.0))
        );

        SqliteProgressRepository::set_progress(
            &db,
            4,
            "pdf",
            r#"{"href":"publication.pdf","type":"application/pdf"}"#,
            300.0,
        )
        .await
        .unwrap();
        let rows = LwwProvider::export_rows(&db, &READING_PROGRESS_SPEC, 300.0)
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].key.get("format"), Some(&serde_json::json!("PDF")));
    }

    #[tokio::test]
    async fn apply_should_keep_newer_bookmark_when_changes_arrive_out_of_order() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().to_string_lossy().to_string();
        let db = SqliteBookmarkRepository::open(&root).await.unwrap();
        let change = ChangeRow {
            table: "bookmarks".into(),
            key: serde_json::Map::from_iter([
                ("book_id".into(), serde_json::json!(5)),
                ("format".into(), serde_json::json!("epub")),
                ("locator_key".into(), serde_json::json!("chapter@0.5")),
            ]),
            value: serde_json::Map::from_iter([
                ("id".into(), serde_json::json!("remote-id")),
                (
                    "locator_json".into(),
                    serde_json::json!(r#"{"href":"chapter.xhtml","type":"application/xhtml+xml"}"#),
                ),
                ("created_at".into(), serde_json::json!(100.0)),
                ("updated_at".into(), serde_json::json!(300.0)),
                ("deleted_at".into(), serde_json::json!(300.0)),
            ]),
        };

        assert!(LwwProvider::apply_row(&db, &BOOKMARKS_SPEC, &change)
            .await
            .unwrap());
        let mut stale = change.clone();
        stale
            .value
            .insert("updated_at".into(), serde_json::json!(200.0));
        stale
            .value
            .insert("deleted_at".into(), serde_json::Value::Null);
        assert!(!LwwProvider::apply_row(&db, &BOOKMARKS_SPEC, &stale)
            .await
            .unwrap());

        let model = bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(5))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(model.format, "EPUB");
        assert_eq!(model.id, "remote-id");
        assert_eq!(model.updated_at, 300.0);
        assert_eq!(model.deleted_at, Some(300.0));
    }

    #[tokio::test]
    async fn atomic_bookmark_upsert_should_keep_newer_revision_when_writes_race() {
        let temp = tempfile::tempdir().unwrap();
        let db = SqliteBookmarkRepository::open(temp.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        let older = bookmark_change(
            "z-older",
            r#"{"href":"older.xhtml","type":"application/xhtml+xml"}"#,
            50.0,
            100.0,
            None,
        );
        let newer = bookmark_change(
            "a-newer",
            r#"{"href":"newer.xhtml","type":"application/xhtml+xml"}"#,
            50.0,
            200.0,
            None,
        );

        let (older_result, newer_result) = tokio::join!(
            LwwProvider::apply_row(&db, &BOOKMARKS_SPEC, &older),
            LwwProvider::apply_row(&db, &BOOKMARKS_SPEC, &newer)
        );
        older_result.unwrap();
        assert!(newer_result.unwrap());

        let model = bookmarks::Entity::find()
            .filter(bookmarks::Column::BookId.eq(5))
            .one(&db)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(model.id, "a-newer");
        assert_eq!(model.updated_at, 200.0);
    }

    #[tokio::test]
    async fn equal_timestamp_bookmarks_should_converge_by_shared_max_tuple_in_either_order() {
        let locator_low = "{\"href\":\"\u{e000}\",\"type\":\"application/xhtml+xml\"}";
        let locator_high = "{\"href\":\"\u{10000}\",\"type\":\"application/xhtml+xml\"}";
        let cases = vec![
            (
                bookmark_change("z-active", locator_high, 10.0, 100.0, None),
                bookmark_change("a-deleted", locator_low, 10.0, 100.0, Some(90.0)),
                "a-deleted",
                locator_low,
                10.0,
                Some(90.0),
            ),
            (
                bookmark_change("same-id", locator_low, 10.0, 100.0, None),
                bookmark_change("same-id", locator_high, 10.0, 100.0, None),
                "same-id",
                locator_high,
                10.0,
                None,
            ),
            (
                bookmark_change("same-id", locator_high, 10.0, 100.0, None),
                bookmark_change("same-id", locator_high, 20.0, 100.0, None),
                "same-id",
                locator_high,
                20.0,
                None,
            ),
            (
                bookmark_change("same-id", locator_high, 20.0, 100.0, Some(80.0)),
                bookmark_change("same-id", locator_high, 20.0, 100.0, Some(90.0)),
                "same-id",
                locator_high,
                20.0,
                Some(90.0),
            ),
        ];

        for (first, second, expected_id, expected_locator, expected_created, expected_deleted) in
            cases
        {
            let forward = resolve_bookmark(&first, &second).await;
            let reverse = resolve_bookmark(&second, &first).await;
            assert_eq!(forward, reverse);
            assert_eq!(forward.id, expected_id);
            assert_eq!(forward.locator_json, expected_locator);
            assert_eq!(forward.created_at, expected_created);
            assert_eq!(forward.deleted_at, expected_deleted);
        }
    }

    #[tokio::test]
    async fn equal_timestamp_progress_should_converge_by_binary_locator_in_either_order() {
        let lower = progress_change("{\"href\":\"\u{e000}\"}", 100.0);
        let higher = progress_change("{\"href\":\"\u{10000}\"}", 100.0);

        let forward = resolve_progress(&lower, &higher).await;
        let reverse = resolve_progress(&higher, &lower).await;

        assert_eq!(
            forward.locator_json,
            higher.value["locator_json"].as_str().unwrap()
        );
        assert_eq!(forward.book_id, reverse.book_id);
        assert_eq!(forward.format, reverse.format);
        assert_eq!(forward.locator_json, reverse.locator_json);
        assert_eq!(forward.updated_at, reverse.updated_at);
        assert_eq!(forward.format, "EPUB");
    }

    #[tokio::test]
    async fn push_should_retain_unseen_boundary_revisions_and_not_rewrite_seen_revisions() {
        let db_root = tempfile::tempdir().unwrap();
        let storage_root = tempfile::tempdir().unwrap();
        let db = SqliteBookmarkRepository::open(db_root.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        let op = create_temp_operator(storage_root.path());
        let provider = LwwProvider::default_for_myreader();
        let device_id = "cursor-device";
        let cursor_key = LwwProvider::last_push_cursor_key(device_id);

        SqliteBookmarkRepository::upsert(
            &db,
            1,
            "EPUB",
            "first",
            r#"{"href":"first.xhtml","type":"application/xhtml+xml"}"#,
            100.0,
        )
        .await
        .unwrap();
        LwwProvider::write_meta(&db, &cursor_key, "100")
            .await
            .unwrap();

        assert_eq!(provider.push_async(&db, &op, device_id).await.unwrap(), 1);
        let first_cursor = PushCursor::parse(
            LwwProvider::read_meta(&db, &cursor_key)
                .await
                .unwrap()
                .as_deref(),
        );
        assert_eq!(first_cursor.ts, 100.0);
        assert_eq!(first_cursor.seen.len(), 1);

        SqliteBookmarkRepository::upsert(
            &db,
            1,
            "EPUB",
            "second",
            r#"{"href":"second.xhtml","type":"application/xhtml+xml"}"#,
            100.0,
        )
        .await
        .unwrap();
        assert_eq!(provider.push_async(&db, &op, device_id).await.unwrap(), 1);
        assert_eq!(provider.push_async(&db, &op, device_id).await.unwrap(), 0);

        let final_cursor = PushCursor::parse(
            LwwProvider::read_meta(&db, &cursor_key)
                .await
                .unwrap()
                .as_deref(),
        );
        assert_eq!(final_cursor.ts, 100.0);
        assert_eq!(final_cursor.seen.len(), 2);
        let sequences = jsonl_sequences(storage_root.path(), device_id);
        assert_eq!(sequences.len(), 2);
        assert!(sequences[1] > sequences[0]);
    }

    #[tokio::test]
    async fn concurrent_pushes_should_serialize_and_write_one_change_file() {
        let db_root = tempfile::tempdir().unwrap();
        let storage_root = tempfile::tempdir().unwrap();
        let db = SqliteBookmarkRepository::open(db_root.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        let op = create_temp_operator(storage_root.path());
        let provider = LwwProvider::default_for_myreader();
        let device_id = "concurrent-device";
        SqliteBookmarkRepository::upsert(
            &db,
            1,
            "EPUB",
            "only",
            r#"{"href":"only.xhtml","type":"application/xhtml+xml"}"#,
            100.0,
        )
        .await
        .unwrap();

        let (first, second) = tokio::join!(
            provider.push_async(&db, &op, device_id),
            provider.push_async(&db, &op, device_id)
        );
        let mut counts = [first.unwrap(), second.unwrap()];
        counts.sort_unstable();
        assert_eq!(counts, [0, 1]);
        assert_eq!(jsonl_sequences(storage_root.path(), device_id).len(), 1);
    }

    #[tokio::test]
    async fn pull_should_quarantine_bad_lines_and_advance_after_valid_bookmark() {
        let db_root = tempfile::tempdir().unwrap();
        let storage_root = tempfile::tempdir().unwrap();
        let db = SqliteBookmarkRepository::open(db_root.path().to_string_lossy().as_ref())
            .await
            .unwrap();
        let op = create_temp_operator(storage_root.path());
        let provider = LwwProvider::default_for_myreader();
        let remote_device = "remote-device";
        let local_device = "local-device";
        let object_path = format!(".myreader/changes/{remote_device}/1.jsonl");
        let invalid_locator = bookmark_change("invalid", "not-json", 100.0, 100.0, None);
        let invalid_locations = bookmark_change(
            "invalid-locations",
            r#"{"href":"invalid.xhtml","type":"application/xhtml+xml","locations":[]}"#,
            100.0,
            100.0,
            None,
        );
        let valid = bookmark_change(
            "valid",
            r#"{"href":"valid.xhtml","type":"application/xhtml+xml","locations":{}}"#,
            100.0,
            100.0,
            None,
        );
        let payload = format!(
            "{{bad-json}}\n{}\n{}\n{}\n",
            serde_json::to_string(&invalid_locator).unwrap(),
            serde_json::to_string(&invalid_locations).unwrap(),
            serde_json::to_string(&valid).unwrap()
        );
        op.write(&object_path, payload.into_bytes()).await.unwrap();

        assert_eq!(
            provider.pull_async(&db, &op, local_device).await.unwrap(),
            1
        );
        let rows = bookmarks::Entity::find().all(&db).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "valid");
        let pull_key = LwwProvider::last_pull_cursor_key(local_device, remote_device);
        assert_eq!(
            LwwProvider::read_meta(&db, &pull_key)
                .await
                .unwrap()
                .as_deref(),
            Some("1")
        );
        assert_eq!(
            provider.pull_async(&db, &op, local_device).await.unwrap(),
            0
        );
    }
}
