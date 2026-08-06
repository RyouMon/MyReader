use tauri::{AppHandle, Manager, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{BookDetail, BookEntry, ImportBookOutcome, LibraryConfig, PaginatedBooks};
use crate::services::book_service::BookService;
use crate::services::book_transfer_scheduler::BookTransferScheduler;
use crate::services::library_service::LibraryService;

fn resolve_library<R: tauri::Runtime>(
    app: &AppHandle<R>,
    state: &State<'_, AppState>,
    library_id: Option<&str>,
) -> Result<(std::path::PathBuf, LibraryConfig), AppError> {
    let app_data_dir = common::app_data_dir(app)?;
    let config = common::config_snapshot(state);
    let library = LibraryService::resolve_library(library_id, &config)?;
    Ok((app_data_dir, library))
}

#[tauri::command]
#[specta::specta]
pub async fn get_books<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
) -> Result<Vec<BookEntry>, AppError> {
    info!("Start to get books. library id: {library_id:?}");
    let (app_data_dir, library) = resolve_library(&app, &state, library_id.as_deref())?;
    let result = BookService::get_library_books(&library, &app_data_dir).await;

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
    let result = if sort_by.as_deref() == Some("lastRead") {
        BookService::get_library_books_page_by_last_read(
            &lib,
            &app_data_dir,
            offset,
            limit,
            search.as_deref(),
        )
        .await
    } else {
        BookService::get_library_books_page(
            &lib,
            &app_data_dir,
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
    let (app_data_dir, library) = resolve_library(&app, &state, library_id.as_deref())?;
    let result = BookService::get_library_book_detail(&library, &app_data_dir, book_id).await;

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
    let (app_data_dir, library) = resolve_library(&app, &state, library_id.as_deref())?;
    let result = BookService::get_library_series_books(
        &library,
        &app_data_dir,
        &series_name,
        exclude_book_id,
    )
    .await;

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

#[tauri::command]
#[specta::specta]
pub async fn import_book<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    source_file_path: String,
    title: Option<String>,
    authors: Vec<String>,
) -> Result<ImportBookOutcome, AppError> {
    let started_at = std::time::Instant::now();
    info!("Start to import book. library id: {library_id:?}");
    let (app_data_dir, library) = resolve_library(&app, &state, library_id.as_deref())?;
    let result = BookService::import_book(
        &crate::config::config_path(&app_data_dir),
        &library,
        &app_data_dir,
        my_reader_core::models::ImportBookRequest {
            source_file_path,
            source_file_name: None,
            title,
            authors,
            recorded_at_ms: common::unix_epoch_millis(),
            consume_source_file: false,
        },
    )
    .await?;
    info!(
        "Success to import book. library id: \"{}\", duration: {} ms",
        library.id,
        started_at.elapsed().as_millis()
    );
    if library.is_remote() {
        if let Some(scheduler) = app.try_state::<BookTransferScheduler>() {
            if let Some(book_uuid) = result.book.as_ref().and_then(|book| book.uuid.as_deref()) {
                scheduler.request_book(library.id, book_uuid);
            } else {
                scheduler.request(library.id);
            }
        }
    } else {
        common::schedule_sidecar_push(&app, &library.id);
    }
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn request_book_upload(
    state: State<'_, AppState>,
    scheduler: State<'_, BookTransferScheduler>,
    library_id: String,
    book_uuid: String,
) -> Result<(), AppError> {
    let config = common::config_snapshot(&state);
    BookService::request_book_upload(&config, &scheduler, &library_id, &book_uuid)
}

#[tauri::command]
#[specta::specta]
pub async fn update_book_metadata<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    title: String,
    authors: Vec<String>,
) -> Result<BookEntry, AppError> {
    let (app_data_dir, library) = resolve_library(&app, &state, library_id.as_deref())?;
    let result = BookService::update_local_book_metadata(
        &crate::config::config_path(&app_data_dir),
        &library,
        &app_data_dir,
        my_reader_core::models::UpdateBookMetadataRequest {
            book_id,
            title,
            authors,
            recorded_at_ms: common::unix_epoch_millis(),
        },
    )
    .await?;
    common::schedule_sidecar_push(&app, &library.id);
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_book<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
) -> Result<(), AppError> {
    let (app_data_dir, library) = resolve_library(&app, &state, library_id.as_deref())?;
    BookService::delete_local_book(
        &crate::config::config_path(&app_data_dir),
        &library,
        &app_data_dir,
        book_id,
        common::unix_epoch_millis(),
    )
    .await?;
    common::schedule_sidecar_push(&app, &library.id);
    Ok(())
}
