use tauri::{AppHandle, State};

use crate::commands::{common, AppState};
use crate::error::AppError;
use crate::services::library_service::LibraryService;
use crate::services::reading_statistics_service::ReadingStatisticsService;

#[tauri::command]
#[specta::specta]
#[allow(clippy::too_many_arguments)]
pub async fn add_reading_session_interval<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    id: String,
    book_id: i64,
    format: String,
    local_day: String,
    started_at: f64,
    duration_seconds: i64,
    updated_at: f64,
) -> Result<(), AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let library = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    ReadingStatisticsService::add_session_interval_for_library(
        &app_data_dir,
        &config,
        Some(&library.id),
        &id,
        book_id,
        &format,
        &local_day,
        started_at,
        duration_seconds,
        updated_at,
    )
    .await?;
    common::schedule_sidecar_push(&app, &library.id);
    Ok(())
}
