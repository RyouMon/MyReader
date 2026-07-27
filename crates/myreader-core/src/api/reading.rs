use std::collections::BTreeMap;
use std::path::Path;

use crate::models::{ReadingPosition, ReadingPositionCandidate};
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
