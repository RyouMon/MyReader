use log::{error, info};
use tauri::State;

use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{BookDetail, BookEntry, PaginatedBooks};
use crate::services::book_service::BookService;
use crate::services::library_service::LibraryService;

#[tauri::command]
#[specta::specta]
pub fn get_books(
    state: State<'_, AppState>,
    library_id: Option<String>,
) -> Result<Vec<BookEntry>, AppError> {
    info!("Start to get books. library id: {library_id:?}");
    let result = (|| {
        let config = state.lock().unwrap();
        let (_, lib_path) = LibraryService::resolve_library_path(library_id.as_deref(), &config)?;
        drop(config);
        BookService::get_books(&lib_path)
    })();

    match &result {
        Ok(books) => info!("Success to get books. count: {}", books.len()),
        Err(err) => {
            error!("Failed to get books. requested library id: {library_id:?}, error: {err}")
        }
    }

    result
}

#[tauri::command]
#[specta::specta]
pub fn get_books_page(
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
    let result = (|| {
        let config = state.lock().unwrap();
        let (_, lib_path) = LibraryService::resolve_library_path(library_id.as_deref(), &config)?;
        drop(config);
        BookService::get_books_page(&lib_path, offset, limit, sort_by.as_deref(), search.as_deref())
    })();

    match &result {
        Ok(page) => info!(
            "Success to get books page. returned count: {}, total: {}",
            page.items.len(),
            page.total
        ),
        Err(err) => {
            error!("Failed to get books page. requested library id: {library_id:?}, error: {err}")
        }
    }

    result
}

#[tauri::command]
#[specta::specta]
pub fn get_book_detail(
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
) -> Result<BookDetail, AppError> {
    info!("Start to get book detail. library id: {library_id:?}, book id: {book_id}");
    let result = (|| {
        let config = state.lock().unwrap();
        let (_, lib_path) = LibraryService::resolve_library_path(library_id.as_deref(), &config)?;
        drop(config);
        BookService::get_book_detail(&lib_path, book_id)
    })();

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
pub fn get_series_books(
    state: State<'_, AppState>,
    library_id: Option<String>,
    series_name: String,
    exclude_book_id: Option<i64>,
) -> Result<Vec<BookEntry>, AppError> {
    info!(
        "Start to get series books. library id: {library_id:?}, series name: \"{}\", exclude book id: {exclude_book_id:?}",
        series_name
    );
    let result = (|| {
        let config = state.lock().unwrap();
        let (_, lib_path) = LibraryService::resolve_library_path(library_id.as_deref(), &config)?;
        drop(config);
        BookService::get_series_books(&lib_path, &series_name, exclude_book_id)
    })();

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
pub async fn get_book_cover(
    state: State<'_, AppState>,
    library_id: String,
    book_path: String,
) -> Result<Option<String>, AppError> {
    info!(
        "Start to get book cover. library id: \"{}\", book path: \"{}\"",
        library_id, book_path
    );

    let lib_path = {
        let config = state.lock().unwrap();
        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == library_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", library_id)))?;
        lib.path.clone()
    };

    let lib_path_clone = lib_path.clone();
    let book_path_clone = book_path.clone();
    let result = match tauri::async_runtime::spawn_blocking(move || {
        BookService::get_book_cover_bytes(&lib_path_clone, &book_path_clone)
    })
    .await
    .map_err(|e| AppError::Task(e.to_string()))?
    ?
    {
        Some(bytes) => {
            use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
            let encoded = BASE64.encode(&bytes);
            Ok(Some(format!("data:image/jpeg;base64,{}", encoded)))
        }
        None => Ok(None),
    };

    match &result {
        Ok(data) => info!(
            "Success to get book cover. found: {}, library id: \"{}\", book path: \"{}\"",
            data.is_some(),
            library_id,
            book_path
        ),
        Err(err) => error!(
            "Failed to get book cover. library id: \"{}\", book path: \"{}\", error: {err}",
            library_id, book_path
        ),
    }

    result
}
