use std::path::{Path, PathBuf};

use log::{debug, error, info};
use rusqlite::{Connection, Result as SqlResult};

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

pub fn validate_calibre_library(library_path: &str) -> bool {
    info!("Start to validate Calibre library. path: \"{library_path}\"");
    let result = Path::new(library_path).join("metadata.db").is_file();
    info!(
        "Success to validate Calibre library. path: \"{}\", metadata db exists: {}",
        library_path, result
    );
    result
}

pub fn open_calibre_db(library_path: &str) -> SqlResult<Connection> {
    info!("Start to open Calibre database. library path: \"{library_path}\"");
    let db_path = Path::new(library_path).join("metadata.db");
    let result = Connection::open_with_flags(&db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY);
    match &result {
        Ok(_) => info!(
            "Success to open Calibre database. db path: \"{}\"",
            db_path.display()
        ),
        Err(err) => error!(
            "Failed to open Calibre database. db path: \"{}\", error: {err}",
            db_path.display()
        ),
    }
    result
}

pub fn get_book_count(conn: &Connection) -> SqlResult<usize> {
    debug!("Start to count books in Calibre.");
    let result = conn.query_row("SELECT COUNT(*) FROM books", [], |row| {
        row.get::<_, i64>(0).map(|c| c as usize)
    });
    match &result {
        Ok(count) => debug!("Success to count books in Calibre. count: {count}"),
        Err(err) => error!("Failed to count books in Calibre. error: {err}"),
    }
    result
}

/// Single optimized query that fetches all books with related data via correlated subqueries.
pub fn get_all_books(conn: &Connection) -> SqlResult<Vec<BookEntry>> {
    info!("Start to load all books from Calibre.");
    let sql = format!("SELECT {BOOK_SELECT_COLUMNS} FROM books b ORDER BY b.sort");
    let result = (|| {
        let mut stmt = conn.prepare(&sql)?;

        let books = stmt
            .query_map([], |row| map_book_row(row))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(books)
    })();

    match &result {
        Ok(books) => info!(
            "Success to load all books from Calibre. count: {}",
            books.len()
        ),
        Err(err) => error!("Failed to load all books from Calibre. error: {err}"),
    }

    result
}

/// Paginated query with optional search filter and configurable sort order.
/// Returns (books, total_matching_count).
pub fn get_books_page(
    conn: &Connection,
    offset: usize,
    limit: usize,
    sort_by: &str,
    search: Option<&str>,
) -> SqlResult<(Vec<BookEntry>, usize)> {
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

    let result = (|| {
        let total = if let Some(ref p) = pattern {
            conn.query_row(
                &format!("SELECT COUNT(*) FROM books b{where_sql}"),
                [p.as_str()],
                |row| row.get::<_, i64>(0).map(|c| c as usize),
            )?
        } else {
            conn.query_row(
                &format!("SELECT COUNT(*) FROM books b{where_sql}"),
                [],
                |row| row.get::<_, i64>(0).map(|c| c as usize),
            )?
        };

        let sql = format!(
            "SELECT {BOOK_SELECT_COLUMNS} FROM books b{where_sql} ORDER BY {order} LIMIT {limit} OFFSET {offset}"
        );

        let mut stmt = conn.prepare(&sql)?;
        let books = if let Some(ref p) = pattern {
            let rows = stmt.query_map([p.as_str()], |row| map_book_row(row))?;
            rows.collect::<Result<Vec<_>, _>>()?
        } else {
            let rows = stmt.query_map([], |row| map_book_row(row))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        Ok((books, total))
    })();

    match &result {
        Ok((books, total)) => info!(
            "Success to query books page. returned count: {}, total: {}",
            books.len(),
            total
        ),
        Err(err) => error!("Failed to query books page. error: {err}"),
    }

    result
}

pub fn get_book_by_id(conn: &Connection, book_id: i64) -> SqlResult<Option<BookEntry>> {
    info!("Start to load book by id. book id: {book_id}");
    let sql = format!("SELECT {BOOK_SELECT_COLUMNS} FROM books b WHERE b.id = ?1");
    let result = (|| {
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query_map([book_id], |row| map_book_row(row))?;
        match rows.next() {
            Some(Ok(book)) => Ok(Some(book)),
            Some(Err(e)) => Err(e),
            None => Ok(None),
        }
    })();

    match &result {
        Ok(Some(book)) => info!(
            "Success to load book by id. found: true, title: \"{}\"",
            book.title
        ),
        Ok(None) => info!("Success to load book by id. found: false, book id: {book_id}"),
        Err(err) => error!("Failed to load book by id. book id: {book_id}, error: {err}"),
    }

    result
}

pub fn get_books_by_series(
    conn: &Connection,
    series_name: &str,
    exclude_book_id: Option<i64>,
) -> SqlResult<Vec<BookEntry>> {
    info!(
        "Start to load books by series. series name: \"{}\", exclude book id: {exclude_book_id:?}",
        series_name
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
    let result = (|| {
        let mut stmt = conn.prepare(&sql)?;

        let books = if let Some(eid) = exclude_book_id {
            stmt.query_map(rusqlite::params![series_name, eid], |row| map_book_row(row))?
                .collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map([series_name], |row| map_book_row(row))?
                .collect::<Result<Vec<_>, _>>()?
        };

        Ok(books)
    })();

    match &result {
        Ok(books) => info!(
            "Success to load books by series. series name: \"{}\", count: {}",
            series_name,
            books.len()
        ),
        Err(err) => error!(
            "Failed to load books by series. series name: \"{}\", error: {err}",
            series_name
        ),
    }

    result
}

/// Get file sizes for all formats of a book.
pub fn get_book_format_sizes(conn: &Connection, book_id: i64) -> SqlResult<Vec<(String, i64)>> {
    debug!("Start to load book format sizes. book id: {book_id}");
    let result = (|| {
        let mut stmt = conn.prepare(
            "SELECT format, uncompressed_size FROM data WHERE book = ?1 ORDER BY format",
        )?;
        let rows = stmt
            .query_map([book_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })();

    match &result {
        Ok(rows) => debug!(
            "Success to load book format sizes. book id: {}, count: {}",
            book_id,
            rows.len()
        ),
        Err(err) => error!("Failed to load book format sizes. book id: {book_id}, error: {err}"),
    }

    result
}

/// Get identifiers (ISBN, goodreads, douban, etc.) for a book.
pub fn get_book_identifiers(conn: &Connection, book_id: i64) -> SqlResult<Vec<(String, String)>> {
    debug!("Start to load book identifiers. book id: {book_id}");
    let result = (|| {
        let mut stmt =
            conn.prepare("SELECT type, val FROM identifiers WHERE book = ?1 ORDER BY type")?;
        let rows = stmt
            .query_map([book_id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })();

    match &result {
        Ok(rows) => debug!(
            "Success to load book identifiers. book id: {}, count: {}",
            book_id,
            rows.len()
        ),
        Err(err) => error!("Failed to load book identifiers. book id: {book_id}, error: {err}"),
    }

    result
}

fn split_concat(s: Option<String>) -> Vec<String> {
    s.map(|s| s.split("||").map(String::from).collect())
        .unwrap_or_default()
}

pub fn get_book_cover_path(library_path: &str, book_path: &str) -> Option<PathBuf> {
    debug!(
        "Start to resolve book cover path. library path: \"{}\", book path: \"{}\"",
        library_path, book_path
    );
    let book_path_buf = Path::new(book_path);
    if book_path_buf
        .components()
        .any(|c| c == std::path::Component::ParentDir)
    {
        debug!(
            "Blocked path traversal in book cover path. library path: \"{}\", book path: \"{}\"",
            library_path, book_path
        );
        return None;
    }
    let cover = Path::new(library_path).join(book_path).join("cover.jpg");
    let result = cover.exists().then_some(cover);
    debug!(
        "Success to resolve book cover path. library path: \"{}\", book path: \"{}\", found: {}",
        library_path,
        book_path,
        result.is_some()
    );
    result
}

/// Resolve the on-disk file path for a specific format of a book.
/// Calibre stores: `library_root / book.path / data.name . format_lower`
pub fn get_book_file_path(
    library_path: &str,
    conn: &Connection,
    book_id: i64,
    format: &str,
) -> SqlResult<Option<PathBuf>> {
    info!(
        "Start to resolve book file path. library path: \"{}\", book id: {}, format: \"{}\"",
        library_path, book_id, format
    );
    let result = (|| {
        let mut stmt = conn.prepare(
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
                Ok(Some(full))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    })();

    match &result {
        Ok(Some(path)) => info!(
            "Success to resolve book file path. found: true, path: \"{}\"",
            path.display()
        ),
        Ok(None) => info!(
            "Success to resolve book file path. found: false, book id: {}, format: \"{}\"",
            book_id, format
        ),
        Err(err) => error!(
            "Failed to resolve book file path. book id: {}, format: \"{}\", error: {err}",
            book_id, format
        ),
    }

    result
}
