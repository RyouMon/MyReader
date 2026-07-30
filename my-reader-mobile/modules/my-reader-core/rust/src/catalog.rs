use std::path::Path;

use crate::{
    types::{
        required_i64, required_usize, BookDetail, BookEntry, BookFormat, BookSummary,
        PaginatedBooks,
    },
    CoreFfiError,
};

#[uniffi::export]
pub fn catalog_validate_library(library_root_path: String) -> bool {
    my_reader_core::api::catalog::validate_library(Path::new(&library_root_path))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_count_books(library_root_path: String) -> Result<f64, CoreFfiError> {
    Ok(
        my_reader_core::api::catalog::count_books(Path::new(&library_root_path))
            .await
            .map_err(CoreFfiError::from_core)? as f64,
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_books(library_root_path: String) -> Result<Vec<BookEntry>, CoreFfiError> {
    Ok(
        my_reader_core::api::catalog::list_books(Path::new(&library_root_path))
            .await
            .map_err(CoreFfiError::from_core)?
            .into_iter()
            .map(Into::into)
            .collect(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_books_page(
    library_root_path: String,
    offset: f64,
    limit: f64,
    sort_by: Option<String>,
    search: Option<String>,
) -> Result<PaginatedBooks, CoreFfiError> {
    Ok(my_reader_core::api::catalog::list_books_page(
        Path::new(&library_root_path),
        required_usize(offset, "offset")?,
        required_usize(limit, "limit")?,
        sort_by.as_deref(),
        search.as_deref(),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_books_page_by_last_read(
    library_root_path: String,
    sidecar_root_path: String,
    offset: f64,
    limit: f64,
    search: Option<String>,
) -> Result<PaginatedBooks, CoreFfiError> {
    Ok(my_reader_core::api::catalog::list_books_page_by_last_read(
        Path::new(&library_root_path),
        Path::new(&sidecar_root_path),
        required_usize(offset, "offset")?,
        required_usize(limit, "limit")?,
        search.as_deref(),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_get_book_detail(
    library_root_path: String,
    book_id: f64,
) -> Result<BookDetail, CoreFfiError> {
    Ok(my_reader_core::api::catalog::get_book_detail(
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_series_books(
    library_root_path: String,
    series_name: String,
    exclude_book_id: Option<f64>,
) -> Result<Vec<BookEntry>, CoreFfiError> {
    Ok(my_reader_core::api::catalog::list_series_books(
        Path::new(&library_root_path),
        &series_name,
        exclude_book_id
            .map(|value| required_i64(value, "excludeBookId"))
            .transpose()?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_get_library_uuid(library_root_path: String) -> Result<String, CoreFfiError> {
    my_reader_core::api::catalog::get_library_uuid(Path::new(&library_root_path))
        .await
        .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_book_summaries(
    library_root_path: String,
) -> Result<Vec<BookSummary>, CoreFfiError> {
    Ok(
        my_reader_core::api::catalog::list_book_summaries(Path::new(&library_root_path))
            .await
            .map_err(CoreFfiError::from_core)?
            .into_iter()
            .map(Into::into)
            .collect(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_book_formats(
    library_root_path: String,
    book_id: f64,
) -> Result<Vec<BookFormat>, CoreFfiError> {
    Ok(my_reader_core::api::catalog::list_book_formats(
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}
