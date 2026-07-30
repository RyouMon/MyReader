use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::{run_core_async, RustComponentsError};

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(
    tag = "operation",
    content = "input",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum ContentRequest {
    ListReadingFormats {
        sidecar_root_path: String,
        library_root_path: String,
    },
    SetReadingFormat {
        sidecar_root_path: String,
        library_root_path: String,
        book_id: i64,
        format: Option<String>,
    },
    GetFileState {
        sidecar_root_path: String,
        path: String,
    },
    ListFileStates {
        sidecar_root_path: String,
    },
    UpsertFileState {
        sidecar_root_path: String,
        path: String,
        update: myreader_core::models::FileStateUpdate,
    },
    DeleteFileState {
        sidecar_root_path: String,
        path: String,
    },
    FinalizeDownloadedFile {
        sidecar_root_path: String,
        relative_path: String,
        local_path: String,
    },
    MarkFileRemoteOnly {
        sidecar_root_path: String,
        relative_path: String,
    },
    ListCoverThumbnailCache {
        sidecar_root_path: String,
        thumbnail_version: String,
        width_px: i64,
        height_px: i64,
    },
    UpsertCoverThumbnailCache {
        sidecar_root_path: String,
        patch: myreader_core::models::BookCoverThumbnailCachePatch,
    },
    DeleteCoverThumbnailCache {
        sidecar_root_path: String,
        book_id: i64,
        thumbnail_version: String,
        width_px: i64,
        height_px: i64,
    },
    ClearCoverThumbnailCache {
        sidecar_root_path: String,
    },
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum ContentResponse {
    ListReadingFormats(std::collections::BTreeMap<String, String>),
    SetReadingFormat(()),
    GetFileState(Option<myreader_core::models::FileState>),
    ListFileStates(Vec<myreader_core::models::FileState>),
    UpsertFileState(()),
    DeleteFileState(()),
    FinalizeDownloadedFile(myreader_core::models::DownloadedFile),
    MarkFileRemoteOnly(()),
    ListCoverThumbnailCache(Vec<myreader_core::models::BookCoverThumbnailCache>),
    UpsertCoverThumbnailCache(()),
    DeleteCoverThumbnailCache(()),
    ClearCoverThumbnailCache(()),
}

pub(super) fn handle(request: ContentRequest) -> Result<ContentResponse, RustComponentsError> {
    Ok(match request {
        ContentRequest::ListReadingFormats {
            sidecar_root_path,
            library_root_path,
        } => ContentResponse::ListReadingFormats(run_core_async(
            myreader_core::api::content::list_reading_formats(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
            ),
        )?),
        ContentRequest::SetReadingFormat {
            sidecar_root_path,
            library_root_path,
            book_id,
            format,
        } => ContentResponse::SetReadingFormat(run_core_async(
            myreader_core::api::content::set_reading_format(
                Path::new(&sidecar_root_path),
                Path::new(&library_root_path),
                book_id,
                format.as_deref(),
            ),
        )?),
        ContentRequest::GetFileState {
            sidecar_root_path,
            path,
        } => ContentResponse::GetFileState(run_core_async(
            myreader_core::api::content::get_file_state(Path::new(&sidecar_root_path), &path),
        )?),
        ContentRequest::ListFileStates { sidecar_root_path } => {
            ContentResponse::ListFileStates(run_core_async(
                myreader_core::api::content::list_file_states(Path::new(&sidecar_root_path)),
            )?)
        }
        ContentRequest::UpsertFileState {
            sidecar_root_path,
            path,
            update,
        } => ContentResponse::UpsertFileState(run_core_async(
            myreader_core::api::content::upsert_file_state(
                Path::new(&sidecar_root_path),
                &path,
                update,
            ),
        )?),
        ContentRequest::DeleteFileState {
            sidecar_root_path,
            path,
        } => ContentResponse::DeleteFileState(run_core_async(
            myreader_core::api::content::delete_file_state(Path::new(&sidecar_root_path), &path),
        )?),
        ContentRequest::FinalizeDownloadedFile {
            sidecar_root_path,
            relative_path,
            local_path,
        } => ContentResponse::FinalizeDownloadedFile(run_core_async(
            myreader_core::api::content::finalize_downloaded_file(
                Path::new(&sidecar_root_path),
                &relative_path,
                Path::new(&local_path),
            ),
        )?),
        ContentRequest::MarkFileRemoteOnly {
            sidecar_root_path,
            relative_path,
        } => ContentResponse::MarkFileRemoteOnly(run_core_async(
            myreader_core::api::content::mark_file_remote_only(
                Path::new(&sidecar_root_path),
                &relative_path,
            ),
        )?),
        ContentRequest::ListCoverThumbnailCache {
            sidecar_root_path,
            thumbnail_version,
            width_px,
            height_px,
        } => ContentResponse::ListCoverThumbnailCache(run_core_async(
            myreader_core::api::content::list_cover_thumbnail_cache(
                Path::new(&sidecar_root_path),
                &thumbnail_version,
                width_px,
                height_px,
            ),
        )?),
        ContentRequest::UpsertCoverThumbnailCache {
            sidecar_root_path,
            patch,
        } => ContentResponse::UpsertCoverThumbnailCache(run_core_async(
            myreader_core::api::content::upsert_cover_thumbnail_cache(
                Path::new(&sidecar_root_path),
                patch,
            ),
        )?),
        ContentRequest::DeleteCoverThumbnailCache {
            sidecar_root_path,
            book_id,
            thumbnail_version,
            width_px,
            height_px,
        } => ContentResponse::DeleteCoverThumbnailCache(run_core_async(
            myreader_core::api::content::delete_cover_thumbnail_cache(
                Path::new(&sidecar_root_path),
                book_id,
                &thumbnail_version,
                width_px,
                height_px,
            ),
        )?),
        ContentRequest::ClearCoverThumbnailCache { sidecar_root_path } => {
            ContentResponse::ClearCoverThumbnailCache(run_core_async(
                myreader_core::api::content::clear_cover_thumbnail_cache(Path::new(
                    &sidecar_root_path,
                )),
            )?)
        }
    })
}
