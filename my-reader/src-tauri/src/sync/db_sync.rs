//! 数据库同步：以 `SyncProvider` trait 抽象后，方案可平滑替换。
//!
//! 当前默认实现 `LwwProvider` 不依赖 cr-sqlite（考虑到其上游两年未更新、
//! 动态加载在 iOS 受限等风险）。它要求被同步表含 `updated_at REAL` 列，
//! 以毫秒时间戳做行级 LWW；冲突解决足够 MyReader 场景使用。
//!
//! 需要真 CRDT 时，可以在此文件补一个 `CrsqliteProvider` 并在 `select_provider`
//! 里按配置切换，UI/调用方无感知。
//!
//! 同步载荷格式（写入 `<prefix>/changes/<device>/<seq>.jsonl`）：
//! 每行一个 JSON，形如：
//! ```json
//! {"t":"reading_progress","k":{"library_id":"..","book_id":1,"format":"EPUB"},
//!  "v":{"anchor_json":"..","updated_at":1.72e12}}
//! ```

use async_trait::async_trait;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use opendal::Operator;

/// 可同步表的抽象描述：主键列名 + 负载列名。
pub struct TableSpec {
    pub name: &'static str,
    pub key_columns: &'static [&'static str],
    pub value_columns: &'static [&'static str],
}

/// `reading_progress` 表的同步规格。
pub const READING_PROGRESS_SPEC: TableSpec = TableSpec {
    name: "reading_progress",
    key_columns: &["library_id", "book_id", "format"],
    value_columns: &["anchor_json", "updated_at"],
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

#[async_trait(?Send)]
pub trait SyncProvider {
    /// 导出自上次 push 以来本机产生的行，并上传到 backend。
    async fn push(
        &self,
        conn: &Connection,
        op: &Operator,
        device_id: &str,
    ) -> Result<usize, AppError>;

    /// 从 backend 拉取其他设备的变更并合并入本机；返回合并行数。
    async fn pull(&self, conn: &Connection, op: &Operator, device_id: &str)
        -> Result<usize, AppError>;
}

/// LWW（Last-Writer-Wins by `updated_at`）实现：适合单用户多设备。
pub struct LwwProvider {
    pub tables: Vec<TableSpec>,
}

impl LwwProvider {
    pub fn default_for_myreader() -> Self {
        Self {
            tables: vec![READING_PROGRESS_SPEC],
        }
    }

    fn sync_meta_schema() -> &'static str {
        "CREATE TABLE IF NOT EXISTS sync_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
         );"
    }

    pub fn initialize_schema(conn: &Connection) -> Result<(), AppError> {
        conn.execute_batch(Self::sync_meta_schema())
            .map_err(|e| AppError::Database(e.to_string()))
    }

    fn last_push_cursor_key(device: &str) -> String {
        format!("last_push_cursor::{device}")
    }

    fn last_pull_cursor_key(device: &str, remote: &str) -> String {
        format!("last_pull_cursor::{device}::{remote}")
    }

    fn read_meta(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
        let r = conn.query_row(
            "SELECT value FROM sync_meta WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        );
        match r {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e.to_string())),
        }
    }

    fn write_meta(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
        conn.execute(
            "INSERT INTO sync_meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map(|_| ())
        .map_err(|e| AppError::Database(e.to_string()))
    }

    fn export_rows(conn: &Connection, spec: &TableSpec, since_ms: f64) -> Result<Vec<ChangeRow>, AppError> {
        let cols: Vec<&str> = spec
            .key_columns
            .iter()
            .chain(spec.value_columns.iter())
            .copied()
            .collect();
        let sql = format!(
            "SELECT {} FROM {} WHERE updated_at > ?1 ORDER BY updated_at",
            cols.join(","),
            spec.name
        );
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let rows = stmt
            .query_map(params![since_ms], |row| {
                let mut key = serde_json::Map::new();
                let mut value = serde_json::Map::new();
                for (i, col) in spec.key_columns.iter().enumerate() {
                    key.insert((*col).to_string(), sqlite_value_to_json(row, i)?);
                }
                for (j, col) in spec.value_columns.iter().enumerate() {
                    let idx = spec.key_columns.len() + j;
                    value.insert((*col).to_string(), sqlite_value_to_json(row, idx)?);
                }
                Ok(ChangeRow {
                    table: spec.name.to_string(),
                    key,
                    value,
                })
            })
            .map_err(|e| AppError::Database(e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| AppError::Database(e.to_string()))?);
        }
        Ok(out)
    }

    fn apply_row(conn: &Connection, spec: &TableSpec, change: &ChangeRow) -> Result<bool, AppError> {
        // 只合并属于本 spec 的表
        if change.table != spec.name {
            return Ok(false);
        }
        // LWW：如果本机该主键行 updated_at >= 入参，跳过
        let incoming_ts = change
            .value
            .get("updated_at")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        let key_clause = spec
            .key_columns
            .iter()
            .enumerate()
            .map(|(i, col)| format!("{} = ?{}", col, i + 1))
            .collect::<Vec<_>>()
            .join(" AND ");
        let key_params = spec
            .key_columns
            .iter()
            .map(|col| change.key.get(*col).cloned().unwrap_or(serde_json::Value::Null))
            .collect::<Vec<_>>();

        let existing: Option<f64> = {
            let sql = format!(
                "SELECT updated_at FROM {} WHERE {}",
                spec.name, key_clause
            );
            let mut stmt = conn
                .prepare(&sql)
                .map_err(|e| AppError::Database(e.to_string()))?;
            let r = stmt.query_row(
                rusqlite::params_from_iter(key_params.iter().map(json_to_sql_param)),
                |row| row.get::<_, f64>(0),
            );
            match r {
                Ok(v) => Some(v),
                Err(rusqlite::Error::QueryReturnedNoRows) => None,
                Err(e) => return Err(AppError::Database(e.to_string())),
            }
        };
        if existing.map(|e| e >= incoming_ts).unwrap_or(false) {
            return Ok(false);
        }

        let all_cols: Vec<&str> = spec
            .key_columns
            .iter()
            .chain(spec.value_columns.iter())
            .copied()
            .collect();
        let placeholders = (1..=all_cols.len())
            .map(|i| format!("?{}", i))
            .collect::<Vec<_>>()
            .join(",");
        let update_clause = spec
            .value_columns
            .iter()
            .map(|c| format!("{} = excluded.{}", c, c))
            .collect::<Vec<_>>()
            .join(",");
        let pk_clause = spec.key_columns.join(",");
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})
             ON CONFLICT({}) DO UPDATE SET {}",
            spec.name,
            all_cols.join(","),
            placeholders,
            pk_clause,
            update_clause
        );
        let mut params: Vec<serde_json::Value> = Vec::with_capacity(all_cols.len());
        for col in spec.key_columns {
            params.push(change.key.get(*col).cloned().unwrap_or(serde_json::Value::Null));
        }
        for col in spec.value_columns {
            params.push(change.value.get(*col).cloned().unwrap_or(serde_json::Value::Null));
        }
        conn.execute(
            &sql,
            rusqlite::params_from_iter(params.iter().map(json_to_sql_param)),
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(true)
    }
}

fn sqlite_value_to_json(row: &rusqlite::Row<'_>, i: usize) -> rusqlite::Result<serde_json::Value> {
    use rusqlite::types::ValueRef;
    match row.get_ref(i)? {
        ValueRef::Null => Ok(serde_json::Value::Null),
        ValueRef::Integer(n) => Ok(serde_json::Value::from(n)),
        ValueRef::Real(f) => Ok(serde_json::json!(f)),
        ValueRef::Text(t) => Ok(serde_json::Value::String(
            String::from_utf8_lossy(t).to_string(),
        )),
        ValueRef::Blob(b) => Ok(serde_json::Value::String(
            base64::engine::general_purpose::STANDARD.encode(b),
        )),
    }
}

fn json_to_sql_param(v: &serde_json::Value) -> rusqlite::types::Value {
    use rusqlite::types::Value;
    match v {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(b) => Value::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                Value::Real(f)
            } else {
                Value::Null
            }
        }
        serde_json::Value::String(s) => Value::Text(s.clone()),
        _ => Value::Text(v.to_string()),
    }
}

use base64::Engine as _;

#[async_trait(?Send)]
impl SyncProvider for LwwProvider {
    async fn push(
        &self,
        conn: &Connection,
        op: &Operator,
        device_id: &str,
    ) -> Result<usize, AppError> {
        Self::initialize_schema(conn)?;
        let cursor_key = Self::last_push_cursor_key(device_id);
        let since_ms: f64 = Self::read_meta(conn, &cursor_key)?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0);

        let mut all = Vec::new();
        let mut max_ts = since_ms;
        for spec in &self.tables {
            let rows = Self::export_rows(conn, spec, since_ms)?;
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
            let line = serde_json::to_string(row)
                .map_err(|e| AppError::Serialize(e.to_string()))?;
            payload.push_str(&line);
            payload.push('\n');
        }
        let seq = now_ms();
        let object_path = format!("changes/{}/{seq}.jsonl", device_id);
        op.write(&object_path, payload.into_bytes())
            .await
            .map_err(|err| AppError::Config(format!("上传 DB changes 失败: {err}")))?;

        Self::write_meta(conn, &cursor_key, &format!("{}", max_ts))?;
        Ok(all.len())
    }

    async fn pull(
        &self,
        conn: &Connection,
        op: &Operator,
        device_id: &str,
    ) -> Result<usize, AppError> {
        Self::initialize_schema(conn)?;
        let entries = match op.list("changes/").await {
            Ok(e) => e,
            Err(err) if err.kind() == opendal::ErrorKind::NotFound => return Ok(0),
            Err(err) => {
                return Err(AppError::Config(format!("列出 changes/ 失败: {err}")));
            }
        };

        let mut applied = 0usize;
        for entry in entries {
            let path = entry.path().to_string();
            // changes/<device>/<seq>.jsonl；跳过本机与非数据文件
            if !path.ends_with(".jsonl") {
                continue;
            }
            let segments: Vec<&str> = path.trim_start_matches("changes/").split('/').collect();
            if segments.len() < 2 {
                continue;
            }
            let remote_device = segments[0];
            if remote_device == device_id {
                continue;
            }

            let cursor_key = Self::last_pull_cursor_key(device_id, remote_device);
            let last_seq: i64 = Self::read_meta(conn, &cursor_key)?
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            let seq_str = segments
                .last()
                .and_then(|n| n.strip_suffix(".jsonl"))
                .unwrap_or("0");
            let seq: i64 = seq_str.parse().unwrap_or(0);
            if seq <= last_seq {
                continue;
            }

            let buf = op
                .read(&path)
                .await
                .map_err(|err| AppError::Config(format!("读取 {path} 失败: {err}")))?;
            let bytes = buf.to_vec();
            let text = std::str::from_utf8(&bytes)
                .map_err(|err| AppError::Serialize(format!("解码 changes 失败: {err}")))?;

            for line in text.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                let change: ChangeRow = serde_json::from_str(line)
                    .map_err(|err| AppError::Serialize(format!("解析 change 失败: {err}")))?;
                for spec in &self.tables {
                    if Self::apply_row(conn, spec, &change)? {
                        applied += 1;
                        break;
                    }
                }
            }

            Self::write_meta(conn, &cursor_key, &format!("{}", seq))?;
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
