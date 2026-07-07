use tauri::{AppHandle, State};
use tracing::{error, info};

use crate::commands::common;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{BookFileStateDto, FileStateDto, FileStateRequestDto};
use crate::services::download_service::DownloadService;

#[tauri::command]
#[specta::specta]
pub async fn check_book_file_state<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    service: State<'_, DownloadService>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<FileStateDto, AppError> {
    info!(
        "Start to check book file state. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, format
    );

    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);

    let result = service
        .check_file_state_with_active_download(
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
pub async fn check_book_file_states<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    service: State<'_, DownloadService>,
    library_id: String,
    requests: Vec<FileStateRequestDto>,
) -> Result<Vec<BookFileStateDto>, AppError> {
    info!(
        "Start to check book file states. library id: \"{}\", count: {}",
        library_id,
        requests.len()
    );

    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);

    let result = service
        .check_file_states_with_active_download(&app_data_dir, &config, &library_id, &requests)
        .await;

    match &result {
        Ok(rows) => info!(
            "Success to check book file states. library id: \"{}\", count: {}",
            library_id,
            rows.len()
        ),
        Err(err) => error!(
            "Failed to check book file states. library id: \"{}\", error: {}",
            library_id, err
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn download_book_file<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    service: State<'_, DownloadService>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<String, AppError> {
    info!(
        "Start to download book file. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, format
    );

    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);

    let result = service
        .enqueue_book_file_download(&app, &app_data_dir, &config, &library_id, book_id, &format)
        .await;

    match &result {
        Ok(_) => info!(
            "Download task enqueued. library id: \"{}\", book id: {}, format: \"{}\"",
            library_id, book_id, format
        ),
        Err(err) => error!(
            "Failed to enqueue book download. library id: \"{}\", book id: {}, format: \"{}\", error: {}",
            library_id, book_id, format, err
        ),
    }

    result
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_book_download<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
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
    let config = common::config_snapshot(&state);
    service.cancel_book_download(&app, &config, &library_id, book_id, &fmt)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_local_book_file<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    library_id: String,
    book_id: i64,
    format: String,
) -> Result<(), AppError> {
    info!(
        "Start to delete local book file. library id: \"{}\", book id: {}, format: \"{}\"",
        library_id, book_id, format
    );

    let app_data_dir = common::app_data_dir(&app)?;
    let config = common::config_snapshot(&state);

    DownloadService::delete_local_book_file(
        &app,
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
