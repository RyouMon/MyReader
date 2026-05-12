use crate::commands::CacheUsageDto;
use crate::error::AppError;
use crate::cache;

pub struct CacheService;

impl CacheService {
    pub fn get_cache_usage(max_mb: i64) -> Result<CacheUsageDto, AppError> {
        let files = cache::collect_cache_files_sorted_oldest()?;
        let total_bytes = files.iter().map(|(_, size, _)| *size).sum::<u64>();
        Ok(CacheUsageDto {
            total_bytes,
            max_bytes: (max_mb.max(0) as u64) * 1024 * 1024,
        })
    }

    pub fn clear_cache() -> Result<(), AppError> {
        let root = cache::reader_cache_root();
        if root.exists() {
            std::fs::remove_dir_all(&root)?;
        }
        cache::ensure_reader_cache_dirs()?;
        Ok(())
    }

    pub fn enforce_cache_limit(max_mb: i64) -> Result<(), AppError> {
        let max_bytes = (max_mb.max(0) as u64) * 1024 * 1024;
        if max_bytes == 0 {
            return Self::clear_cache();
        }
        let files = cache::collect_cache_files_sorted_oldest()?;
        let mut total_bytes = files.iter().map(|(_, size, _)| *size).sum::<u64>();
        if total_bytes <= max_bytes {
            return Ok(());
        }
        for (path, size, _) in files {
            if total_bytes <= max_bytes {
                break;
            }
            if path.exists() {
                std::fs::remove_file(&path)?;
                total_bytes = total_bytes.saturating_sub(size);
            }
        }
        Ok(())
    }
}

