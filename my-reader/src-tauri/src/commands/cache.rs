use tauri::State;

use crate::commands::common;
use crate::commands::{AppState, CacheUsageDto};
use crate::error::AppError;
use crate::services::cache_service::CacheService;

#[tauri::command]
#[specta::specta]
pub fn get_cache_usage(state: State<'_, AppState>) -> Result<CacheUsageDto, AppError> {
    let max_mb = common::config_snapshot(&state).reader_ui.cache.max_cache_size_mb;
    CacheService::get_cache_usage(max_mb)
}

#[tauri::command]
#[specta::specta]
pub fn clear_cache() -> Result<(), AppError> {
    CacheService::clear_cache()
}

#[tauri::command]
#[specta::specta]
pub fn enforce_cache_limit(state: State<'_, AppState>) -> Result<(), AppError> {
    let max_mb = common::config_snapshot(&state).reader_ui.cache.max_cache_size_mb;
    CacheService::enforce_cache_limit(max_mb)
}
