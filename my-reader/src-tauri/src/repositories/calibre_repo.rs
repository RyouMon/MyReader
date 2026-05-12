use std::path::{Path, PathBuf};

use log::{debug, error, info};
use rusqlite::Connection;

use crate::error::AppError;
use crate::models::BookEntry;

const BOOK_SELECT_COLUMNS: &str = "b.id, b.title, b.sort, b.author_sort, b.timestamp, b.pubdate,
     b.series_index, b.last_modified, b.path, b.has_cover, b.uuid,
     (SELECT GROUP_CONCAT(a.name, '||')
      FROM authors a JOIN books_authors_link bal ON a.id = bal.author
      WHERE bal.book = b.id),
     (SELECT GROUP_CONCAT(t.name, '||')
      FROM tags t JOIN books_tags_link btl ON t.id = btl.tag
      WHERE btl.book = b.id),
     (SELECT s.name FROM series s
      JOIN books_series_link bsl ON s.id = bsl.series
      WHERE bsl.book = b.id LIMIT 1),
     (SELECT GROUP_CONCAT(d.format, '||')
      FROM data d WHERE d.book = b.id),
     (SELECT c.text FROM comments c
      WHERE c.book = b.id LIMIT 1),
     (SELECT p.name FROM publishers p
      JOIN books_publishers_link bpl ON p.id = bpl.publisher
      WHERE bpl.book = b.id LIMIT 1),
     (SELECT GROUP_CONCAT(l.lang_code, '||')
      FROM languages l JOIN books_languages_link bll ON l.id = bll.lang_code
      WHERE bll.book = b.id),
     (SELECT r.rating FROM ratings r
      JOIN books_ratings_link brl ON r.id = brl.rating
      WHERE brl.book = b.id LIMIT 1)";

fn map_book_row(row: &rusqlite::Row) -> rusqlite::Result<BookEntry> {
    Ok(BookEntry {
        id: row.get(0)?,
        title: row.get(1)?,
        author_sort: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        authors: split_concat(row.get(11)?),
        tags: split_concat(row.get(12)?),
        series: row.get(13)?,
        series_index: row.get::<_, f64>(6).ok(),
        formats: split_concat(row.get(14)?),
        has_cover: row.get::<_, i64>(9).unwrap_or(0) != 0,
        path: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
        timestamp: row.get(4)?,
        pubdate: row.get(5)?,
        last_modified: row.get(7)?,
        comment: row.get(15)?,
        publisher: row.get(16)?,
        languages: split_concat(row.get(17)?),
        rating: row.get(18)?,
        uuid: row.get(10)?,
    })
}

fn split_concat(s: Option<String>) -> Vec<String> {
    s.map(|s| s.split("||").map(String::from).collect())
        .unwrap_or_default()
}

/// Repository trait for Calibre book metadata access.
pub trait BookRepository {
    fn get_all_books(&self) -> Result<Vec<BookEntry>, AppError>;
    fn get_books_page(
        &self,
        offset: usize,
        limit: usize,
        sort_by: &str,
        search: Option<&str>,
    ) -> Result<(Vec<BookEntry>, usize), AppError>;
    fn get_book_by_id(&self, book_id: i64) -> Result<Option<BookEntry>, AppError>;
    fn get_books_by_series(
        &self,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError>;
    fn get_book_format_sizes(&self, book_id: i64) -> Result<Vec<(String, i64)>, AppError>;
    fn get_book_identifiers(&self, book_id: i64) -> Result<Vec<(String, String)>, AppError>;
    fn get_book_count(&self) -> Result<usize, AppError>;
    fn get_book_cover_path(&self, book_path: &str) -> Result<Option<PathBuf>, AppError>;
    fn get_book_file_path(
        &self,
        library_path: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<PathBuf>, AppError>;
}

/// Read-only Calibre metadata.db repository.
pub struct CalibreBookRepository {
    conn: Connection,
    library_path: String,
}

impl CalibreBookRepository {
    pub fn open(library_path: &str) -> Result<Self, AppError> {
        info!("Start to open Calibre database. library path: \"{library_path}\"");
        let db_path = Path::new(library_path).join("metadata.db");
        let conn =
            Connection::open_with_flags(&db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        info!(
            "Success to open Calibre database. db path: \"{}\"",
            db_path.display()
        );
        Ok(Self {
            conn,
            library_path: library_path.to_string(),
        })
    }

    pub fn validate_library(library_path: &str) -> bool {
        Path::new(library_path).join("metadata.db").is_file()
    }
}

impl BookRepository for CalibreBookRepository {
    fn get_all_books(&self) -> Result<Vec<BookEntry>, AppError> {
        info!("Start to load all books from Calibre.");
        let sql = format!("SELECT {BOOK_SELECT_COLUMNS} FROM books b ORDER BY b.sort");
        let mut stmt = self.conn.prepare(&sql)?;
        let books = stmt
            .query_map([], |row| map_book_row(row))?
            .collect::<Result<Vec<_>, _>>()?;
        info!("Success to load all books from Calibre. count: {}", books.len());
        Ok(books)
    }

    fn get_books_page(
        &self,
        offset: usize,
        limit: usize,
        sort_by: &str,
        search: Option<&str>,
    ) -> Result<(Vec<BookEntry>, usize), AppError> {
        info!(
            "Start to query books page. offset: {offset}, limit: {limit}, sort by: {sort_by}, search: {search:?}"
        );
        let order = match sort_by {
            "author" => "b.author_sort COLLATE NOCASE ASC",
            "recent" | "progress" => "b.timestamp DESC",
            _ => "b.sort COLLATE NOCASE ASC",
        };

        let search_filter = search.filter(|s| !s.is_empty());
        let pattern = search_filter.map(|s| format!("%{s}%"));

        let where_sql = if search_filter.is_some() {
            " WHERE (b.sort LIKE ?1 COLLATE NOCASE \
             OR b.title LIKE ?1 COLLATE NOCASE \
             OR b.author_sort LIKE ?1 COLLATE NOCASE \
             OR EXISTS (SELECT 1 FROM authors a \
                        JOIN books_authors_link bal ON a.id = bal.author \
                        WHERE bal.book = b.id AND a.name LIKE ?1 COLLATE NOCASE) \
             OR EXISTS (SELECT 1 FROM tags t \
                        JOIN books_tags_link btl ON t.id = btl.tag \
                        WHERE btl.book = b.id AND t.name LIKE ?1 COLLATE NOCASE))"
        } else {
            ""
        };

        let total = if let Some(ref p) = pattern {
            self.conn.query_row(
                &format!("SELECT COUNT(*) FROM books b{where_sql}"),
                [p.as_str()],
                |row| row.get::<_, i64>(0).map(|c| c as usize),
            )?
        } else {
            self.conn.query_row(
                &format!("SELECT COUNT(*) FROM books b{where_sql}"),
                [],
                |row| row.get::<_, i64>(0).map(|c| c as usize),
            )?
        };

        let sql = format!(
            "SELECT {BOOK_SELECT_COLUMNS} FROM books b{where_sql} ORDER BY {order} LIMIT {limit} OFFSET {offset}"
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let books = if let Some(ref p) = pattern {
            let rows = stmt.query_map([p.as_str()], |row| map_book_row(row))?;
            rows.collect::<Result<Vec<_>, _>>()?
        } else {
            let rows = stmt.query_map([], |row| map_book_row(row))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        info!(
            "Success to query books page. returned count: {}, total: {}",
            books.len(),
            total
        );
        Ok((books, total))
    }

    fn get_book_by_id(&self, book_id: i64) -> Result<Option<BookEntry>, AppError> {
        info!("Start to load book by id. book id: {book_id}");
        let sql = format!("SELECT {BOOK_SELECT_COLUMNS} FROM books b WHERE b.id = ?1");
        let mut stmt = self.conn.prepare(&sql)?;
        let mut rows = stmt.query_map([book_id], |row| map_book_row(row))?;
        let result = match rows.next() {
            Some(Ok(book)) => {
                info!(
                    "Success to load book by id. found: true, title: \"{}\"",
                    book.title
                );
                Ok(Some(book))
            }
            Some(Err(e)) => {
                error!("Failed to load book by id. book id: {book_id}, error: {e}");
                Err(e.into())
            }
            None => {
                info!("Success to load book by id. found: false, book id: {book_id}");
                Ok(None)
            }
        };
        result
    }

    fn get_books_by_series(
        &self,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError> {
        info!(
            "Start to load books by series. series name: \"{series_name}\", exclude book id: {exclude_book_id:?}"
        );
        let sql = format!(
            "SELECT {BOOK_SELECT_COLUMNS} FROM books b \
             WHERE EXISTS ( \
               SELECT 1 FROM series s \
               JOIN books_series_link bsl ON s.id = bsl.series \
               WHERE bsl.book = b.id AND s.name = ?1 \
             ) \
             {} \
             ORDER BY b.series_index",
            if exclude_book_id.is_some() {
                "AND b.id != ?2"
            } else {
                ""
            }
        );
        let mut stmt = self.conn.prepare(&sql)?;

        let books = if let Some(eid) = exclude_book_id {
            stmt.query_map(rusqlite::params![series_name, eid], |row| map_book_row(row))?
                .collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([series_name], |row| map_book_row(row))?
                .collect::<Result<Vec<_>, _>>()?
        };

        info!(
            "Success to load books by series. series name: \"{series_name}\", count: {}",
            books.len()
        );
        Ok(books)
    }

    fn get_book_format_sizes(&self, book_id: i64) -> Result<Vec<(String, i64)>, AppError> {
        debug!("Start to load book format sizes. book id: {book_id}");
        let mut stmt = self.conn.prepare(
            "SELECT format, uncompressed_size FROM data WHERE book = ?1 ORDER BY format",
        )?;
        let rows = stmt
            .query_map([book_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        debug!(
            "Success to load book format sizes. book id: {}, count: {}",
            book_id,
            rows.len()
        );
        Ok(rows)
    }

    fn get_book_identifiers(&self, book_id: i64) -> Result<Vec<(String, String)>, AppError> {
        debug!("Start to load book identifiers. book id: {book_id}");
        let mut stmt =
            self.conn.prepare("SELECT type, val FROM identifiers WHERE book = ?1 ORDER BY type")?;
        let rows = stmt
            .query_map([book_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        debug!(
            "Success to load book identifiers. book id: {}, count: {}",
            book_id,
            rows.len()
        );
        Ok(rows)
    }

    fn get_book_count(&self) -> Result<usize, AppError> {
        debug!("Start to count books in Calibre.");
        let count = self
            .conn
            .query_row("SELECT COUNT(*) FROM books", [], |row| {
                row.get::<_, i64>(0).map(|c| c as usize)
            })?;
        debug!("Success to count books in Calibre. count: {count}");
        Ok(count)
    }

    fn get_book_cover_path(&self, book_path: &str) -> Result<Option<PathBuf>, AppError> {
        debug!(
            "Start to resolve book cover path. library path: \"{}\", book path: \"{book_path}\"",
            self.library_path
        );
        let book_path_buf = Path::new(book_path);
        if book_path_buf
            .components()
            .any(|c| c == std::path::Component::ParentDir)
        {
            debug!(
                "Blocked path traversal in book cover path. library path: \"{}\", book path: \"{book_path}\"",
                self.library_path
            );
            return Ok(None);
        }
        let cover = Path::new(&self.library_path).join(book_path).join("cover.jpg");
        let result = cover.exists().then_some(cover);
        debug!(
            "Success to resolve book cover path. library path: \"{}\", book path: \"{book_path}\", found: {}",
            self.library_path,
            result.is_some()
        );
        Ok(result)
    }

    fn get_book_file_path(
        &self,
        library_path: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<PathBuf>, AppError> {
        info!(
            "Start to resolve book file path. library path: \"{library_path}\", book id: {book_id}, format: \"{format}\""
        );
        let mut stmt = self.conn.prepare(
            "SELECT b.path, d.name, d.format \
             FROM books b JOIN data d ON d.book = b.id \
             WHERE b.id = ?1 AND UPPER(d.format) = UPPER(?2)",
        )?;

        let result = stmt.query_row(rusqlite::params![book_id, format], |row| {
            let book_path: String = row.get(0)?;
            let file_name: String = row.get(1)?;
            let fmt: String = row.get(2)?;
            Ok((book_path, file_name, fmt))
        });

        match result {
            Ok((book_path, file_name, fmt)) => {
                let full = Path::new(library_path).join(&book_path).join(format!(
                    "{}.{}",
                    file_name,
                    fmt.to_lowercase()
                ));
                info!(
                    "Success to resolve book file path. found: true, path: \"{}\"",
                    full.display()
                );
                Ok(Some(full))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                info!(
                    "Success to resolve book file path. found: false, book id: {book_id}, format: \"{format}\""
                );
                Ok(None)
            }
            Err(e) => {
                error!(
                    "Failed to resolve book file path. book id: {book_id}, format: \"{format}\", error: {e}"
                );
                Err(e.into())
            }
        }
    }
}
