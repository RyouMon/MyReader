use super::*;

fn unix_epoch_millis() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

#[tauri::command]
pub fn get_reading_progress(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<Option<ReadingProgressDto>, AppError> {
    info!("Start to get reading progress. library id: {library_id:?}, book id: {book_id}, format: \"{format}\"");
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

        let conn = reading_progress::open_db(&app, &lib.path)?;
        reading_progress::get_progress(&conn, &lib_id, book_id, &format)
    })();

    match &result {
        Ok(progress) => info!(
            "Success to get reading progress. found: {}, book id: {}, format: \"{}\"",
            progress.is_some(),
            book_id,
            format
        ),
        Err(err) => error!(
            "Failed to get reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    result
}

#[tauri::command]
pub fn set_reading_progress(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
    locator: serde_json::Value,
) -> Result<(), AppError> {
    info!(
        "Start to set reading progress. library id: {library_id:?}, book id: {book_id}, format: \"{}\"",
        format
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

        let conn = reading_progress::open_db(&app, &lib.path)?;
        let now = unix_epoch_millis();
        reading_progress::set_progress(&conn, book_id, &format, &locator, now)
    })();

    match &result {
        Ok(()) => info!("Success to set reading progress. book id: {book_id}, format: \"{format}\""),
        Err(err) => error!(
            "Failed to set reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    result
}

