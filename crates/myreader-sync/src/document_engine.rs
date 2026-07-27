use std::str::FromStr;

use automerge::ChangeHash;
use serde::{Deserialize, Serialize};

use crate::document::{
    add_reading_completion, add_reading_session_duration, annotation_projections,
    apply_library_sidecar_incremental, bookmark_projections, create_annotation, delete_annotation,
    favorite_projections, library_identity, library_sidecar_changes_since, library_sidecar_heads,
    library_sidecar_missing_dependencies, load_library_sidecar_document,
    load_library_sidecar_document_bytes, reading_completion_projections,
    reading_completion_records, reading_position_candidates, reading_position_projections,
    reading_session_projections, resolve_reading_position, save_library_sidecar_document,
    save_library_sidecar_incremental, set_bookmark, set_favorite, set_library_identity,
    set_reading_position, update_annotation, validate_library_identity, AnnotationValue,
    BookmarkValue, FavoriteValue, LibrarySidecarAutomergeChange, ReadingCompletionValue,
    ReadingPositionCandidate, ReadingPositionProjection, ReadingPositionValue, ReadingSessionValue,
    LIBRARY_SIDECAR_SCHEMA_VERSION,
};
use crate::SyncError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteProjection {
    pub book_id: i64,
    pub value: FavoriteValue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPositionCandidateProjection {
    pub book_id: i64,
    pub format: String,
    pub operation_id: String,
    pub value: ReadingPositionValue,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentProjection {
    pub reading_positions: Vec<ReadingPositionProjection>,
    pub reading_position_candidates: Vec<ReadingPositionCandidateProjection>,
    pub favorites: Vec<FavoriteProjection>,
    pub bookmarks: Vec<BookmarkValue>,
    pub annotations: Vec<AnnotationValue>,
    pub reading_sessions: Vec<ReadingSessionValue>,
    pub reading_completion_records: Vec<ReadingCompletionValue>,
    pub reading_completions: Vec<ReadingCompletionValue>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentCommandResult {
    pub schema_version: u64,
    pub library_uuid: Option<String>,
    pub snapshot_bytes: Vec<u8>,
    pub heads: Vec<String>,
    pub incremental_bytes: Vec<u8>,
    pub changes: Vec<LibrarySidecarAutomergeChange>,
    pub missing_dependencies: Vec<String>,
    pub projection: DocumentProjection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentCommandRequest {
    pub replica_id: String,
    pub expected_library_uuid: Option<String>,
    pub base_heads: Vec<String>,
    pub command: DocumentCommand,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DocumentCommand {
    Inspect,
    InspectDependencies {
        heads: Vec<String>,
    },
    SetLibraryIdentity {
        library_uuid: String,
        recorded_at: i64,
    },
    SetReadingPosition {
        book_id: i64,
        value: ReadingPositionValue,
    },
    ResolveReadingPosition {
        book_id: i64,
        format: String,
        operation_id: String,
        recorded_at: i64,
    },
    SetFavorite {
        book_id: i64,
        value: FavoriteValue,
    },
    SetBookmark {
        value: BookmarkValue,
    },
    CreateAnnotation {
        value: AnnotationValue,
    },
    UpdateAnnotation {
        id: String,
        color: String,
        note: Option<String>,
        updated_at: i64,
    },
    DeleteAnnotation {
        id: String,
        deleted_at: i64,
    },
    AddReadingSessionDuration {
        value: ReadingSessionValue,
    },
    AddReadingCompletion {
        value: ReadingCompletionValue,
    },
    ApplyIncremental,
}

fn sync_error(message: impl Into<String>) -> SyncError {
    SyncError::Sync(message.into())
}

fn parse_heads(values: &[String]) -> Result<Vec<ChangeHash>, SyncError> {
    values
        .iter()
        .map(|value| {
            ChangeHash::from_str(value)
                .map_err(|error| sync_error(format!("Automerge head is invalid: {error}")))
        })
        .collect()
}

fn project_document(doc: &automerge::AutoCommit) -> Result<DocumentProjection, SyncError> {
    let reading_positions = reading_position_projections(doc)?;
    let mut position_candidates = Vec::new();
    for projection in &reading_positions {
        for ReadingPositionCandidate {
            operation_id,
            value,
        } in reading_position_candidates(doc, projection.book_id, &projection.value.format)?
        {
            position_candidates.push(ReadingPositionCandidateProjection {
                book_id: projection.book_id,
                format: projection.value.format.clone(),
                operation_id,
                value,
            });
        }
    }
    Ok(DocumentProjection {
        reading_positions,
        reading_position_candidates: position_candidates,
        favorites: favorite_projections(doc)?
            .into_iter()
            .map(|(book_id, value)| FavoriteProjection { book_id, value })
            .collect(),
        bookmarks: bookmark_projections(doc)?,
        annotations: annotation_projections(doc)?,
        reading_sessions: reading_session_projections(doc)?,
        reading_completion_records: reading_completion_records(doc)?,
        reading_completions: reading_completion_projections(doc)?,
    })
}

pub fn execute_document_command(
    snapshot: Option<&[u8]>,
    request: DocumentCommandRequest,
    payload: Option<&[u8]>,
) -> Result<DocumentCommandResult, SyncError> {
    let mut document = match snapshot {
        Some(bytes) => load_library_sidecar_document_bytes(bytes, &request.replica_id)?,
        None => load_library_sidecar_document(&request.replica_id)?,
    };
    if let Some(library_uuid) = request.expected_library_uuid.as_deref() {
        validate_library_identity(&document, library_uuid)?;
    }
    let base_heads = parse_heads(&request.base_heads)?;
    let dependency_heads = match request.command {
        DocumentCommand::Inspect => Vec::new(),
        DocumentCommand::InspectDependencies { ref heads } => parse_heads(heads)?,
        DocumentCommand::SetLibraryIdentity {
            ref library_uuid,
            recorded_at,
        } => {
            set_library_identity(&mut document, library_uuid, recorded_at)?;
            Vec::new()
        }
        DocumentCommand::SetReadingPosition { book_id, ref value } => {
            set_reading_position(&mut document, book_id, value)?;
            Vec::new()
        }
        DocumentCommand::ResolveReadingPosition {
            book_id,
            ref format,
            ref operation_id,
            recorded_at,
        } => {
            resolve_reading_position(&mut document, book_id, format, operation_id, recorded_at)?;
            Vec::new()
        }
        DocumentCommand::SetFavorite { book_id, ref value } => {
            set_favorite(&mut document, book_id, value)?;
            Vec::new()
        }
        DocumentCommand::SetBookmark { ref value } => {
            set_bookmark(&mut document, value)?;
            Vec::new()
        }
        DocumentCommand::CreateAnnotation { ref value } => {
            create_annotation(&mut document, value)?;
            Vec::new()
        }
        DocumentCommand::UpdateAnnotation {
            ref id,
            ref color,
            ref note,
            updated_at,
        } => {
            update_annotation(&mut document, id, color, note.as_deref(), updated_at)?;
            Vec::new()
        }
        DocumentCommand::DeleteAnnotation { ref id, deleted_at } => {
            delete_annotation(&mut document, id, deleted_at)?;
            Vec::new()
        }
        DocumentCommand::AddReadingSessionDuration { ref value } => {
            add_reading_session_duration(&mut document, value)?;
            Vec::new()
        }
        DocumentCommand::AddReadingCompletion { ref value } => {
            add_reading_completion(&mut document, value)?;
            Vec::new()
        }
        DocumentCommand::ApplyIncremental => {
            let bytes =
                payload.ok_or_else(|| sync_error("Automerge incremental payload is missing"))?;
            apply_library_sidecar_incremental(&mut document, bytes)?;
            Vec::new()
        }
    };
    if let Some(library_uuid) = request.expected_library_uuid.as_deref() {
        validate_library_identity(&document, library_uuid)?;
    }
    let missing_dependencies =
        library_sidecar_missing_dependencies(&mut document, &dependency_heads);
    let changes = library_sidecar_changes_since(&mut document, &base_heads);
    let incremental_bytes = save_library_sidecar_incremental(&mut document, &base_heads);
    let projection = project_document(&document)?;
    let heads = library_sidecar_heads(&mut document);
    let snapshot_bytes = save_library_sidecar_document(&mut document);
    Ok(DocumentCommandResult {
        schema_version: LIBRARY_SIDECAR_SCHEMA_VERSION,
        library_uuid: library_identity(&document)?,
        snapshot_bytes,
        heads,
        incremental_bytes,
        changes,
        missing_dependencies,
        projection,
    })
}
