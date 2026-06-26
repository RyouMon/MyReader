use tauri::State;

use crate::commands::common;
use crate::commands::{AppState, CacheUsageDto};
use crate::error::AppError;
use crate::services::cache_service::CacheService;

#[tauri::command]
#[specta::specta]
pub fn get_cache_usage(state: State<'_, AppState>) -> Result<CacheUsageDto, AppError> {
    let config = common::config_snapshot(&state);
    CacheService::get_cache_usage(&config)
}

#[tauri::command]
#[specta::specta]
pub fn clear_cache() -> Result<(), AppError> {
    CacheService::clear_cache()
}

#[tauri::command]
#[specta::specta]
pub fn enforce_cache_limit(state: State<'_, AppState>) -> Result<(), AppError> {
    let config = common::config_snapshot(&state);
    CacheService::enforce_cache_limit(&config)
}
