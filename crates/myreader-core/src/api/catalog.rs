use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::models::{BookDetail, BookEntry, BookFormat, BookSummary, PaginatedBooks};
use crate::{services, CoreError};

pub fn validate_library(library_root: &Path) -> bool {
    services::catalog::validate_library(library_root)
}

pub async fn list_books(library_root: &Path) -> Result<Vec<BookEntry>, CoreError> {
    services::catalog::list_books(library_root).await
}

pub async fn list_books_page(
    library_root: &Path,
    offset: usize,
    limit: usize,
    sort_by: Option<&str>,
    search: Option<&str>,
) -> Result<PaginatedBooks, CoreError> {
    services::catalog::list_books_page(library_root, offset, limit, sort_by, search).await
}

pub async fn list_books_page_by_last_read(
    library_root: &Path,
    sidecar_root: &Path,
    offset: usize,
    limit: usize,
    search: Option<&str>,
) -> Result<PaginatedBooks, CoreError> {
    services::catalog::list_books_page_by_last_read(
        library_root,
        sidecar_root,
        offset,
        limit,
        search,
    )
    .await
}

pub async fn get_book_detail(library_root: &Path, book_id: i64) -> Result<BookDetail, CoreError> {
    services::catalog::get_book_detail(library_root, book_id).await
}

pub async fn list_series_books(
    library_root: &Path,
    series_name: &str,
    exclude_book_id: Option<i64>,
) -> Result<Vec<BookEntry>, CoreError> {
    services::catalog::list_series_books(library_root, series_name, exclude_book_id).await
}

pub async fn count_books(library_root: &Path) -> Result<usize, CoreError> {
    services::catalog::count_books(library_root).await
}

pub async fn get_library_uuid(library_root: &Path) -> Result<String, CoreError> {
    services::catalog::get_library_uuid(library_root).await
}

pub async fn list_book_summaries(library_root: &Path) -> Result<Vec<BookSummary>, CoreError> {
    services::catalog::list_book_summaries(library_root).await
}

pub async fn list_book_formats(
    library_root: &Path,
    book_id: i64,
) -> Result<Vec<BookFormat>, CoreError> {
    services::catalog::list_book_formats(library_root, book_id).await
}

pub async fn get_book_file_path(
    library_root: &Path,
    book_id: i64,
    format: &str,
) -> Result<Option<PathBuf>, CoreError> {
    services::catalog::get_book_file_path(library_root, book_id, format).await
}

pub async fn get_book_file_paths(
    library_root: &Path,
    requests: &[(i64, String)],
) -> Result<HashMap<(i64, String), PathBuf>, CoreError> {
    services::catalog::get_book_file_paths(library_root, requests).await
}

pub async fn get_book_cover_path(
    library_root: &Path,
    book_path: &str,
) -> Result<Option<PathBuf>, CoreError> {
    services::catalog::get_book_cover_path(library_root, book_path).await
}

pub async fn get_book_cover_bytes(
    library_root: &Path,
    book_path: &str,
) -> Result<Option<Vec<u8>>, CoreError> {
    services::catalog::get_book_cover_bytes(library_root, book_path).await
}
