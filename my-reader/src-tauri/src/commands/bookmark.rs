use tauri::{AppHandle, State};
use tracing::info;

use crate::commands::{common, AppState};
use crate::error::AppError;
use crate::models::{JsonAny, ReaderBookmarkDto};
use crate::services::bookmark_service::BookmarkService;
use crate::services::library_service::LibraryService;

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
    let library = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let bookmark = BookmarkService::add_for_library(
        &app_data_dir,
        &config,
        Some(&library.id),
        book_id,
        &format,
        &locator_key,
        &locator.0,
    )
    .await?;
    common::schedule_sidecar_push(&app, &library.id);
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
    let library = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    BookmarkService::delete_for_library(
        &app_data_dir,
        &config,
        Some(&library.id),
        book_id,
        &format,
        &locator_key,
    )
    .await?;
    common::schedule_sidecar_push(&app, &library.id);
    info!(book_id, format, locator_key, "Deleted reader bookmark");
    Ok(())
}
