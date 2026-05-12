use crate::error::AppError;
use crate::models::{BookDetail, BookEntry, BookIdentifier, FormatSize, PaginatedBooks};
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};

pub struct BookService;

impl BookService {
    pub fn get_books(lib_path: &str) -> Result<Vec<BookEntry>, AppError> {
        let repo = CalibreBookRepository::open(lib_path)?;
        repo.get_all_books()
    }

    pub fn get_books_page(
        lib_path: &str,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        let repo = CalibreBookRepository::open(lib_path)?;
        let sort = sort_by.unwrap_or("title");
        let limit = limit.clamp(1, 200);
        let (items, total) = repo.get_books_page(offset, limit, sort, search)?;
        Ok(PaginatedBooks { items, total })
    }

    pub fn get_book_detail(lib_path: &str, book_id: i64) -> Result<BookDetail, AppError> {
        let repo = CalibreBookRepository::open(lib_path)?;
        let book = repo
            .get_book_by_id(book_id)?
            .ok_or_else(|| AppError::NotFound(format!("BOOK_NOT_FOUND: {}", book_id)))?;

        let format_sizes = repo
            .get_book_format_sizes(book_id)?
            .into_iter()
            .map(|(format, size_bytes)| FormatSize { format, size_bytes })
            .collect();

        let identifiers = repo
            .get_book_identifiers(book_id)?
            .into_iter()
            .map(|(id_type, value)| BookIdentifier { id_type, value })
            .collect();

        Ok(BookDetail {
            book,
            format_sizes,
            identifiers,
        })
    }

    pub fn get_series_books(
        lib_path: &str,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError> {
        let repo = CalibreBookRepository::open(lib_path)?;
        repo.get_books_by_series(series_name, exclude_book_id)
    }

    pub fn get_book_cover_bytes(
        lib_path: &str,
        book_path: &str,
    ) -> Result<Option<Vec<u8>>, AppError> {
        let repo = CalibreBookRepository::open(lib_path)?;
        match repo.get_book_cover_path(book_path)? {
            Some(path) => Ok(Some(std::fs::read(&path)?)),
            None => Ok(None),
        }
    }
}
