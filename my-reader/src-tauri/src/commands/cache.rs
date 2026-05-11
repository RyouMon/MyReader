use super::*;

#[tauri::command]
#[specta::specta]
pub fn get_cache_usage(state: State<'_, AppState>) -> Result<CacheUsageDto, AppError> {
    let max_mb = {
        let config = state.lock().unwrap();
        config.reader_ui.cache.max_cache_size_mb
    };
    let files = collect_cache_files_sorted_oldest()?;
    let total_bytes = files.iter().map(|(_, size, _)| *size).sum::<u64>();
    Ok(CacheUsageDto {
        total_bytes,
        max_bytes: (max_mb.max(0) as u64) * 1024 * 1024,
    })
}

#[tauri::command]
#[specta::specta]
pub fn clear_cache() -> Result<(), AppError> {
    let root = reader_cache_root();
    if root.exists() {
        fs::remove_dir_all(&root)?;
    }
    ensure_reader_cache_dirs()?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn enforce_cache_limit(state: State<'_, AppState>) -> Result<(), AppError> {
    let max_bytes = {
        let config = state.lock().unwrap();
        (config.reader_ui.cache.max_cache_size_mb.max(0) as u64) * 1024 * 1024
    };
    if max_bytes == 0 {
        return clear_cache();
    }
    let files = collect_cache_files_sorted_oldest()?;
    let mut total_bytes = files.iter().map(|(_, size, _)| *size).sum::<u64>();
    if total_bytes <= max_bytes {
        return Ok(());
    }
    for (path, size, _) in files {
        if total_bytes <= max_bytes {
            break;
        }
        if path.exists() {
            fs::remove_file(&path)?;
            total_bytes = total_bytes.saturating_sub(size);
        }
    }
    Ok(())
}

