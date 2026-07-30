use std::{collections::HashMap, path::Path};

use crate::{run_core_async, serialize_core_json, RustComponentsError};

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeReadingPosition {
    pub book_id: i64,
    pub format: String,
    pub locator_json: String,
    pub display_progression: Option<f64>,
    pub updated_at: f64,
    pub conflict_count: i64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeReadingPositionCandidate {
    pub operation_id: String,
    pub locator_json: String,
    pub display_progression: Option<f64>,
    pub recorded_at: i64,
    pub replica_id: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeReaderBookmark {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    pub locator_key: String,
    pub locator_json: String,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeReaderAnnotation {
    pub id: String,
    pub book_id: i64,
    pub format: String,
    pub kind: String,
    pub locator_json: String,
    pub color: String,
    pub note: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeReadingStatistics {
    pub days: HashMap<String, i64>,
    pub total_duration_seconds: i64,
    pub longest_streak_days: u32,
    pub completed_books: i64,
}

impl TryFrom<myreader_core::models::ReadingPosition> for NativeReadingPosition {
    type Error = RustComponentsError;

    fn try_from(position: myreader_core::models::ReadingPosition) -> Result<Self, Self::Error> {
        Ok(Self {
            book_id: position.book_id,
            format: position.format,
            locator_json: serialize_core_json(&position.locator)?,
            display_progression: position.display_progression,
            updated_at: position.updated_at,
            conflict_count: position.conflict_count,
        })
    }
}

impl TryFrom<myreader_core::models::ReadingPositionCandidate> for NativeReadingPositionCandidate {
    type Error = RustComponentsError;

    fn try_from(
        candidate: myreader_core::models::ReadingPositionCandidate,
    ) -> Result<Self, Self::Error> {
        Ok(Self {
            operation_id: candidate.operation_id,
            locator_json: serialize_core_json(&candidate.locator)?,
            display_progression: candidate.display_progression,
            recorded_at: candidate.recorded_at,
            replica_id: candidate.replica_id,
        })
    }
}

impl TryFrom<myreader_core::models::ReaderBookmark> for NativeReaderBookmark {
    type Error = RustComponentsError;

    fn try_from(bookmark: myreader_core::models::ReaderBookmark) -> Result<Self, Self::Error> {
        Ok(Self {
            id: bookmark.id,
            book_id: bookmark.book_id,
            format: bookmark.format,
            locator_key: bookmark.locator_key,
            locator_json: serialize_core_json(&bookmark.locator)?,
            created_at: bookmark.created_at,
            updated_at: bookmark.updated_at,
        })
    }
}

impl TryFrom<myreader_core::models::ReaderAnnotation> for NativeReaderAnnotation {
    type Error = RustComponentsError;

    fn try_from(annotation: myreader_core::models::ReaderAnnotation) -> Result<Self, Self::Error> {
        Ok(Self {
            id: annotation.id,
            book_id: annotation.book_id,
            format: annotation.format,
            kind: annotation.kind,
            locator_json: serialize_core_json(&annotation.locator)?,
            color: annotation.color,
            note: annotation.note,
            created_at: annotation.created_at,
            updated_at: annotation.updated_at,
        })
    }
}

#[uniffi::export]
pub fn list_favorite_book_ids(sidecar_root_path: String) -> Result<Vec<i64>, RustComponentsError> {
    run_core_async(myreader_core::api::reading::list_favorite_book_ids(
        Path::new(&sidecar_root_path),
    ))
}

#[uniffi::export]
pub fn set_favorite_book(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    is_favorite: bool,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::set_favorite_book(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        is_favorite,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn get_reading_position(
    sidecar_root_path: String,
    book_id: i64,
    format: String,
) -> Result<Option<NativeReadingPosition>, RustComponentsError> {
    let position = run_core_async(myreader_core::api::reading::get_reading_position(
        Path::new(&sidecar_root_path),
        book_id,
        &format,
    ))?;
    position.map(TryInto::try_into).transpose()
}

#[uniffi::export]
pub fn list_reading_positions(
    sidecar_root_path: String,
) -> Result<Vec<NativeReadingPosition>, RustComponentsError> {
    let positions = run_core_async(myreader_core::api::reading::list_reading_positions(
        Path::new(&sidecar_root_path),
    ))?;
    positions.into_iter().map(TryInto::try_into).collect()
}

#[uniffi::export]
pub fn set_reading_position(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    locator_json: String,
    display_progression: Option<f64>,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::set_reading_position(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &locator_json,
        display_progression,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn list_reading_position_candidates(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    now_ms: i64,
) -> Result<Vec<NativeReadingPositionCandidate>, RustComponentsError> {
    let candidates = run_core_async(
        myreader_core::api::reading::list_reading_position_candidates(
            Path::new(&sidecar_root_path),
            Path::new(&library_root_path),
            book_id,
            &format,
            now_ms,
        ),
    )?;
    candidates.into_iter().map(TryInto::try_into).collect()
}

#[uniffi::export]
pub fn select_reading_position_candidate(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    operation_id: String,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(
        myreader_core::api::reading::select_reading_position_candidate(
            Path::new(&sidecar_root_path),
            Path::new(&library_root_path),
            book_id,
            &format,
            &operation_id,
            recorded_at_ms,
        ),
    )
}

#[uniffi::export]
pub fn list_reader_bookmarks(
    sidecar_root_path: String,
    book_id: i64,
    format: String,
) -> Result<Vec<NativeReaderBookmark>, RustComponentsError> {
    let bookmarks = run_core_async(myreader_core::api::reading::list_reader_bookmarks(
        Path::new(&sidecar_root_path),
        book_id,
        &format,
    ))?;
    bookmarks.into_iter().map(TryInto::try_into).collect()
}

#[uniffi::export]
pub fn add_reader_bookmark(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    locator_key: String,
    locator_json: String,
    recorded_at_ms: i64,
) -> Result<NativeReaderBookmark, RustComponentsError> {
    let bookmark = run_core_async(myreader_core::api::reading::add_reader_bookmark(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &locator_key,
        &locator_json,
        recorded_at_ms,
    ))?;
    bookmark.try_into()
}

#[uniffi::export]
pub fn remove_reader_bookmark(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    locator_key: String,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::remove_reader_bookmark(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &locator_key,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn list_reader_annotations(
    sidecar_root_path: String,
    book_id: i64,
    format: String,
) -> Result<Vec<NativeReaderAnnotation>, RustComponentsError> {
    let annotations = run_core_async(myreader_core::api::reading::list_reader_annotations(
        Path::new(&sidecar_root_path),
        book_id,
        &format,
    ))?;
    annotations.into_iter().map(TryInto::try_into).collect()
}

#[uniffi::export]
pub fn add_reader_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    locator_json: String,
    color: String,
    note: Option<String>,
    recorded_at_ms: i64,
) -> Result<NativeReaderAnnotation, RustComponentsError> {
    let annotation = run_core_async(myreader_core::api::reading::add_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &locator_json,
        &color,
        note.as_deref(),
        recorded_at_ms,
    ))?;
    annotation.try_into()
}

#[uniffi::export]
pub fn update_reader_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    id: String,
    color: String,
    note: Option<String>,
    recorded_at_ms: i64,
) -> Result<NativeReaderAnnotation, RustComponentsError> {
    let annotation = run_core_async(myreader_core::api::reading::update_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &id,
        &color,
        note.as_deref(),
        recorded_at_ms,
    ))?;
    annotation.try_into()
}

#[uniffi::export]
pub fn remove_reader_annotation(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: String,
    id: String,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::remove_reader_annotation(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        &format,
        &id,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn add_reading_session_interval(
    sidecar_root_path: String,
    library_root_path: String,
    id: String,
    book_id: i64,
    format: String,
    local_day: String,
    started_at_ms: i64,
    duration_seconds: i64,
    recorded_at_ms: i64,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::reading::add_reading_session_interval(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &id,
        book_id,
        &format,
        &local_day,
        started_at_ms,
        duration_seconds,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn add_reading_completion(
    sidecar_root_path: String,
    library_root_path: String,
    id: String,
    book_id: i64,
    format: String,
    local_day: String,
    completed_at_ms: i64,
    recorded_at_ms: i64,
) -> Result<bool, RustComponentsError> {
    run_core_async(myreader_core::api::reading::add_reading_completion(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &id,
        book_id,
        &format,
        &local_day,
        completed_at_ms,
        recorded_at_ms,
    ))
}

#[uniffi::export]
pub fn get_reading_statistics(
    sidecar_root_path: String,
    library_root_path: String,
    start_day: String,
    end_day: String,
) -> Result<NativeReadingStatistics, RustComponentsError> {
    let statistics = run_core_async(myreader_core::api::reading::get_reading_statistics(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        &start_day,
        &end_day,
    ))?;
    Ok(NativeReadingStatistics {
        days: statistics.days.into_iter().collect(),
        total_duration_seconds: statistics.total_duration_seconds,
        longest_streak_days: statistics.longest_streak_days,
        completed_books: i64::try_from(statistics.completed_books).map_err(|error| {
            RustComponentsError::Core(format!("Invalid completed book count: {error}"))
        })?,
    })
}
