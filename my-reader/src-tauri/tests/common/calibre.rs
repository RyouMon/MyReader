//! Minimal Calibre library fixture for integration tests. Promoted (in spirit) from
//! `services/download_service.rs::create_minimal_calibre_library` — kept independent so
//! the inline service test can continue to live alongside its production code without
//! depending on the integration-test tree.
//!
//! The schema covers only what `CalibreBookRepository` reads for `get_books` /
//! `get_book_detail` / `get_series_books`. If a test needs richer metadata
//! (authors, series, tags, identifiers), add the table here rather than seeding it
//! ad-hoc per test.

use std::path::{Path, PathBuf};

use sea_orm::{ConnectionTrait, Database};

/// A single book in a minimal Calibre library: `(book_id, format, book_file_path)`.
#[allow(dead_code)] // `file_path` is unused by the first wave of consumers; kept for Phase C.
pub struct SeededBook {
    pub book_id: i64,
    pub format: String,
    pub file_path: PathBuf,
}

/// Create `metadata.db` plus one EPUB book under `root`. Returns enough info to invoke
/// book-level commands without further setup.
pub async fn seed_minimal_calibre_library(root: &Path) -> SeededBook {
    let db_path = root.join("metadata.db");
    let url = format!(
        "sqlite://{}?mode=rwc",
        db_path.to_str().expect("valid utf8")
    );
    let db = Database::connect(&url)
        .await
        .expect("connect to setup db");

    // Schema covers every table CalibreBookRepository joins against — even when a join
    // would return no rows, the table must exist or the query fails with "no such table".
    let schema = "
        CREATE TABLE books (
            id INTEGER PRIMARY KEY,
            title TEXT, sort TEXT, timestamp TEXT, pubdate TEXT, series_index REAL,
            author_sort TEXT, isbn TEXT, lccn TEXT, path TEXT, flags INTEGER,
            uuid TEXT, has_cover INTEGER, last_modified TEXT
        );
        CREATE TABLE data (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            format TEXT NOT NULL,
            uncompressed_size INTEGER NOT NULL,
            name TEXT NOT NULL
        );
        CREATE TABLE authors (
            id INTEGER PRIMARY KEY,
            name TEXT, sort TEXT, link TEXT
        );
        CREATE TABLE books_authors_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, author INTEGER NOT NULL
        );
        CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT, link TEXT);
        CREATE TABLE books_tags_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, tag INTEGER NOT NULL
        );
        CREATE TABLE series (id INTEGER PRIMARY KEY, name TEXT, sort TEXT, link TEXT);
        CREATE TABLE books_series_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, series INTEGER NOT NULL
        );
        CREATE TABLE publishers (id INTEGER PRIMARY KEY, name TEXT, sort TEXT);
        CREATE TABLE books_publishers_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, publisher INTEGER NOT NULL
        );
        CREATE TABLE ratings (id INTEGER PRIMARY KEY, rating INTEGER);
        CREATE TABLE books_ratings_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, rating INTEGER NOT NULL
        );
        CREATE TABLE languages (id INTEGER PRIMARY KEY, lang_code TEXT, link TEXT);
        CREATE TABLE books_languages_link (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, lang_code INTEGER NOT NULL,
            item_order INTEGER
        );
        CREATE TABLE comments (id INTEGER PRIMARY KEY, book INTEGER NOT NULL, text TEXT);
        CREATE TABLE identifiers (
            id INTEGER PRIMARY KEY, book INTEGER NOT NULL, type TEXT, val TEXT
        );
    ";
    db.execute_unprepared(schema)
        .await
        .expect("create calibre schema");

    let book_id = 42i64;
    let book_path = "It";
    let file_name = "It";
    let format = "EPUB";

    db.execute_unprepared(&format!(
        "INSERT INTO books (id, title, sort, author_sort, path) VALUES \
             ({book_id}, 'It', 'It', 'King, Stephen', '{book_path}');"
    ))
    .await
    .expect("insert book");

    db.execute_unprepared(&format!(
        "INSERT INTO data (id, book, format, uncompressed_size, name) \
         VALUES (1, {book_id}, '{format}', 12, '{file_name}');"
    ))
    .await
    .expect("insert data");

    let file_dir = root.join(book_path);
    tokio::fs::create_dir_all(&file_dir)
        .await
        .expect("create book dir");
    let file_path = file_dir.join(format!("{file_name}.{}", format.to_lowercase()));
    tokio::fs::write(&file_path, b"book content")
        .await
        .expect("write book file");

    SeededBook {
        book_id,
        format: format.to_string(),
        file_path,
    }
}
