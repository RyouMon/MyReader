use tauri::{AppHandle, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{BookDetail, BookEntry, PaginatedBooks};
use crate::services::book_service::BookService;
use crate::services::library_service::LibraryService;
use crate::utils::paths::library_sidecar_path;

/// Resolve `(app_data_dir, lib_path)` for a book-scoped command in a single pass.
/// Centralises the snapshot + path resolution every command in this file performs.
fn resolve_lib_path<R: tauri::Runtime>(
    app: &AppHandle<R>,
    state: &State<'_, AppState>,
    library_id: Option<&str>,
) -> Result<String, AppError> {
    let app_data_dir = common::app_data_dir(app)?;
    let config = common::config_snapshot(state);
    let (_, lib_path) = LibraryService::resolve_library_path(library_id, &app_data_dir, &config)?;
    Ok(lib_path)
}

#[tauri::command]
#[specta::specta]
pub async fn get_books<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
) -> Result<Vec<BookEntry>, AppError> {
    info!("Start to get books. library id: {library_id:?}");
    let lib_path = resolve_lib_path(&app, &state, library_id.as_deref())?;
    let result = BookService::get_books(&lib_path).await;

    match &result {
        Ok(books) => info!("Success to get books. count: {}", books.len()),
        Err(err) => {
            error!("Failed to get books. requested library id: {library_id:?}, error: {err}");
        }
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn get_books_page<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    offset: usize,
    limit: usize,
    sort_by: Option<String>,
    search: Option<String>,
) -> Result<PaginatedBooks, AppError> {
    info!(
        "Start to get books page. library id: {library_id:?}, offset: {offset}, limit: {limit}, sort by: {sort_by:?}, search: {search:?}"
    );
    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);
    let lib = LibraryService::resolve_library(library_id.as_deref(), &config)?;
    let lib_path =
        LibraryService::resolve_library_path(library_id.as_deref(), &app_data_dir, &config)?.1;
    let result = if sort_by.as_deref() == Some("lastRead") {
        let sidecar_root = library_sidecar_path(&lib, &app_data_dir)
            .to_string_lossy()
            .to_string();
        BookService::get_books_page_by_last_read(
            &lib_path,
            &sidecar_root,
            offset,
            limit,
            search.as_deref(),
        )
        .await
    } else {
        BookService::get_books_page(
            &lib_path,
            offset,
            limit,
            sort_by.as_deref(),
            search.as_deref(),
        )
        .await
    };

    match &result {
        Ok(page) => info!(
            "Success to get books page. returned count: {}, total: {}",
            page.items.len(),
            page.total
        ),
        Err(err) => {
            error!("Failed to get books page. requested library id: {library_id:?}, error: {err}");
        }
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn get_book_detail<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
) -> Result<BookDetail, AppError> {
    info!("Start to get book detail. library id: {library_id:?}, book id: {book_id}");
    let lib_path = resolve_lib_path(&app, &state, library_id.as_deref())?;
    let result = BookService::get_book_detail(&lib_path, book_id).await;

    match &result {
        Ok(detail) => info!(
            "Success to get book detail. book id: {}, title: \"{}\", format count: {}, identifier count: {}",
            detail.book.id,
            detail.book.title,
            detail.format_sizes.len(),
            detail.identifiers.len()
        ),
        Err(err) => error!(
            "Failed to get book detail. requested library id: {library_id:?}, book id: {book_id}, error: {err}"
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn get_series_books<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    series_name: String,
    exclude_book_id: Option<i64>,
) -> Result<Vec<BookEntry>, AppError> {
    info!(
        "Start to get series books. library id: {library_id:?}, series name: \"{}\", exclude book id: {exclude_book_id:?}",
        series_name
    );
    let lib_path = resolve_lib_path(&app, &state, library_id.as_deref())?;
    let result = BookService::get_series_books(&lib_path, &series_name, exclude_book_id).await;

    match &result {
        Ok(books) => info!(
            "Success to get series books. series name: \"{}\", count: {}",
            series_name,
            books.len()
        ),
        Err(err) => error!(
            "Failed to get series books. requested library id: {library_id:?}, series name: \"{}\", error: {err}",
            series_name
        ),
    }

    result
}
