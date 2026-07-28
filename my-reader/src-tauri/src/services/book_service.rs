use crate::error::AppError;
use std::path::Path;

use crate::models::{BookDetail, BookEntry, PaginatedBooks};

pub struct BookService;

impl BookService {
    pub async fn get_books(lib_path: &str) -> Result<Vec<BookEntry>, AppError> {
        Ok(
            my_reader_core::api::catalog::list_books(Path::new(lib_path))
                .await?
                .into_iter()
                .map(Into::into)
                .collect(),
        )
    }

    pub async fn get_books_page(
        lib_path: &str,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        Ok(my_reader_core::api::catalog::list_books_page(
            Path::new(lib_path),
            offset,
            limit,
            sort_by,
            search,
        )
        .await?
        .into())
    }

    pub async fn get_books_page_by_last_read(
        lib_path: &str,
        sidecar_root: &str,
        offset: usize,
        limit: usize,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        Ok(my_reader_core::api::catalog::list_books_page_by_last_read(
            Path::new(lib_path),
            Path::new(sidecar_root),
            offset,
            limit,
            search,
        )
        .await?
        .into())
    }

    pub async fn get_book_detail(lib_path: &str, book_id: i64) -> Result<BookDetail, AppError> {
        Ok(
            my_reader_core::api::catalog::get_book_detail(Path::new(lib_path), book_id)
                .await?
                .into(),
        )
    }

    pub async fn get_series_books(
        lib_path: &str,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError> {
        Ok(my_reader_core::api::catalog::list_series_books(
            Path::new(lib_path),
            series_name,
            exclude_book_id,
        )
        .await?
        .into_iter()
        .map(Into::into)
        .collect())
    }

    pub async fn get_book_cover_bytes(
        lib_path: &str,
        book_path: &str,
    ) -> Result<Option<Vec<u8>>, AppError> {
        Ok(
            my_reader_core::api::catalog::get_book_cover_bytes(Path::new(lib_path), book_path)
                .await?,
        )
    }
}
