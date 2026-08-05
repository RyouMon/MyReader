use std::path::Path;

use my_reader_core::api::catalog::CatalogService;

use crate::{
    types::{
        required_i64, required_usize, BookContent, BookDetail, BookEntry, BookFormat, BookSummary,
        ImportBookRequest, PaginatedBooks, UpdateBookMetadataRequest,
    },
    CoreFfiError,
};

#[uniffi::export]
pub fn catalog_validate_library(library_root_path: String) -> bool {
    CatalogService::validate_library(Path::new(&library_root_path))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_count_library_books(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
) -> Result<f64, CoreFfiError> {
    Ok(CatalogService::count_registered_library_books(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
    )
    .await
    .map_err(CoreFfiError::from_core)? as f64)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_library_books(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
) -> Result<Vec<BookEntry>, CoreFfiError> {
    Ok(CatalogService::list_registered_library_books(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_library_books_page(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    offset: f64,
    limit: f64,
    sort_by: Option<String>,
    search: Option<String>,
) -> Result<PaginatedBooks, CoreFfiError> {
    Ok(CatalogService::list_registered_library_books_page(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
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
pub async fn catalog_list_library_books_page_by_last_read(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    offset: f64,
    limit: f64,
    search: Option<String>,
) -> Result<PaginatedBooks, CoreFfiError> {
    Ok(
        CatalogService::list_registered_library_books_page_by_last_read(
            Path::new(&config_path),
            &library_id,
            Path::new(&sidecar_root_path),
            Path::new(&content_root_path),
            required_usize(offset, "offset")?,
            required_usize(limit, "limit")?,
            search.as_deref(),
        )
        .await
        .map_err(CoreFfiError::from_core)?
        .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_get_library_book_detail(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    book_id: f64,
) -> Result<BookDetail, CoreFfiError> {
    Ok(CatalogService::get_registered_library_book_detail(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        required_i64(book_id, "bookId")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_library_series_books(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    series_name: String,
    exclude_book_id: Option<f64>,
) -> Result<Vec<BookEntry>, CoreFfiError> {
    Ok(CatalogService::list_registered_library_series_books(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
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
pub async fn catalog_get_library_identity(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
) -> Result<String, CoreFfiError> {
    CatalogService::get_registered_library_identity(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_library_book_summaries(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
) -> Result<Vec<BookSummary>, CoreFfiError> {
    Ok(CatalogService::list_registered_library_book_summaries(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_library_book_formats(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    book_id: f64,
) -> Result<Vec<BookFormat>, CoreFfiError> {
    Ok(CatalogService::list_registered_library_book_formats(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        required_i64(book_id, "bookId")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_get_library_book_format(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    book_id: f64,
    format: String,
) -> Result<Option<BookFormat>, CoreFfiError> {
    Ok(CatalogService::get_registered_library_book_format(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        required_i64(book_id, "bookId")?,
        &format,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .map(Into::into))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_get_myreader_book_content(
    sidecar_root_path: String,
    content_root_path: String,
    book_id: f64,
    format: String,
) -> Result<BookContent, CoreFfiError> {
    Ok(CatalogService::get_myreader_book_content(
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        required_i64(book_id, "bookId")?,
        &format,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_import_local_book(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    request: ImportBookRequest,
) -> Result<BookEntry, CoreFfiError> {
    Ok(CatalogService::import_local_book(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        request.try_into()?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_stage_remote_book_import(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    request: ImportBookRequest,
) -> Result<BookEntry, CoreFfiError> {
    Ok(CatalogService::stage_remote_book_import(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        request.try_into()?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_update_local_book_metadata(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    request: UpdateBookMetadataRequest,
) -> Result<BookEntry, CoreFfiError> {
    Ok(CatalogService::update_local_book_metadata(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        request.try_into()?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_delete_local_book(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    book_id: f64,
    recorded_at_ms: f64,
) -> Result<(), CoreFfiError> {
    CatalogService::delete_local_book(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        required_i64(book_id, "bookId")?,
        required_i64(recorded_at_ms, "recordedAtMs")?,
    )
    .await
    .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_count_books(library_root_path: String) -> Result<f64, CoreFfiError> {
    Ok(CatalogService::count_books(Path::new(&library_root_path))
        .await
        .map_err(CoreFfiError::from_core)? as f64)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_books(library_root_path: String) -> Result<Vec<BookEntry>, CoreFfiError> {
    Ok(CatalogService::list_books(Path::new(&library_root_path))
        .await
        .map_err(CoreFfiError::from_core)?
        .into_iter()
        .map(Into::into)
        .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_books_page(
    library_root_path: String,
    offset: f64,
    limit: f64,
    sort_by: Option<String>,
    search: Option<String>,
) -> Result<PaginatedBooks, CoreFfiError> {
    Ok(CatalogService::list_books_page(
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
    Ok(CatalogService::list_books_page_by_last_read(
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
    Ok(CatalogService::get_book_detail(
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
    Ok(CatalogService::list_series_books(
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
    CatalogService::get_library_uuid(Path::new(&library_root_path))
        .await
        .map_err(CoreFfiError::from_core)
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_list_book_summaries(
    library_root_path: String,
) -> Result<Vec<BookSummary>, CoreFfiError> {
    Ok(
        CatalogService::list_book_summaries(Path::new(&library_root_path))
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
    Ok(CatalogService::list_book_formats(
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into_iter()
    .map(Into::into)
    .collect())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_get_book_format(
    library_root_path: String,
    book_id: f64,
    format: String,
) -> Result<Option<BookFormat>, CoreFfiError> {
    Ok(CatalogService::get_book_format(
        Path::new(&library_root_path),
        required_i64(book_id, "bookId")?,
        &format,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .map(Into::into))
}
