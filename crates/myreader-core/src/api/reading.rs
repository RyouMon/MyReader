use std::collections::BTreeMap;
use std::path::Path;

use crate::models::{
    LegacyFinishedReading, ReaderAnnotation, ReaderBookmark, ReadingPosition,
    ReadingPositionCandidate, ReadingStatistics,
};
use crate::{services, CoreError};

pub async fn list_favorite_book_ids(sidecar_root: &Path) -> Result<Vec<i64>, CoreError> {
    services::reading::list_favorite_book_ids(sidecar_root).await
}

pub async fn set_favorite_book(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    is_favorite: bool,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    services::reading::set_favorite_book(
        sidecar_root,
        library_root,
        book_id,
        is_favorite,
        recorded_at_ms,
    )
    .await
}

pub async fn get_reading_position(
    sidecar_root: &Path,
    book_id: i64,
    format: &str,
) -> Result<Option<ReadingPosition>, CoreError> {
    services::reading::get_reading_position(sidecar_root, book_id, format).await
}

pub async fn list_reading_positions(
    sidecar_root: &Path,
) -> Result<Vec<ReadingPosition>, CoreError> {
    services::reading::list_reading_positions(sidecar_root).await
}

pub async fn latest_read_at_by_book(sidecar_root: &Path) -> Result<BTreeMap<i64, f64>, CoreError> {
    services::reading::latest_read_at_by_book(sidecar_root).await
}

pub async fn set_reading_position(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    locator_json: &str,
    display_progression: Option<f64>,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    services::reading::set_reading_position(
        sidecar_root,
        library_root,
        book_id,
        format,
        locator_json,
        display_progression,
        recorded_at_ms,
    )
    .await
}

pub async fn list_reading_position_candidates(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    now_ms: i64,
) -> Result<Vec<ReadingPositionCandidate>, CoreError> {
    services::reading::list_reading_position_candidates(
        sidecar_root,
        library_root,
        book_id,
        format,
        now_ms,
    )
    .await
}

pub async fn select_reading_position_candidate(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    operation_id: &str,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    services::reading::select_reading_position_candidate(
        sidecar_root,
        library_root,
        book_id,
        format,
        operation_id,
        recorded_at_ms,
    )
    .await
}

pub async fn list_reader_bookmarks(
    sidecar_root: &Path,
    book_id: i64,
    format: &str,
) -> Result<Vec<ReaderBookmark>, CoreError> {
    services::reading::list_reader_bookmarks(sidecar_root, book_id, format).await
}

pub async fn add_reader_bookmark(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    locator_key: &str,
    locator_json: &str,
    recorded_at_ms: i64,
) -> Result<ReaderBookmark, CoreError> {
    services::reading::add_reader_bookmark(
        sidecar_root,
        library_root,
        book_id,
        format,
        locator_key,
        locator_json,
        recorded_at_ms,
    )
    .await
}

pub async fn remove_reader_bookmark(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    locator_key: &str,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    services::reading::remove_reader_bookmark(
        sidecar_root,
        library_root,
        book_id,
        format,
        locator_key,
        recorded_at_ms,
    )
    .await
}

pub async fn list_reader_annotations(
    sidecar_root: &Path,
    book_id: i64,
    format: &str,
) -> Result<Vec<ReaderAnnotation>, CoreError> {
    services::reading::list_reader_annotations(sidecar_root, book_id, format).await
}

#[allow(clippy::too_many_arguments)]
pub async fn add_reader_annotation(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    locator_json: &str,
    color: &str,
    note: Option<&str>,
    recorded_at_ms: i64,
) -> Result<ReaderAnnotation, CoreError> {
    services::reading::add_reader_annotation(
        sidecar_root,
        library_root,
        book_id,
        format,
        locator_json,
        color,
        note,
        recorded_at_ms,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_reader_annotation(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    id: &str,
    color: &str,
    note: Option<&str>,
    recorded_at_ms: i64,
) -> Result<ReaderAnnotation, CoreError> {
    services::reading::update_reader_annotation(
        sidecar_root,
        library_root,
        book_id,
        format,
        id,
        color,
        note,
        recorded_at_ms,
    )
    .await
}

pub async fn remove_reader_annotation(
    sidecar_root: &Path,
    library_root: &Path,
    book_id: i64,
    format: &str,
    id: &str,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    services::reading::remove_reader_annotation(
        sidecar_root,
        library_root,
        book_id,
        format,
        id,
        recorded_at_ms,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn add_reading_session_interval(
    sidecar_root: &Path,
    library_root: &Path,
    id: &str,
    book_id: i64,
    format: &str,
    local_day: &str,
    started_at_ms: i64,
    duration_seconds: i64,
    recorded_at_ms: i64,
) -> Result<(), CoreError> {
    services::reading::add_reading_session_interval(
        sidecar_root,
        library_root,
        id,
        book_id,
        format,
        local_day,
        started_at_ms,
        duration_seconds,
        recorded_at_ms,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn add_reading_completion(
    sidecar_root: &Path,
    library_root: &Path,
    id: &str,
    book_id: i64,
    format: &str,
    local_day: &str,
    completed_at_ms: i64,
    recorded_at_ms: i64,
) -> Result<bool, CoreError> {
    services::reading::add_reading_completion(
        sidecar_root,
        library_root,
        id,
        book_id,
        format,
        local_day,
        completed_at_ms,
        recorded_at_ms,
    )
    .await
}

pub async fn get_reading_statistics(
    sidecar_root: &Path,
    start_day: &str,
    end_day: &str,
) -> Result<ReadingStatistics, CoreError> {
    services::reading::get_reading_statistics(sidecar_root, start_day, end_day).await
}

pub async fn list_legacy_finished_readings(
    sidecar_root: &Path,
) -> Result<Vec<LegacyFinishedReading>, CoreError> {
    services::reading::list_legacy_finished_readings(sidecar_root).await
}
