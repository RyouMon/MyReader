use tauri::{AppHandle, Manager, State};
use tracing::{error, info};

use crate::commands::AppState;
use crate::error::AppError;
use crate::models::FileStateDto;
use crate::services::download_service::DownloadService;

#[tauri::command]
#[specta::specta]
pub async fn check_book_file_state(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<FileStateDto, AppError> {
    info!(
        "Start to check book file state. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, format
    );

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Config(format!("APP_DATA_DIR_ERROR: {e}")))?;
    let config = {
        let guard = state.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    let result = DownloadService::check_file_state(
        &app_data_dir,
        &config,
        &library_id,
        book_id,
        &format,
    )
    .await;

    match &result {
        Ok(dto) => info!(
            "Success to check book file state. library id: \"{}\", book id: {}, format: \"{}\", state: \"{}\"",
            library_id, book_id, format, dto.local_state
        ),
        Err(err) => error!(
            "Failed to check book file state. library id: \"{}\", book id: {}, format: \"{}\", error: {}",
            library_id, book_id, format, err
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn download_book_file(
    app: AppHandle,
    state: State<'_, AppState>,
    service: State<'_, DownloadService>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<String, AppError> {
    let fmt = format.to_uppercase();
    info!(
        "Start to download book file. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, fmt
    );

    // Register the download as early as possible so that a cancel request that
    // arrives before the background task is spawned will still be honoured: the
    // cancellation receiver will already be signalled when the task starts.
    let cancel_rx = match service.start(&library_id, book_id, &fmt) {
        Some(rx) => rx,
        None => {
            info!(
                "Download already in progress, return existing path. library id: \"{}\", book id: {}, format: \"{}\"",
                library_id, book_id, fmt
            );
            return Ok(String::new());
        }
    };

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Config(format!("APP_DATA_DIR_ERROR: {e}")))?;
    let config = {
        let guard = state.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    let app_clone = app.clone();
    let library_id_clone = library_id.clone();
    let fmt_clone = fmt.clone();
    let service_clone = (*service).clone();

    tauri::async_runtime::spawn(async move {
        let result = DownloadService::execute_download(
            &app_clone,
            &app_data_dir,
            &config,
            &library_id_clone,
            book_id,
            &format,
            cancel_rx,
        )
        .await;

        if let Err(e) = &result {
            // Cancellation events are emitted by DownloadService; the command only
            // emits errors that happen before or outside the service call.
            if !matches!(e, AppError::Config(msg) if msg.starts_with("BOOK_DOWNLOAD_CANCELLED")) {
                DownloadService::emit_download_error(
                    &app_clone,
                    &library_id_clone,
                    book_id,
                    &fmt_clone,
                    e,
                );
            }
        }

        service_clone.finish(&library_id_clone, book_id, &fmt_clone);
        result
    });

    info!(
        "Download task spawned. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, fmt
    );

    Ok(String::new())
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_book_download(
    service: State<'_, DownloadService>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<bool, AppError> {
    let fmt = format.to_uppercase();
    info!(
        "Request to cancel book download. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, fmt
    );
    let cancelled = service.cancel(&library_id, book_id, &fmt);
    Ok(cancelled)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_local_book_file(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<(), AppError> {
    info!(
        "Start to delete local book file. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, format
    );

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Config(format!("APP_DATA_DIR_ERROR: {e}")))?;
    let config = {
        let guard = state.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    DownloadService::delete_local_file(
        &app_data_dir,
        &config,
        &library_id,
        book_id,
        &format,
    )
    .await?;

    info!(
        "Success to delete local book file. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, format
    );
    Ok(())
}
