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
pub(super) enum CatalogSyncRequest {
    ValidateLibrary { library_root_path: String },
}

#[derive(Debug, Deserialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(
    tag = "operation",
    content = "input",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(super) enum CatalogAsyncRequest {
    CountBooks {
        library_root_path: String,
    },
    ListBooks {
        library_root_path: String,
    },
    ListBooksPage {
        library_root_path: String,
        offset: usize,
        limit: usize,
        sort_by: Option<String>,
        search: Option<String>,
    },
    ListBooksPageByLastRead {
        library_root_path: String,
        sidecar_root_path: String,
        offset: usize,
        limit: usize,
        search: Option<String>,
    },
    GetBookDetail {
        library_root_path: String,
        book_id: i64,
    },
    ListSeriesBooks {
        library_root_path: String,
        series_name: String,
        exclude_book_id: Option<i64>,
    },
    GetLibraryUuid {
        library_root_path: String,
    },
    ListBookSummaries {
        library_root_path: String,
    },
    ListBookFormats {
        library_root_path: String,
        book_id: i64,
    },
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum CatalogSyncResponse {
    ValidateLibrary(bool),
}

#[derive(Debug, Serialize)]
#[cfg_attr(feature = "typescript-contract", derive(specta::Type))]
#[serde(tag = "operation", content = "output", rename_all = "camelCase")]
pub(super) enum CatalogAsyncResponse {
    CountBooks(usize),
    ListBooks(Vec<myreader_core::models::BookEntry>),
    ListBooksPage(myreader_core::models::PaginatedBooks),
    ListBooksPageByLastRead(myreader_core::models::PaginatedBooks),
    GetBookDetail(myreader_core::models::BookDetail),
    ListSeriesBooks(Vec<myreader_core::models::BookEntry>),
    GetLibraryUuid(String),
    ListBookSummaries(Vec<myreader_core::models::BookSummary>),
    ListBookFormats(Vec<myreader_core::models::BookFormat>),
}

pub(super) fn handle_sync(
    request: CatalogSyncRequest,
) -> Result<CatalogSyncResponse, RustComponentsError> {
    Ok(match request {
        CatalogSyncRequest::ValidateLibrary { library_root_path } => {
            CatalogSyncResponse::ValidateLibrary(myreader_core::api::catalog::validate_library(
                Path::new(&library_root_path),
            ))
        }
    })
}

pub(super) fn handle_async(
    request: CatalogAsyncRequest,
) -> Result<CatalogAsyncResponse, RustComponentsError> {
    Ok(match request {
        CatalogAsyncRequest::CountBooks { library_root_path } => {
            CatalogAsyncResponse::CountBooks(run_core_async(
                myreader_core::api::catalog::count_books(Path::new(&library_root_path)),
            )?)
        }
        CatalogAsyncRequest::ListBooks { library_root_path } => {
            CatalogAsyncResponse::ListBooks(run_core_async(
                myreader_core::api::catalog::list_books(Path::new(&library_root_path)),
            )?)
        }
        CatalogAsyncRequest::ListBooksPage {
            library_root_path,
            offset,
            limit,
            sort_by,
            search,
        } => CatalogAsyncResponse::ListBooksPage(run_core_async(
            myreader_core::api::catalog::list_books_page(
                Path::new(&library_root_path),
                offset,
                limit,
                sort_by.as_deref(),
                search.as_deref(),
            ),
        )?),
        CatalogAsyncRequest::ListBooksPageByLastRead {
            library_root_path,
            sidecar_root_path,
            offset,
            limit,
            search,
        } => CatalogAsyncResponse::ListBooksPageByLastRead(run_core_async(
            myreader_core::api::catalog::list_books_page_by_last_read(
                Path::new(&library_root_path),
                Path::new(&sidecar_root_path),
                offset,
                limit,
                search.as_deref(),
            ),
        )?),
        CatalogAsyncRequest::GetBookDetail {
            library_root_path,
            book_id,
        } => CatalogAsyncResponse::GetBookDetail(run_core_async(
            myreader_core::api::catalog::get_book_detail(Path::new(&library_root_path), book_id),
        )?),
        CatalogAsyncRequest::ListSeriesBooks {
            library_root_path,
            series_name,
            exclude_book_id,
        } => CatalogAsyncResponse::ListSeriesBooks(run_core_async(
            myreader_core::api::catalog::list_series_books(
                Path::new(&library_root_path),
                &series_name,
                exclude_book_id,
            ),
        )?),
        CatalogAsyncRequest::GetLibraryUuid { library_root_path } => {
            CatalogAsyncResponse::GetLibraryUuid(run_core_async(
                myreader_core::api::catalog::get_library_uuid(Path::new(&library_root_path)),
            )?)
        }
        CatalogAsyncRequest::ListBookSummaries { library_root_path } => {
            CatalogAsyncResponse::ListBookSummaries(run_core_async(
                myreader_core::api::catalog::list_book_summaries(Path::new(&library_root_path)),
            )?)
        }
        CatalogAsyncRequest::ListBookFormats {
            library_root_path,
            book_id,
        } => CatalogAsyncResponse::ListBookFormats(run_core_async(
            myreader_core::api::catalog::list_book_formats(Path::new(&library_root_path), book_id),
        )?),
    })
}
