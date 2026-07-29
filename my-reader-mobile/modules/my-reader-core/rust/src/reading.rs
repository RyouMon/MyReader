use std::path::Path;

use my_reader_core::api::reading::ReadingService;

use crate::{
    types::{
        required_i64, ReaderAnnotation, ReaderBookmark, ReaderLocatorJson, ReadingPosition,
        ReadingPositionCandidate, ReadingStatistics,
    },
    CoreFfiError,
};

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_list_favorite_book_ids(
    sidecar_root_path: String,
) -> Result<Vec<f64>, CoreFfiError> {
    Ok(
        ReadingService::list_favorite_book_ids(Path::new(&sidecar_root_path))
            .await
            .map_err(CoreFfiError::from_core)?
            .into_iter()
            .map(|value| value as f64)
            .collect(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_set_favorite_book(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    is_favorite: bool,
    recorded_at_ms: f64,
) -> Result<(), CoreFfiError> {
    ReadingService::set_favorite_book(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        is_favorite,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_get_position(
    sidecar_root_path: String,
    book_id: f64,
    format: String,
) -> Result<Option<ReadingPosition>, CoreFfiError> {
    Ok(ReadingService::get_reading_position(
        Path::new(&sidecar_root_path),
        required_i64(book_id, "bookId")?,
        &format,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .map(Into::into))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_list_positions(
    sidecar_root_path: String,
) -> Result<Vec<ReadingPosition>, CoreFfiError> {
    Ok(
        ReadingService::list_reading_positions(Path::new(&sidecar_root_path))
            .await
            .map_err(CoreFfiError::from_core)?
            .into_iter()
            .map(Into::into)
            .collect(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_set_position(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: String,
    locator: ReaderLocatorJson,
    display_progression: Option<f64>,
    recorded_at_ms: f64,
) -> Result<(), CoreFfiError> {
    ReadingService::set_reading_position(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
        &locator.0,
        display_progression,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_list_position_candidates(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: String,
    now_ms: f64,
) -> Result<Vec<ReadingPositionCandidate>, CoreFfiError> {
    Ok(ReadingService::list_reading_position_candidates(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
        required_i64(now_ms, "nowMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_select_position_candidate(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: String,
    operation_id: String,
    recorded_at_ms: f64,
) -> Result<(), CoreFfiError> {
    ReadingService::select_reading_position_candidate(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
        &operation_id,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_list_bookmarks(
    sidecar_root_path: String,
    book_id: f64,
    format: String,
) -> Result<Vec<ReaderBookmark>, CoreFfiError> {
    Ok(ReadingService::list_reader_bookmarks(
        Path::new(&sidecar_root_path),
        required_i64(book_id, "bookId")?,
        &format,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_add_bookmark(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: String,
    locator_key: String,
    locator: ReaderLocatorJson,
    recorded_at_ms: f64,
) -> Result<ReaderBookmark, CoreFfiError> {
    Ok(ReadingService::add_reader_bookmark(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
        &locator_key,
        &locator.0,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_remove_bookmark(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: String,
    locator_key: String,
    recorded_at_ms: f64,
) -> Result<(), CoreFfiError> {
    ReadingService::remove_reader_bookmark(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
        &locator_key,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_list_annotations(
    sidecar_root_path: String,
    book_id: f64,
    format: String,
) -> Result<Vec<ReaderAnnotation>, CoreFfiError> {
    Ok(ReadingService::list_reader_annotations(
        Path::new(&sidecar_root_path),
        required_i64(book_id, "bookId")?,
        &format,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_add_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: String,
    locator: ReaderLocatorJson,
    color: String,
    note: Option<String>,
    recorded_at_ms: f64,
) -> Result<ReaderAnnotation, CoreFfiError> {
    Ok(ReadingService::add_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
        &locator.0,
        &color,
        note.as_deref(),
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_update_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: String,
    id: String,
    color: String,
    note: Option<String>,
    recorded_at_ms: f64,
) -> Result<ReaderAnnotation, CoreFfiError> {
    Ok(ReadingService::update_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
        &id,
        &color,
        note.as_deref(),
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_remove_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: f64,
    format: String,
    id: String,
    recorded_at_ms: f64,
) -> Result<(), CoreFfiError> {
    ReadingService::remove_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
        &id,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_add_session_interval(
    sidecar_root_path: String,
    library_root_path: String,
    id: String,
    book_id: f64,
    format: String,
    local_day: String,
    started_at_ms: f64,
    duration_seconds: f64,
    recorded_at_ms: f64,
) -> Result<(), CoreFfiError> {
    ReadingService::add_reading_session_interval(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &id,
        required_i64(book_id, "bookId")?,
        &format,
        &local_day,
        required_i64(started_at_ms, "startedAtMs")?,
        required_i64(duration_seconds, "durationSeconds")?,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_add_completion(
    sidecar_root_path: String,
    library_root_path: String,
    id: String,
    book_id: f64,
    format: String,
    local_day: String,
    completed_at_ms: f64,
    recorded_at_ms: f64,
) -> Result<bool, CoreFfiError> {
    ReadingService::add_reading_completion(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &id,
        required_i64(book_id, "bookId")?,
        &format,
        &local_day,
        required_i64(completed_at_ms, "completedAtMs")?,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn reading_get_statistics(
    sidecar_root_path: String,
    library_root_path: String,
    start_day: String,
    end_day: String,
) -> Result<ReadingStatistics, CoreFfiError> {
    Ok(ReadingService::get_reading_statistics(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &start_day,
        &end_day,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}
