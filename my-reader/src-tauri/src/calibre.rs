use std::path::{Path, PathBuf};

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
    Path::new(library_path).join("metadata.db").exists()
}

pub fn open_calibre_db(library_path: &str) -> SqlResult<Connection> {
    let db_path = Path::new(library_path).join("metadata.db");
    Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
}

pub fn get_book_count(conn: &Connection) -> SqlResult<usize> {
    conn.query_row("SELECT COUNT(*) FROM books", [], |row| {
        row.get::<_, i64>(0).map(|c| c as usize)
    })
}

/// Single optimized query that fetches all books with related data via correlated subqueries.
pub fn get_all_books(conn: &Connection) -> SqlResult<Vec<BookEntry>> {
    let sql = format!("SELECT {BOOK_SELECT_COLUMNS} FROM books b ORDER BY b.sort");
    let mut stmt = conn.prepare(&sql)?;

    let books = stmt
        .query_map([], |row| map_book_row(row))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(books)
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
}

pub fn get_book_by_id(conn: &Connection, book_id: i64) -> SqlResult<Option<BookEntry>> {
    let sql = format!(
        "SELECT {BOOK_SELECT_COLUMNS} FROM books b WHERE b.id = ?1"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query_map([book_id], |row| map_book_row(row))?;
    match rows.next() {
        Some(Ok(book)) => Ok(Some(book)),
        Some(Err(e)) => Err(e),
        None => Ok(None),
    }
}

pub fn get_books_by_series(
    conn: &Connection,
    series_name: &str,
    exclude_book_id: Option<i64>,
) -> SqlResult<Vec<BookEntry>> {
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
    let mut stmt = conn.prepare(&sql)?;

    let books = if let Some(eid) = exclude_book_id {
        stmt.query_map(rusqlite::params![series_name, eid], |row| map_book_row(row))?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        stmt.query_map([series_name], |row| map_book_row(row))?
            .collect::<Result<Vec<_>, _>>()?
    };

    Ok(books)
}

/// Get file sizes for all formats of a book.
pub fn get_book_format_sizes(
    conn: &Connection,
    book_id: i64,
) -> SqlResult<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT format, uncompressed_size FROM data WHERE book = ?1 ORDER BY format",
    )?;
    let rows = stmt
        .query_map([book_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Get identifiers (ISBN, goodreads, douban, etc.) for a book.
pub fn get_book_identifiers(
    conn: &Connection,
    book_id: i64,
) -> SqlResult<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT type, val FROM identifiers WHERE book = ?1 ORDER BY type",
    )?;
    let rows = stmt
        .query_map([book_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn split_concat(s: Option<String>) -> Vec<String> {
    s.map(|s| s.split("||").map(String::from).collect())
        .unwrap_or_default()
}

pub fn get_book_cover_path(library_path: &str, book_path: &str) -> Option<PathBuf> {
    let cover = Path::new(library_path).join(book_path).join("cover.jpg");
    cover.exists().then_some(cover)
}

/// Resolve the on-disk file path for a specific format of a book.
/// Calibre stores: `library_root / book.path / data.name . format_lower`
pub fn get_book_file_path(
    library_path: &str,
    conn: &Connection,
    book_id: i64,
    format: &str,
) -> SqlResult<Option<PathBuf>> {
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
            let full = Path::new(library_path)
                .join(&book_path)
                .join(format!("{}.{}", file_name, fmt.to_lowercase()));
            Ok(Some(full))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}
