use std::path::Path;

use crate::{run_core_async, RustComponentsError};

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeBookEntry {
    pub id: i64,
    pub title: String,
    pub title_sort: String,
    pub author_sort: String,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Option<String>,
    pub series_index: Option<f64>,
    pub formats: Vec<String>,
    pub has_cover: bool,
    pub path: String,
    pub timestamp: Option<String>,
    pub pubdate: Option<String>,
    pub last_modified: Option<String>,
    pub comment: Option<String>,
    pub publisher: Option<String>,
    pub languages: Vec<String>,
    pub rating: Option<i32>,
    pub uuid: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativePaginatedBooks {
    pub items: Vec<NativeBookEntry>,
    pub total: u64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeFormatSize {
    pub format: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeBookIdentifier {
    pub id_type: String,
    pub value: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeBookDetail {
    pub book: NativeBookEntry,
    pub format_sizes: Vec<NativeFormatSize>,
    pub identifiers: Vec<NativeBookIdentifier>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeBookSummary {
    pub id: i64,
    pub path: String,
    pub has_cover: bool,
    pub formats: Vec<String>,
    pub format_paths: Vec<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeBookFormat {
    pub format: String,
    pub name: String,
    pub size_bytes: i64,
    pub relative_path: String,
}

impl From<myreader_core::models::BookEntry> for NativeBookEntry {
    fn from(book: myreader_core::models::BookEntry) -> Self {
        Self {
            id: book.id,
            title: book.title,
            title_sort: book.title_sort,
            author_sort: book.author_sort,
            authors: book.authors,
            tags: book.tags,
            series: book.series,
            series_index: book.series_index,
            formats: book.formats,
            has_cover: book.has_cover,
            path: book.path,
            timestamp: book.timestamp,
            pubdate: book.pubdate,
            last_modified: book.last_modified,
            comment: book.comment,
            publisher: book.publisher,
            languages: book.languages,
            rating: book.rating,
            uuid: book.uuid,
        }
    }
}

impl TryFrom<myreader_core::models::PaginatedBooks> for NativePaginatedBooks {
    type Error = RustComponentsError;

    fn try_from(page: myreader_core::models::PaginatedBooks) -> Result<Self, Self::Error> {
        Ok(Self {
            items: page.items.into_iter().map(Into::into).collect(),
            total: u64::try_from(page.total).map_err(|error| {
                RustComponentsError::Core(format!("Invalid Calibre page total: {error}"))
            })?,
        })
    }
}

impl From<myreader_core::models::BookDetail> for NativeBookDetail {
    fn from(detail: myreader_core::models::BookDetail) -> Self {
        Self {
            book: detail.book.into(),
            format_sizes: detail
                .format_sizes
                .into_iter()
                .map(|size| NativeFormatSize {
                    format: size.format,
                    size_bytes: size.size_bytes,
                })
                .collect(),
            identifiers: detail
                .identifiers
                .into_iter()
                .map(|identifier| NativeBookIdentifier {
                    id_type: identifier.id_type,
                    value: identifier.value,
                })
                .collect(),
        }
    }
}

#[uniffi::export]
pub fn validate_calibre_library(library_root_path: String) -> bool {
    myreader_core::api::catalog::validate_library(Path::new(&library_root_path))
}

#[uniffi::export]
pub fn count_calibre_books(library_root_path: String) -> Result<u64, RustComponentsError> {
    let count = run_core_async(myreader_core::api::catalog::count_books(Path::new(
        &library_root_path,
    )))?;
    u64::try_from(count)
        .map_err(|error| RustComponentsError::Core(format!("Invalid Calibre book count: {error}")))
}

#[uniffi::export]
pub fn list_calibre_books(
    library_root_path: String,
) -> Result<Vec<NativeBookEntry>, RustComponentsError> {
    let books = run_core_async(myreader_core::api::catalog::list_books(Path::new(
        &library_root_path,
    )))?;
    Ok(books.into_iter().map(Into::into).collect())
}

#[uniffi::export]
pub fn list_calibre_books_page(
    library_root_path: String,
    offset: u64,
    limit: u64,
    sort_by: Option<String>,
    search: Option<String>,
) -> Result<NativePaginatedBooks, RustComponentsError> {
    let offset = usize::try_from(offset)
        .map_err(|error| RustComponentsError::Core(format!("Invalid page offset: {error}")))?;
    let limit = usize::try_from(limit)
        .map_err(|error| RustComponentsError::Core(format!("Invalid page limit: {error}")))?;
    let page = run_core_async(myreader_core::api::catalog::list_books_page(
        Path::new(&library_root_path),
        offset,
        limit,
        sort_by.as_deref(),
        search.as_deref(),
    ))?;
    page.try_into()
}

#[uniffi::export]
pub fn list_calibre_books_page_by_last_read(
    library_root_path: String,
    sidecar_root_path: String,
    offset: u64,
    limit: u64,
    search: Option<String>,
) -> Result<NativePaginatedBooks, RustComponentsError> {
    let offset = usize::try_from(offset)
        .map_err(|error| RustComponentsError::Core(format!("Invalid page offset: {error}")))?;
    let limit = usize::try_from(limit)
        .map_err(|error| RustComponentsError::Core(format!("Invalid page limit: {error}")))?;
    let page = run_core_async(myreader_core::api::catalog::list_books_page_by_last_read(
        Path::new(&library_root_path),
        Path::new(&sidecar_root_path),
        offset,
        limit,
        search.as_deref(),
    ))?;
    page.try_into()
}

#[uniffi::export]
pub fn get_calibre_book_detail(
    library_root_path: String,
    book_id: i64,
) -> Result<NativeBookDetail, RustComponentsError> {
    let detail = run_core_async(myreader_core::api::catalog::get_book_detail(
        Path::new(&library_root_path),
        book_id,
    ))?;
    Ok(detail.into())
}

#[uniffi::export]
pub fn list_calibre_series_books(
    library_root_path: String,
    series_name: String,
    exclude_book_id: Option<i64>,
) -> Result<Vec<NativeBookEntry>, RustComponentsError> {
    let books = run_core_async(myreader_core::api::catalog::list_series_books(
        Path::new(&library_root_path),
        &series_name,
        exclude_book_id,
    ))?;
    Ok(books.into_iter().map(Into::into).collect())
}

#[uniffi::export]
pub fn get_calibre_library_uuid(library_root_path: String) -> Result<String, RustComponentsError> {
    run_core_async(myreader_core::api::catalog::get_library_uuid(Path::new(
        &library_root_path,
    )))
}

#[uniffi::export]
pub fn list_calibre_book_summaries(
    library_root_path: String,
) -> Result<Vec<NativeBookSummary>, RustComponentsError> {
    let books = run_core_async(myreader_core::api::catalog::list_book_summaries(Path::new(
        &library_root_path,
    )))?;
    Ok(books
        .into_iter()
        .map(|book| NativeBookSummary {
            id: book.id,
            path: book.path,
            has_cover: book.has_cover,
            formats: book.formats,
            format_paths: book.format_paths,
        })
        .collect())
}

#[uniffi::export]
pub fn list_calibre_book_formats(
    library_root_path: String,
    book_id: i64,
) -> Result<Vec<NativeBookFormat>, RustComponentsError> {
    let formats = run_core_async(myreader_core::api::catalog::list_book_formats(
        Path::new(&library_root_path),
        book_id,
    ))?;
    Ok(formats
        .into_iter()
        .map(|format| NativeBookFormat {
            format: format.format,
            name: format.name,
            size_bytes: format.size_bytes,
            relative_path: format.relative_path,
        })
        .collect())
}

#[uniffi::export]
pub fn list_book_reading_formats(
    sidecar_root_path: String,
    library_root_path: String,
) -> Result<std::collections::HashMap<String, String>, RustComponentsError> {
    let formats = run_core_async(myreader_core::api::content::list_reading_formats(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
    ))?;
    Ok(formats.into_iter().collect())
}

#[uniffi::export]
pub fn set_book_reading_format(
    sidecar_root_path: String,
    library_root_path: String,
    book_id: i64,
    format: Option<String>,
) -> Result<(), RustComponentsError> {
    run_core_async(myreader_core::api::content::set_reading_format(
        Path::new(&sidecar_root_path),
        Path::new(&library_root_path),
        book_id,
        format.as_deref(),
    ))
}
