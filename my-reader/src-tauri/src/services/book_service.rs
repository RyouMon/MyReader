use crate::error::AppError;
use std::path::Path;

use crate::models::{BookDetail, BookEntry, PaginatedBooks};
use crate::repositories::progress_repo::SqliteProgressRepository;

pub struct BookService;

impl BookService {
    pub async fn get_books(lib_path: &str) -> Result<Vec<BookEntry>, AppError> {
        Ok(myreader_core::api::catalog::list_books(Path::new(lib_path))
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    pub async fn get_books_page(
        lib_path: &str,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        Ok(myreader_core::api::catalog::list_books_page(
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
        let mut books: Vec<BookEntry> =
            myreader_core::api::catalog::list_books(Path::new(lib_path))
                .await?
                .into_iter()
                .map(Into::into)
                .collect();
        if let Some(keyword) = search.filter(|s| !s.trim().is_empty()) {
            let keyword = keyword.to_lowercase();
            books.retain(|book| {
                book.title.to_lowercase().contains(&keyword)
                    || book.author_sort.to_lowercase().contains(&keyword)
                    || book
                        .authors
                        .iter()
                        .any(|author| author.to_lowercase().contains(&keyword))
                    || book
                        .tags
                        .iter()
                        .any(|tag| tag.to_lowercase().contains(&keyword))
            });
        }

        let progress_db = SqliteProgressRepository::open(sidecar_root).await?;
        let latest_by_book =
            SqliteProgressRepository::list_latest_book_updates(&progress_db).await?;
        books.retain(|book| latest_by_book.contains_key(&book.id));

        books.sort_by(|a, b| {
            let a_read = latest_by_book.get(&a.id).copied();
            let b_read = latest_by_book.get(&b.id).copied();
            match (a_read, b_read) {
                (Some(a_time), Some(b_time)) => b_time
                    .partial_cmp(&a_time)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
                _ => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
            }
        });

        let total = books.len();
        let items = books
            .into_iter()
            .skip(offset)
            .take(limit.clamp(1, 200))
            .collect();
        Ok(PaginatedBooks { items, total })
    }

    pub async fn get_book_detail(lib_path: &str, book_id: i64) -> Result<BookDetail, AppError> {
        Ok(
            myreader_core::api::catalog::get_book_detail(Path::new(lib_path), book_id)
                .await?
                .into(),
        )
    }

    pub async fn get_series_books(
        lib_path: &str,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError> {
        Ok(myreader_core::api::catalog::list_series_books(
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
            myreader_core::api::catalog::get_book_cover_bytes(Path::new(lib_path), book_path)
                .await?,
        )
    }
}
