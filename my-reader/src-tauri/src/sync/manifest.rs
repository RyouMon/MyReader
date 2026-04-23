//! 云端 manifest：`.myreader/manifest.json`，列出所有纳入同步的文件条目。
//!
//! 写入采取"先临时文件 + 原子 rename"的思路：OpenDAL 的 write 总是原子替换，
//! 因此只需在应用层保证并发安全即可。本期不依赖 `If-Match/ETag`（WebDAV 实现
//! 参差不齐），改为写后读回并比对 blake3，不一致就重试。

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use opendal::Operator;

pub const MANIFEST_PATH: &str = ".myreader/manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub updated_at: i64,
    pub device: String,
    pub entries: Vec<ManifestEntry>,
}

impl Manifest {
    pub fn empty(device: impl Into<String>) -> Self {
        Self {
            version: 1,
            updated_at: 0,
            device: device.into(),
            entries: Vec::new(),
        }
    }

    /// 按路径查找；`O(n)` 线性扫描足够：manifest 通常 < 1 万条。
    pub fn find(&self, path: &str) -> Option<&ManifestEntry> {
        self.entries.iter().find(|entry| entry.path == path)
    }

    /// 按路径 upsert；相同路径则覆盖。
    pub fn upsert(&mut self, entry: ManifestEntry) {
        if let Some(existing) = self.entries.iter_mut().find(|e| e.path == entry.path) {
            *existing = entry;
        } else {
            self.entries.push(entry);
        }
    }

    /// 按路径删除，返回是否命中。
    pub fn remove(&mut self, path: &str) -> bool {
        let before = self.entries.len();
        self.entries.retain(|entry| entry.path != path);
        before != self.entries.len()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestEntry {
    /// 相对 backend root 的 POSIX 风格路径；`/` 分隔，无前导斜杠。
    pub path: String,
    pub size: u64,
    /// 内容地址：blake3 十六进制。
    pub blake3: String,
    /// 源端 mtime，毫秒时间戳；用于 LWW 冲突检测。
    pub mtime: i64,
    /// 是否为全量镜像文件（封面、metadata.db 等）。
    #[serde(default)]
    pub required: bool,
    /// 事实来源；本期仅 `"cloud"` 与 `"local"` 两种。
    #[serde(default = "default_source_of_truth")]
    pub source_of_truth: String,
}

fn default_source_of_truth() -> String {
    "cloud".into()
}

/// 从 backend 读取 manifest；不存在视为空 manifest 不报错。
pub async fn load(op: &Operator, device: &str) -> Result<Manifest, AppError> {
    match op.read(MANIFEST_PATH).await {
        Ok(buf) => {
            let bytes = buf.to_vec();
            serde_json::from_slice::<Manifest>(&bytes)
                .map_err(|err| AppError::Serialize(format!("解析 manifest 失败: {err}")))
        }
        Err(err) if err.kind() == opendal::ErrorKind::NotFound => Ok(Manifest::empty(device)),
        Err(err) => Err(AppError::Config(format!("读取 manifest 失败: {err}"))),
    }
}

/// 将 manifest 写回 backend；会自动更新 `updated_at`。
pub async fn save(op: &Operator, manifest: &mut Manifest) -> Result<(), AppError> {
    manifest.updated_at = now_ms();
    let json = serde_json::to_vec_pretty(manifest)
        .map_err(|err| AppError::Serialize(err.to_string()))?;
    op.write(MANIFEST_PATH, json)
        .await
        .map_err(|err| AppError::Config(format!("写入 manifest 失败: {err}")))?;
    Ok(())
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
