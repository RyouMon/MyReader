use super::*;

#[tauri::command]
#[specta::specta]
pub fn get_books(
    state: State<'_, AppState>,
    library_id: Option<String>,
) -> Result<Vec<BookEntry>, AppError> {
    info!("Start to get books. library id: {library_id:?}");
    let result = (|| {
        let config = state.lock().unwrap();

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("NO_ACTIVE_LIBRARY".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", lib_id)))?;

        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;

        calibre::get_all_books(&conn).map_err(|e| AppError::Database(e.to_string()))
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

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("NO_ACTIVE_LIBRARY".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", lib_id)))?;

        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;

        let sort = sort_by.as_deref().unwrap_or("title");
        let limit = limit.clamp(1, 200);
        let (items, total) = calibre::get_books_page(&conn, offset, limit, sort, search.as_deref())
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(PaginatedBooks { items, total })
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

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("NO_ACTIVE_LIBRARY".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", lib_id)))?;

        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;

        let book = calibre::get_book_by_id(&conn, book_id)
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("BOOK_NOT_FOUND: {}", book_id)))?;

        let format_sizes = calibre::get_book_format_sizes(&conn, book_id)
            .map_err(|e| AppError::Database(e.to_string()))?
            .into_iter()
            .map(|(format, size_bytes)| FormatSize { format, size_bytes })
            .collect();

        let identifiers = calibre::get_book_identifiers(&conn, book_id)
            .map_err(|e| AppError::Database(e.to_string()))?
            .into_iter()
            .map(|(id_type, value)| BookIdentifier { id_type, value })
            .collect();

        Ok(BookDetail {
            book,
            format_sizes,
            identifiers,
        })
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

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("NO_ACTIVE_LIBRARY".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", lib_id)))?;

        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;

        calibre::get_books_by_series(&conn, &series_name, exclude_book_id)
            .map_err(|e| AppError::Database(e.to_string()))
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

    let cover_path = {
        let config = state.lock().unwrap();
        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == library_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", library_id)))?;
        calibre::get_book_cover_path(&lib.path, &book_path)
    };

    let result = match cover_path {
        Some(path) => {
            let encoded = tauri::async_runtime::spawn_blocking(move || -> Result<String, AppError> {
                let data = fs::read(&path)?;
                let encoded = BASE64.encode(&data);
                Ok(format!("data:image/jpeg;base64,{}", encoded))
            })
            .await
            .map_err(|e| AppError::Io(std::io::Error::other(e)))??;
            Ok(Some(encoded))
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

