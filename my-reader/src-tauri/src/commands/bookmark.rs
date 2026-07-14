use tauri::{AppHandle, State};
use tracing::info;

use crate::commands::{common, AppState};
use crate::error::AppError;
use crate::models::{JsonAny, ReaderBookmarkDto};
use crate::services::bookmark_service::BookmarkService;

#[tauri::command]
#[specta::specta]
pub async fn list_reader_bookmarks<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<Vec<ReaderBookmarkDto>, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let rows = BookmarkService::list_for_library(
        &app_data_dir,
        &config,
        library_id.as_deref(),
        book_id,
        &format,
    )
    .await?;
    info!(
        book_id,
        format,
        count = rows.len(),
        "Listed reader bookmarks"
    );
    Ok(rows)
}

#[tauri::command]
#[specta::specta]
pub async fn add_reader_bookmark<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
    locator_key: String,
    locator: JsonAny,
) -> Result<ReaderBookmarkDto, AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let bookmark = BookmarkService::add_for_library(
        &app_data_dir,
        &config,
        library_id.as_deref(),
        book_id,
        &format,
        &locator_key,
        &locator.0,
    )
    .await?;
    info!(book_id, format, locator_key, "Added reader bookmark");
    Ok(bookmark)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_reader_bookmark<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
    locator_key: String,
) -> Result<(), AppError> {
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    BookmarkService::delete_for_library(
        &app_data_dir,
        &config,
        library_id.as_deref(),
        book_id,
        &format,
        &locator_key,
    )
    .await?;
    info!(book_id, format, locator_key, "Deleted reader bookmark");
    Ok(())
}
