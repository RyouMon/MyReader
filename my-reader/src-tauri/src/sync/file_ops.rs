//! 整文件的下载 / 本地释放 / 彻底删除原子操作。
//!
//! 设计原则：
//!
//! - `download` / `delete_everywhere` 需要 `OpenDAL Operator`（真连云）；
//! - `evict_local` 只触及本地磁盘，不读云；
//! - 所有路径参数都使用相对 library root 的 POSIX 风格相对路径。
//!
//! 本模块**不直接访问 SQLite**：DB 侧（`file_state`）的写入由调用方
//! 在 async 上下文中完成。本模块只负责 I/O 并返回结果信息，方便上层
//! 维护状态一致性。

use std::path::{Path, PathBuf};

use futures::AsyncReadExt;
use opendal::Operator;
use tokio::io::AsyncWriteExt;

use crate::error::AppError;

use super::manifest::{self, Manifest};

const BLAKE3_CHUNK_BYTES: usize = 256 * 1024;

/// 下载/删除完成后返回给调用方的文件元信息，便于上层写 `file_state`。
#[derive(Debug, Clone)]
pub struct DownloadOutcome {
    pub blake3: String,
    pub size: i64,
    pub mtime_ms: i64,
}

/// 将 `relative_path` 规范化为相对 library root 的本地 `PathBuf`。
///
/// 拒绝绝对路径与 `..`，避免越权写入 library 目录以外。
fn resolve_local_path(library_root: &Path, relative_path: &str) -> Result<PathBuf, AppError> {
    let rel = Path::new(relative_path);
    if rel.is_absolute() {
        return Err(AppError::Config(format!(
            "同步路径不能是绝对路径: {relative_path}"
        )));
    }
    for comp in rel.components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return Err(AppError::Config(format!(
                "同步路径不能包含 ..: {relative_path}"
            )));
        }
    }
    Ok(library_root.join(rel))
}

fn file_mtime_ms(path: &Path) -> Result<i64, AppError> {
    let meta = std::fs::metadata(path).map_err(AppError::Io)?;
    let modified = meta.modified().map_err(AppError::Io)?;
    let ms = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Ok(ms)
}

/// 流式计算本地文件的 blake3 十六进制。
pub async fn blake3_of_file(path: &Path) -> Result<String, AppError> {
    let mut file = tokio::fs::File::open(path).await.map_err(AppError::Io)?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; BLAKE3_CHUNK_BYTES];
    loop {
        let n = tokio::io::AsyncReadExt::read(&mut file, &mut buf)
            .await
            .map_err(AppError::Io)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

/// 从云端拉取整个文件写入本地，返回新本地文件的元信息。
///
/// 若本地已存在同路径文件且 blake3 匹配 manifest，则跳过实际下载并直接返回。
pub async fn download(
    op: &Operator,
    library_root: &Path,
    manifest: &Manifest,
    relative_path: &str,
) -> Result<DownloadOutcome, AppError> {
    let entry = manifest
        .find(relative_path)
        .ok_or_else(|| AppError::NotFound(format!("manifest 中未登记该路径: {relative_path}")))?;

    let target = resolve_local_path(library_root, relative_path)?;
    if target.exists() {
        if let Ok(existing) = blake3_of_file(&target).await {
            if existing == entry.blake3 {
                let meta = std::fs::metadata(&target).map_err(AppError::Io)?;
                return Ok(DownloadOutcome {
                    blake3: existing,
                    size: meta.len() as i64,
                    mtime_ms: file_mtime_ms(&target)?,
                });
            }
        }
    }

    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(AppError::Io)?;
    }

    let tmp = target.with_extension("myreader-partial");
    let mut reader = op
        .reader(relative_path)
        .await
        .map_err(|err| AppError::Config(format!("打开远端读取器失败: {err}")))?
        .into_futures_async_read(..)
        .await
        .map_err(|err| AppError::Config(format!("请求远端字节流失败: {err}")))?;

    {
        let mut file = tokio::fs::File::create(&tmp).await.map_err(AppError::Io)?;
        let mut hasher = blake3::Hasher::new();
        let mut buf = vec![0u8; BLAKE3_CHUNK_BYTES];
        loop {
            let n = reader
                .read(&mut buf)
                .await
                .map_err(|err| AppError::Config(format!("读取远端字节流失败: {err}")))?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            file.write_all(&buf[..n]).await.map_err(AppError::Io)?;
        }
        file.flush().await.map_err(AppError::Io)?;
        drop(file);

        let hex = hasher.finalize().to_hex().to_string();
        if hex != entry.blake3 {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(AppError::Config(format!(
                "下载后哈希不匹配: 期望 {}，实际 {}",
                entry.blake3, hex
            )));
        }
    }

    tokio::fs::rename(&tmp, &target)
        .await
        .map_err(AppError::Io)?;

    let meta = std::fs::metadata(&target).map_err(AppError::Io)?;
    Ok(DownloadOutcome {
        blake3: entry.blake3.clone(),
        size: meta.len() as i64,
        mtime_ms: file_mtime_ms(&target)?,
    })
}

/// 仅删除本地副本；调用方负责把 `file_state` 置为 `remote_only`。
pub async fn evict_local(library_root: &Path, relative_path: &str) -> Result<(), AppError> {
    let target = resolve_local_path(library_root, relative_path)?;
    match tokio::fs::remove_file(&target).await {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(AppError::Io(err)),
    }
}

/// 本地 + 云端 + manifest 全部删除；调用方负责清 `file_state`。
///
/// 会同时写回 manifest（从 `entries` 中移除该路径）。
pub async fn delete_everywhere(
    op: &Operator,
    library_root: &Path,
    manifest_state: &mut Manifest,
    relative_path: &str,
) -> Result<(), AppError> {
    let target = resolve_local_path(library_root, relative_path)?;
    match tokio::fs::remove_file(&target).await {
        Ok(()) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(AppError::Io(err)),
    }

    match op.delete(relative_path).await {
        Ok(()) => {}
        Err(err) if err.kind() == opendal::ErrorKind::NotFound => {}
        Err(err) => {
            return Err(AppError::Config(format!("删除云端文件失败: {err}")));
        }
    }

    if manifest_state.remove(relative_path) {
        manifest::save(op, manifest_state).await?;
    }
    Ok(())
}
