use std::path::{Path, PathBuf};

use tracing::{debug, info};
use sqlx::{Row as _, SqlitePool};
use sqlx::sqlite::SqlitePoolOptions;

use crate::error::AppError;
use crate::models::BookEntry;

/// Lightweight summary for cover download — avoids joining all book columns.
pub struct CoverSummary {
    pub id: i64,
    pub path: String,
    pub has_cover: bool,
}

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

fn map_book_row(row: &sqlx::sqlite::SqliteRow) -> Result<BookEntry, AppError> {
    Ok(BookEntry {
        id: row.try_get::<i64, _>(0).unwrap_or(0),
        title: row.try_get::<String, _>(1).unwrap_or_default(),
        author_sort: row.try_get::<Option<String>, _>(3).ok().flatten().unwrap_or_default(),
        authors: split_concat(row.try_get::<Option<String>, _>(11).ok().flatten()),
        tags: split_concat(row.try_get::<Option<String>, _>(12).ok().flatten()),
        series: row.try_get::<Option<String>, _>(13).ok().flatten(),
        series_index: row.try_get::<Option<f64>, _>(6).ok().flatten(),
        formats: split_concat(row.try_get::<Option<String>, _>(14).ok().flatten()),
        has_cover: row.try_get::<Option<i64>, _>(9).ok().flatten().unwrap_or(0) != 0,
        path: row.try_get::<Option<String>, _>(8).ok().flatten().unwrap_or_default(),
        timestamp: row.try_get::<Option<String>, _>(4).ok().flatten(),
        pubdate: row.try_get::<Option<String>, _>(5).ok().flatten(),
        last_modified: row.try_get::<Option<String>, _>(7).ok().flatten(),
        comment: row.try_get::<Option<String>, _>(15).ok().flatten(),
        publisher: row.try_get::<Option<String>, _>(16).ok().flatten(),
        languages: split_concat(row.try_get::<Option<String>, _>(17).ok().flatten()),
        rating: row.try_get::<Option<i32>, _>(18).ok().flatten(),
        uuid: row.try_get::<Option<String>, _>(10).ok().flatten(),
    })
}

fn split_concat(s: Option<String>) -> Vec<String> {
    s.map(|s| s.split("||").map(String::from).collect())
        .unwrap_or_default()
}

/// Repository trait for Calibre book metadata access.
#[async_trait::async_trait]
pub trait BookRepository {
    async fn get_all_books(&self) -> Result<Vec<BookEntry>, AppError>;
    async fn get_books_page(
        &self,
        offset: usize,
        limit: usize,
        sort_by: &str,
        search: Option<&str>,
    ) -> Result<(Vec<BookEntry>, usize), AppError>;
    async fn get_book_by_id(&self, book_id: i64) -> Result<Option<BookEntry>, AppError>;
    async fn get_books_by_series(
        &self,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError>;
    async fn get_book_format_sizes(&self, book_id: i64) -> Result<Vec<(String, i64)>, AppError>;
    async fn get_book_identifiers(&self, book_id: i64) -> Result<Vec<(String, String)>, AppError>;
    async fn get_book_count(&self) -> Result<usize, AppError>;
    fn get_book_cover_path(&self, book_path: &str) -> Result<Option<PathBuf>, AppError>;
    async fn get_book_file_path(
        &self,
        library_path: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<PathBuf>, AppError>;
}

/// Read-only Calibre metadata.db repository using sqlx.
pub struct CalibreBookRepository {
    pool: SqlitePool,
    library_path: String,
}

impl CalibreBookRepository {
    pub async fn open(library_path: &str) -> Result<Self, AppError> {
        info!("Start to open Calibre database. library path: \"{library_path}\"");
        let db_path = Path::new(library_path).join("metadata.db");
        let url = format!(
            "sqlite://{}?mode=ro",
            db_path.to_str().ok_or_else(|| AppError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?
        );
        let pool = SqlitePoolOptions::new()
            .max_connections(3)
            .connect(&url)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        info!(
            "Success to open Calibre database. db path: \"{}\"",
            db_path.display()
        );
        Ok(Self {
            pool,
            library_path: library_path.to_string(),
        })
    }

    pub fn validate_library(library_path: &str) -> bool {
        Path::new(library_path).join("metadata.db").is_file()
    }

    /// Return lightweight (id, path, has_cover) for every book — used by bulk cover download.
    pub async fn get_cover_summaries(&self) -> Result<Vec<CoverSummary>, AppError> {
        let rows = sqlx::query("SELECT b.id, b.path, b.has_cover FROM books b")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(rows
            .iter()
            .map(|row| CoverSummary {
                id: row.try_get::<i64, _>(0).unwrap_or(0),
                path: row.try_get::<Option<String>, _>(1).ok().flatten().unwrap_or_default(),
                has_cover: row.try_get::<Option<i64>, _>(2).ok().flatten().unwrap_or(0) != 0,
            })
            .collect())
    }
}

#[async_trait::async_trait]
impl BookRepository for CalibreBookRepository {
    async fn get_all_books(&self) -> Result<Vec<BookEntry>, AppError> {
        info!("Start to load all books from Calibre.");
        let rows = sqlx::query(&format!(
            "SELECT {BOOK_SELECT_COLUMNS} FROM books b ORDER BY b.sort"
        ))
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
        let books: Vec<BookEntry> = rows.iter().filter_map(|r| map_book_row(r).ok()).collect();
        info!("Success to load all books from Calibre. count: {}", books.len());
        Ok(books)
    }

    async fn get_books_page(
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
            let row: (i64,) = sqlx::query_as(&format!(
                "SELECT COUNT(*) FROM books b{where_sql}"
            ))
            .bind(p)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
            row.0 as usize
        } else {
            let row: (i64,) = sqlx::query_as(&format!(
                "SELECT COUNT(*) FROM books b{where_sql}"
            ))
            .fetch_one(&self.pool)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
            row.0 as usize
        };

        let sql = format!(
            "SELECT {BOOK_SELECT_COLUMNS} FROM books b{where_sql} ORDER BY {order} LIMIT {limit} OFFSET {offset}"
        );
        let books: Vec<BookEntry> = if let Some(ref p) = pattern {
            let rows = sqlx::query(&sql)
                .bind(p)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            rows.iter().filter_map(|r| map_book_row(r).ok()).collect()
        } else {
            let rows = sqlx::query(&sql)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            rows.iter().filter_map(|r| map_book_row(r).ok()).collect()
        };

        info!(
            "Success to query books page. returned count: {}, total: {}",
            books.len(),
            total
        );
        Ok((books, total))
    }

    async fn get_book_by_id(&self, book_id: i64) -> Result<Option<BookEntry>, AppError> {
        info!("Start to load book by id. book id: {book_id}");
        let row = sqlx::query(&format!(
            "SELECT {BOOK_SELECT_COLUMNS} FROM books b WHERE b.id = ?1"
        ))
        .bind(book_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(row.as_ref().and_then(|r| map_book_row(r).ok()))
    }

    async fn get_books_by_series(
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
            if exclude_book_id.is_some() { "AND b.id != ?2" } else { "" }
        );
        let books: Vec<BookEntry> = if let Some(eid) = exclude_book_id {
            let rows = sqlx::query(&sql)
                .bind(series_name)
                .bind(eid)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            rows.iter().filter_map(|r| map_book_row(r).ok()).collect()
        } else {
            let rows = sqlx::query(&sql)
                .bind(series_name)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
            rows.iter().filter_map(|r| map_book_row(r).ok()).collect()
        };
        info!(
            "Success to load books by series. series name: \"{series_name}\", count: {}",
            books.len()
        );
        Ok(books)
    }

    async fn get_book_format_sizes(&self, book_id: i64) -> Result<Vec<(String, i64)>, AppError> {
        debug!("Start to load book format sizes. book id: {book_id}");
        let rows = sqlx::query_as::<_, (String, i64)>(
            "SELECT format, uncompressed_size FROM data WHERE book = ?1 ORDER BY format",
        )
        .bind(book_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
        debug!(
            "Success to load book format sizes. book id: {}, count: {}",
            book_id,
            rows.len()
        );
        Ok(rows)
    }

    async fn get_book_identifiers(&self, book_id: i64) -> Result<Vec<(String, String)>, AppError> {
        debug!("Start to load book identifiers. book id: {book_id}");
        let rows = sqlx::query_as::<_, (String, String)>(
            "SELECT type, val FROM identifiers WHERE book = ?1 ORDER BY type",
        )
        .bind(book_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
        debug!(
            "Success to load book identifiers. book id: {}, count: {}",
            book_id,
            rows.len()
        );
        Ok(rows)
    }

    async fn get_book_count(&self) -> Result<usize, AppError> {
        debug!("Start to count books in Calibre.");
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM books")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        let count = row.0 as usize;
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

    async fn get_book_file_path(
        &self,
        library_path: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<PathBuf>, AppError> {
        info!(
            "Start to resolve book file path. library path: \"{library_path}\", book id: {book_id}, format: \"{format}\""
        );
        let row: Option<(String, String, String)> = sqlx::query_as(
            "SELECT b.path, d.name, d.format \
             FROM books b JOIN data d ON d.book = b.id \
             WHERE b.id = ?1 AND UPPER(d.format) = UPPER(?2)",
        )
        .bind(book_id)
        .bind(format)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let result = match row {
            Some((book_path, file_name, fmt)) => {
                let full = Path::new(library_path)
                    .join(&book_path)
                    .join(format!("{}.{}", file_name, fmt.to_lowercase()));
                info!(
                    "Success to resolve book file path. found: true, path: \"{}\"",
                    full.display()
                );
                Some(full)
            }
            None => {
                info!(
                    "Success to resolve book file path. found: false, book id: {book_id}, format: \"{format}\""
                );
                None
            }
        };
        Ok(result)
    }
}