use tauri::{AppHandle, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::services::favorite_book_service::FavoriteBookService;
use crate::services::library_service::LibraryService;

#[tauri::command]
#[specta::specta]
pub async fn list_favorite_book_ids<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
) -> Result<Vec<i64>, AppError> {
    info!("Start to list favorite book ids. library id: {library_id:?}");
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let result = FavoriteBookService::list_favorite_book_ids_for_library(
        &app_data_dir,
        &config,
        library_id.as_deref(),
    )
    .await;

    match &result {
        Ok(ids) => info!("Success to list favorite book ids. count: {}", ids.len()),
        Err(err) => error!(
            "Failed to list favorite book ids. requested library id: {library_id:?}, error: {err}"
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn add_favorite_book<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
) -> Result<(), AppError> {
    info!("Start to add favorite book. library id: {library_id:?}, book id: {book_id}");
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let library = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let result = FavoriteBookService::add_favorite_book_for_library(
        &app_data_dir,
        &config,
        Some(&library.id),
        book_id,
    )
    .await;

    match &result {
        Ok(()) => {
            common::schedule_sidecar_push(&app, &library.id);
            info!("Success to add favorite book. book id: {book_id}");
        }
        Err(err) => error!(
            "Failed to add favorite book. requested library id: {library_id:?}, book id: {book_id}, error: {err}"
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn remove_favorite_book<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
) -> Result<(), AppError> {
    info!("Start to remove favorite book. library id: {library_id:?}, book id: {book_id}");
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let library = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let result = FavoriteBookService::remove_favorite_book_for_library(
        &app_data_dir,
        &config,
        Some(&library.id),
        book_id,
    )
    .await;

    match &result {
        Ok(()) => {
            common::schedule_sidecar_push(&app, &library.id);
            info!("Success to remove favorite book. book id: {book_id}");
        }
        Err(err) => error!(
            "Failed to remove favorite book. requested library id: {library_id:?}, book id: {book_id}, error: {err}"
        ),
    }

    result
}
