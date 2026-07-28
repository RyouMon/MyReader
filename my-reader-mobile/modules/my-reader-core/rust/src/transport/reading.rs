use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{run_core_async, serialize_core_json, CoreFfiError};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(
    tag = "operation",
    content = "input",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum ReadingRequest {
    ListFavoriteBookIds {
        sidecar_root_path: String,
    },
    SetFavoriteBook {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        is_favorite: bool,
        recorded_at_ms: i64,
    },
    GetReadingPosition {
        sidecar_root_path: String,
        book_id: i64,
        format: String,
    },
    ListReadingPositions {
        sidecar_root_path: String,
    },
    SetReadingPosition {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: String,
        #[cfg_attr(
            feature = "typescript-contract",
            specta(type = my_reader_core::models::typescript_contract::ReaderLocator)
        )]
        locator: serde_json::Value,
        display_progression: Option<f64>,
        recorded_at_ms: i64,
    },
    ListReadingPositionCandidates {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: String,
        now_ms: i64,
    },
    SelectReadingPositionCandidate {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: String,
        operation_id: String,
        recorded_at_ms: i64,
    },
    ListReaderBookmarks {
        sidecar_root_path: String,
        book_id: i64,
        format: String,
    },
    AddReaderBookmark {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: String,
        locator_key: String,
        #[cfg_attr(
            feature = "typescript-contract",
            specta(type = my_reader_core::models::typescript_contract::ReaderLocator)
        )]
        locator: serde_json::Value,
        recorded_at_ms: i64,
    },
    RemoveReaderBookmark {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: String,
        locator_key: String,
        recorded_at_ms: i64,
    },
    ListReaderAnnotations {
        sidecar_root_path: String,
        book_id: i64,
        format: String,
    },
    AddReaderAnnotation {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: String,
        #[cfg_attr(
            feature = "typescript-contract",
            specta(type = my_reader_core::models::typescript_contract::ReaderLocator)
        )]
        locator: serde_json::Value,
        #[cfg_attr(
            feature = "typescript-contract",
            specta(type = my_reader_core::models::typescript_contract::ReaderAnnotationColor)
        )]
        color: String,
        note: Option<String>,
        recorded_at_ms: i64,
    },
    UpdateReaderAnnotation {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: String,
        id: String,
        #[cfg_attr(
            feature = "typescript-contract",
            specta(type = my_reader_core::models::typescript_contract::ReaderAnnotationColor)
        )]
        color: String,
        note: Option<String>,
        recorded_at_ms: i64,
    },
    RemoveReaderAnnotation {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: String,
        id: String,
        recorded_at_ms: i64,
    },
    AddReadingSessionInterval {
        sidecar_root_path: String,
        library_root_path: String,
        id: String,
        book_id: i64,
        format: String,
        local_day: String,
        started_at_ms: i64,
        duration_seconds: i64,
        recorded_at_ms: i64,
    },
    AddReadingCompletion {
        sidecar_root_path: String,
        library_root_path: String,
        id: String,
        book_id: i64,
        format: String,
        local_day: String,
        completed_at_ms: i64,
        recorded_at_ms: i64,
    },
    GetReadingStatistics {
        sidecar_root_path: String,
        library_root_path: String,
        start_day: String,
        end_day: String,
    },
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum ReadingResponse {
    ListFavoriteBookIds(Vec<i64>),
    SetFavoriteBook(()),
    GetReadingPosition(Option<my_reader_core::models::ReadingPosition>),
    ListReadingPositions(Vec<my_reader_core::models::ReadingPosition>),
    SetReadingPosition(()),
    ListReadingPositionCandidates(Vec<my_reader_core::models::ReadingPositionCandidate>),
    SelectReadingPositionCandidate(()),
    ListReaderBookmarks(Vec<my_reader_core::models::ReaderBookmark>),
    AddReaderBookmark(my_reader_core::models::ReaderBookmark),
    RemoveReaderBookmark(()),
    ListReaderAnnotations(Vec<my_reader_core::models::ReaderAnnotation>),
    AddReaderAnnotation(my_reader_core::models::ReaderAnnotation),
    UpdateReaderAnnotation(my_reader_core::models::ReaderAnnotation),
    RemoveReaderAnnotation(()),
    AddReadingSessionInterval(()),
    AddReadingCompletion(bool),
    GetReadingStatistics(my_reader_core::models::ReadingStatistics),
}

pub(super) fn handle(request: ReadingRequest) -> Result<ReadingResponse, CoreFfiError> {
    Ok(match request {
        ReadingRequest::ListFavoriteBookIds { sidecar_root_path } => {
            ReadingResponse::ListFavoriteBookIds(run_core_async(
                my_reader_core::api::reading::list_favorite_book_ids(Path::new(&sidecar_root_path)),
            )?)
        }
        ReadingRequest::SetFavoriteBook {
            sidecar_root_path,
            library_root_path,
            book_id,
            is_favorite,
            recorded_at_ms,
        } => ReadingResponse::SetFavoriteBook(run_core_async(
            my_reader_core::api::reading::set_favorite_book(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                is_favorite,
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::GetReadingPosition {
            sidecar_root_path,
            book_id,
            format,
        } => ReadingResponse::GetReadingPosition(run_core_async(
            my_reader_core::api::reading::get_reading_position(
                Path::new(&sidecar_root_path),
                book_id,
                &format,
            ),
        )?),
        ReadingRequest::ListReadingPositions { sidecar_root_path } => {
            ReadingResponse::ListReadingPositions(run_core_async(
                my_reader_core::api::reading::list_reading_positions(Path::new(&sidecar_root_path)),
            )?)
        }
        ReadingRequest::SetReadingPosition {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
            locator,
            display_progression,
            recorded_at_ms,
        } => ReadingResponse::SetReadingPosition(run_core_async(
            my_reader_core::api::reading::set_reading_position(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                &format,
                &serialize_core_json(&locator)?,
                display_progression,
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::ListReadingPositionCandidates {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
            now_ms,
        } => ReadingResponse::ListReadingPositionCandidates(run_core_async(
            my_reader_core::api::reading::list_reading_position_candidates(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                &format,
                now_ms,
            ),
        )?),
        ReadingRequest::SelectReadingPositionCandidate {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
            operation_id,
            recorded_at_ms,
        } => ReadingResponse::SelectReadingPositionCandidate(run_core_async(
            my_reader_core::api::reading::select_reading_position_candidate(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                &format,
                &operation_id,
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::ListReaderBookmarks {
            sidecar_root_path,
            book_id,
            format,
        } => ReadingResponse::ListReaderBookmarks(run_core_async(
            my_reader_core::api::reading::list_reader_bookmarks(
                Path::new(&sidecar_root_path),
                book_id,
                &format,
            ),
        )?),
        ReadingRequest::AddReaderBookmark {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
            locator_key,
            locator,
            recorded_at_ms,
        } => ReadingResponse::AddReaderBookmark(run_core_async(
            my_reader_core::api::reading::add_reader_bookmark(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                &format,
                &locator_key,
                &serialize_core_json(&locator)?,
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::RemoveReaderBookmark {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
            locator_key,
            recorded_at_ms,
        } => ReadingResponse::RemoveReaderBookmark(run_core_async(
            my_reader_core::api::reading::remove_reader_bookmark(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                &format,
                &locator_key,
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::ListReaderAnnotations {
            sidecar_root_path,
            book_id,
            format,
        } => ReadingResponse::ListReaderAnnotations(run_core_async(
            my_reader_core::api::reading::list_reader_annotations(
                Path::new(&sidecar_root_path),
                book_id,
                &format,
            ),
        )?),
        ReadingRequest::AddReaderAnnotation {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
            locator,
            color,
            note,
            recorded_at_ms,
        } => ReadingResponse::AddReaderAnnotation(run_core_async(
            my_reader_core::api::reading::add_reader_annotation(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                &format,
                &serialize_core_json(&locator)?,
                &color,
                note.as_deref(),
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::UpdateReaderAnnotation {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
            id,
            color,
            note,
            recorded_at_ms,
        } => ReadingResponse::UpdateReaderAnnotation(run_core_async(
            my_reader_core::api::reading::update_reader_annotation(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                &format,
                &id,
                &color,
                note.as_deref(),
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::RemoveReaderAnnotation {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
            id,
            recorded_at_ms,
        } => ReadingResponse::RemoveReaderAnnotation(run_core_async(
            my_reader_core::api::reading::remove_reader_annotation(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                &format,
                &id,
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::AddReadingSessionInterval {
            sidecar_root_path,
            library_root_path,
            id,
            book_id,
            format,
            local_day,
            started_at_ms,
            duration_seconds,
            recorded_at_ms,
        } => ReadingResponse::AddReadingSessionInterval(run_core_async(
            my_reader_core::api::reading::add_reading_session_interval(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                &id,
                book_id,
                &format,
                &local_day,
                started_at_ms,
                duration_seconds,
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::AddReadingCompletion {
            sidecar_root_path,
            library_root_path,
            id,
            book_id,
            format,
            local_day,
            completed_at_ms,
            recorded_at_ms,
        } => ReadingResponse::AddReadingCompletion(run_core_async(
            my_reader_core::api::reading::add_reading_completion(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                &id,
                book_id,
                &format,
                &local_day,
                completed_at_ms,
                recorded_at_ms,
            ),
        )?),
        ReadingRequest::GetReadingStatistics {
            sidecar_root_path,
            library_root_path,
            start_day,
            end_day,
        } => ReadingResponse::GetReadingStatistics(run_core_async(
            my_reader_core::api::reading::get_reading_statistics(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                &start_day,
                &end_day,
            ),
        )?),
    })
}
