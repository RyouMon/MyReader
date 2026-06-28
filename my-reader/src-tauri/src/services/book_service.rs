use crate::error::AppError;
use crate::models::{BookDetail, BookEntry, BookIdentifier, FormatSize, PaginatedBooks};
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};
use crate::repositories::progress_repo::SqliteProgressRepository;

pub struct BookService;

impl BookService {
    pub async fn get_books(lib_path: &str) -> Result<Vec<BookEntry>, AppError> {
        let repo = CalibreBookRepository::open(lib_path).await?;
        repo.get_all_books().await
    }

    pub async fn get_books_page(
        lib_path: &str,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        let repo = CalibreBookRepository::open(lib_path).await?;
        let sort = sort_by.unwrap_or("title");
        let limit = limit.clamp(1, 200);
        let (items, total) = repo.get_books_page(offset, limit, sort, search).await?;
        Ok(PaginatedBooks { items, total })
    }

    pub async fn get_books_page_by_last_read(
        lib_path: &str,
        sidecar_root: &str,
        offset: usize,
        limit: usize,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        let repo = CalibreBookRepository::open(lib_path).await?;
        let mut books = repo.get_all_books().await?;
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
        let repo = CalibreBookRepository::open(lib_path).await?;
        let book = repo
            .get_book_by_id(book_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("BOOK_NOT_FOUND: {}", book_id)))?;

        let format_sizes = repo
            .get_book_format_sizes(book_id)
            .await?
            .into_iter()
            .map(|(format, size_bytes)| FormatSize { format, size_bytes })
            .collect();

        let identifiers = repo
            .get_book_identifiers(book_id)
            .await?
            .into_iter()
            .map(|(id_type, value)| BookIdentifier { id_type, value })
            .collect();

        Ok(BookDetail {
            book,
            format_sizes,
            identifiers,
        })
    }

    pub async fn get_series_books(
        lib_path: &str,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError> {
        let repo = CalibreBookRepository::open(lib_path).await?;
        repo.get_books_by_series(series_name, exclude_book_id).await
    }

    pub async fn get_book_cover_bytes(
        lib_path: &str,
        book_path: &str,
    ) -> Result<Option<Vec<u8>>, AppError> {
        let repo = CalibreBookRepository::open(lib_path).await?;
        match repo.get_book_cover_path(book_path)? {
            Some(path) => Ok(Some(std::fs::read(&path)?)),
            None => Ok(None),
        }
    }
}
