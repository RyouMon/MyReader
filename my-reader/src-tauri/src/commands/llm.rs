use crate::{
    commands::common,
    error::AppError,
    services::llm_service::{DesktopLlmService, LlmConfigDto, LlmProfileInput},
};
use tauri::AppHandle;

#[tauri::command]
#[specta::specta]
pub fn get_llm_config<R: tauri::Runtime>(app: AppHandle<R>) -> Result<LlmConfigDto, AppError> {
    DesktopLlmService::get_config(&crate::config::config_path(&common::app_data_dir(&app)?))
}
#[tauri::command]
#[specta::specta]
pub fn upsert_llm_profile<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: LlmProfileInput,
) -> Result<LlmConfigDto, AppError> {
    DesktopLlmService::upsert(
        &crate::config::config_path(&common::app_data_dir(&app)?),
        input,
    )
}
#[tauri::command]
#[specta::specta]
pub fn remove_llm_profile<R: tauri::Runtime>(
    app: AppHandle<R>,
    profile_id: String,
) -> Result<LlmConfigDto, AppError> {
    DesktopLlmService::remove(
        &crate::config::config_path(&common::app_data_dir(&app)?),
        &profile_id,
    )
}
#[tauri::command]
#[specta::specta]
pub fn select_llm_profile<R: tauri::Runtime>(
    app: AppHandle<R>,
    profile_id: Option<String>,
) -> Result<LlmConfigDto, AppError> {
    DesktopLlmService::select(
        &crate::config::config_path(&common::app_data_dir(&app)?),
        profile_id,
    )
}
#[tauri::command]
#[specta::specta]
pub async fn list_llm_models<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: LlmProfileInput,
) -> Result<Vec<String>, AppError> {
    DesktopLlmService::models(
        &crate::config::config_path(&common::app_data_dir(&app)?),
        input,
    )
    .await
}
#[tauri::command]
#[specta::specta]
pub async fn probe_llm_profile<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: LlmProfileInput,
) -> Result<(), AppError> {
    DesktopLlmService::probe(
        &crate::config::config_path(&common::app_data_dir(&app)?),
        input,
    )
    .await
}
