use std::collections::BTreeMap;

use tauri::{AppHandle, State};

use crate::commands::{common, AppState};
use crate::error::AppError;
use crate::services::book_reading_format_service::BookReadingFormatService;

#[tauri::command]
#[specta::specta]
pub async fn list_book_reading_formats<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
) -> Result<BTreeMap<String, String>, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    BookReadingFormatService::list(&app_data_dir, &config, &library_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_book_reading_format<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
    book_id: i64,
    format: Option<String>,
) -> Result<(), AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    BookReadingFormatService::set(
        &app_data_dir,
        &config,
        &library_id,
        book_id,
        format.as_deref(),
    )
    .await
}
