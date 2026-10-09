use std::path::Path;

use my_reader_core::api::catalog::CatalogService;
use my_reader_core::api::{config::ConfigService, library::LibraryService, sync::SyncService};
use my_reader_core::models::{
    AppConfig, Library, LibraryStorageConfig, LibrarySyncOptions, LibrarySyncReport,
    LibrarySyncScope, LibraryType, LocalLibraryRequest, SidecarSyncMode,
};

const SCHEMAS: &[(u32, &str)] = &[
    (25, include_str!("fixtures/calibre/schema-25.sql")),
    (26, include_str!("fixtures/calibre/schema-26.sql")),
    (27, include_str!("fixtures/calibre/schema-27.sql")),
    (28, include_str!("fixtures/calibre/schema-28.sql")),
];
const LIBRARY_UUID: &str = "018f2f8d-980b-40ef-b72e-c6e86cb7cc28";

fn seed_library(root: &Path, schema: &str) {
    std::fs::create_dir_all(root).unwrap();
    let database = rusqlite::Connection::open(root.join("metadata.db")).unwrap();
    database.execute_batch(schema).unwrap();
    // These writer hooks call Calibre's Python functions. Readers never run them;
    // seed their output explicitly without changing any table definitions.
    database
        .execute_batch(
            "DROP TRIGGER IF EXISTS books_insert_trg;
             DROP TRIGGER IF EXISTS books_update_trg;
             DROP TRIGGER IF EXISTS series_insert_trg;
             DROP TRIGGER IF EXISTS series_update_trg;
             INSERT INTO library_id (id, uuid)
                 VALUES (1, '018f2f8d-980b-40ef-b72e-c6e86cb7cc28');
             INSERT INTO books (id, title, sort, author_sort, path, uuid, has_cover,
                                series_index, timestamp, pubdate, last_modified)
                 VALUES (42, 'The Left Hand of Darkness', 'Left Hand of Darkness, The',
                         'Le Guin, Ursula K.', 'Le Guin/Left Hand', 'book-42', 1, 4,
                         '2026-01-01', '1969-03-01', '2026-10-01');
             INSERT INTO authors (id, name) VALUES (7, 'Ursula K. Le Guin');
             INSERT INTO books_authors_link (book, author) VALUES (42, 7);
             INSERT INTO data (book, format, uncompressed_size, name)
                 VALUES (42, 'EPUB', 1024, 'Left Hand');
             INSERT INTO identifiers (book, type, val) VALUES (42, 'isbn', '9780441478125');
             INSERT INTO tags (id, name) VALUES (1, 'Science fiction');
             INSERT INTO books_tags_link (book, tag) VALUES (42, 1);
             INSERT INTO series (id, name) VALUES (1, 'Hainish');
             INSERT INTO books_series_link (book, series) VALUES (42, 1);
             INSERT INTO publishers (id, name) VALUES (1, 'Ace');
             INSERT INTO books_publishers_link (book, publisher) VALUES (42, 1);
             INSERT INTO languages (id, lang_code) VALUES (1, 'eng');
             INSERT INTO books_languages_link (book, lang_code) VALUES (42, 1);
             INSERT INTO ratings (id, rating) VALUES (1, 8);
             INSERT INTO books_ratings_link (book, rating) VALUES (42, 1);
             INSERT INTO comments (book, text) VALUES (42, 'A journey across Gethen.');",
        )
        .unwrap();
}

fn seed_sync_config(app: &Path) {
    let mut config = AppConfig::empty();
    config.libraries.push(Library {
        id: "library-1".into(),
        name: "Calibre".into(),
        path: "remote://library".into(),
        library_type: LibraryType::Calibre,
        book_count: 1,
        metadata_uri: None,
        added_at: None,
        data_source_id: Some("source-1".into()),
        source_type: Some("webdav".into()),
        source_path: Some("/Library".into()),
        metadata_etag: None,
        security_scoped_bookmark: None,
    });
    ConfigService::load_or_initialize(&app.join("config.json"), Some(config)).unwrap();
}

async fn sync_catalog(app: &Path) -> LibrarySyncReport {
    std::fs::create_dir_all(app.join("sidecar")).unwrap();
    SyncService::sync_library(
        &app.join("config.json"),
        &app.join("sidecar"),
        &app.join("cache"),
        "library-1",
        1_000,
        LibrarySyncOptions {
            scope: LibrarySyncScope::Calibre,
            force_calibre: true,
            sidecar_mode: SidecarSyncMode::Full,
        },
        &LibraryStorageConfig::LocalDirect {
            root: app.join("remote").to_string_lossy().into_owned(),
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn reads_catalog_metadata_from_official_schema_versions_without_writing() {
    for (version, schema) in SCHEMAS {
        let library = tempfile::tempdir().unwrap();
        seed_library(library.path(), schema);
        let before = std::fs::read(library.path().join("metadata.db")).unwrap();

        let books = CatalogService::list_books(library.path())
            .await
            .unwrap_or_else(|error| panic!("schema {version}: {error}"));
        let detail = CatalogService::get_book_detail(library.path(), 42)
            .await
            .unwrap();

        assert_eq!(books.len(), 1);
        assert_eq!(books[0], detail.book);
        assert_eq!(detail.book.title, "The Left Hand of Darkness");
        assert_eq!(detail.book.authors, ["Ursula K. Le Guin"]);
        assert_eq!(detail.book.tags, ["Science fiction"]);
        assert_eq!(detail.book.series.as_deref(), Some("Hainish"));
        assert_eq!(detail.book.publisher.as_deref(), Some("Ace"));
        assert_eq!(detail.book.languages, ["eng"]);
        assert_eq!(detail.book.rating, Some(8));
        assert_eq!(
            detail.book.comment.as_deref(),
            Some("A journey across Gethen.")
        );
        assert_eq!(detail.identifiers[0].id_type, "isbn");
        assert_eq!(detail.identifiers[0].value, "9780441478125");
        assert_eq!(detail.format_sizes[0].size_bytes, 1024);
        assert_eq!(
            CatalogService::get_library_uuid(library.path())
                .await
                .unwrap(),
            LIBRARY_UUID
        );
        assert_eq!(
            std::fs::read(library.path().join("metadata.db")).unwrap(),
            before
        );
    }
}

#[tokio::test]
async fn treats_a_null_calibre_rating_as_unrated() {
    let library = tempfile::tempdir().unwrap();
    seed_library(library.path(), SCHEMAS[3].1);
    rusqlite::Connection::open(library.path().join("metadata.db"))
        .unwrap()
        .execute("UPDATE ratings SET rating = NULL", [])
        .unwrap();

    let detail = CatalogService::get_book_detail(library.path(), 42)
        .await
        .unwrap();

    assert_eq!(detail.book.rating, None);
    assert_eq!(detail.identifiers[0].value, "9780441478125");
}

#[tokio::test]
async fn browses_searches_and_resolves_files_without_optional_book_columns() {
    let library = tempfile::tempdir().unwrap();
    seed_library(library.path(), SCHEMAS[3].1);
    let database = rusqlite::Connection::open(library.path().join("metadata.db")).unwrap();
    database
        .execute_batch("DROP VIEW meta; DROP INDEX books_idx; DROP INDEX authors_idx;")
        .unwrap();
    for column in [
        "sort",
        "author_sort",
        "timestamp",
        "pubdate",
        "series_index",
        "uuid",
        "has_cover",
        "last_modified",
    ] {
        database
            .execute_batch(&format!("ALTER TABLE books DROP COLUMN {column};"))
            .unwrap();
    }
    drop(database);

    let detail = CatalogService::get_book_detail(library.path(), 42)
        .await
        .unwrap();
    assert_eq!(detail.book.title_sort, "The Left Hand of Darkness");
    assert_eq!(detail.book.author_sort, "");
    assert_eq!(detail.book.pubdate, None);
    assert_eq!(detail.book.timestamp, None);
    assert_eq!(detail.book.last_modified, None);
    assert_eq!(detail.book.uuid, None);
    assert_eq!(detail.book.series_index, None);
    assert!(!detail.book.has_cover);
    assert_eq!(detail.book.authors, ["Ursula K. Le Guin"]);
    for order in ["title", "author", "recent", "progress"] {
        for search in ["Darkness", "Ursula", "Science fiction"] {
            let page =
                CatalogService::list_books_page(library.path(), 0, 20, Some(order), Some(search))
                    .await
                    .unwrap();
            assert_eq!(page.total, 1);
            assert_eq!(page.items[0].id, 42);
        }
    }
    let summaries = CatalogService::list_book_summaries(library.path())
        .await
        .unwrap();
    assert_eq!(
        summaries[0].format_paths,
        ["Le Guin/Left Hand/Left Hand.epub"]
    );
    let format = CatalogService::get_book_format(library.path(), 42, "epub")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(format.relative_path, summaries[0].format_paths[0]);
    let paths = CatalogService::get_book_file_paths(library.path(), &[(42, "epub".into())])
        .await
        .unwrap();
    assert_eq!(
        paths[&(42, "EPUB".into())],
        library.path().join(&format.relative_path)
    );
    let series = CatalogService::list_series_books(library.path(), "Hainish", None)
        .await
        .unwrap();
    assert_eq!(series[0].id, 42);
}

#[tokio::test]
async fn reads_an_unknown_schema_with_only_the_required_catalog_contract() {
    let library = tempfile::tempdir().unwrap();
    rusqlite::Connection::open(library.path().join("metadata.db"))
        .unwrap()
        .execute_batch(
            "PRAGMA user_version = 999;
             CREATE TABLE library_id (uuid TEXT NOT NULL);
             INSERT INTO library_id VALUES ('018f2f8d-980b-40ef-b72e-c6e86cb7cc28');
             CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, future_field TEXT);
             INSERT INTO books VALUES (42, 'The Left Hand of Darkness', 'Le Guin/Left Hand', 'new');
             INSERT INTO books VALUES (43, 'Another Book', 'Author/Another Book', NULL);
             CREATE TABLE data (book INTEGER, format TEXT, name TEXT, uncompressed_size INTEGER);
             INSERT INTO data VALUES (42, 'EPUB', 'Left Hand', 1024);",
        )
        .unwrap();

    let detail = CatalogService::get_book_detail(library.path(), 42)
        .await
        .unwrap();
    assert!(detail.book.authors.is_empty());
    assert!(detail.book.tags.is_empty());
    assert!(detail.book.languages.is_empty());
    assert!(detail.identifiers.is_empty());
    assert_eq!(detail.book.publisher, None);
    assert_eq!(detail.book.series, None);
    assert_eq!(detail.book.rating, None);
    assert_eq!(detail.book.comment, None);
    assert_eq!(detail.format_sizes[0].size_bytes, 1024);
    assert_eq!(
        CatalogService::get_library_uuid(library.path())
            .await
            .unwrap(),
        LIBRARY_UUID
    );
    let page = CatalogService::list_books_page(library.path(), 0, 1, None, None)
        .await
        .unwrap();
    assert_eq!(page.total, 2);
    assert_eq!(page.items[0].id, 43);
    let page = CatalogService::list_books_page(library.path(), 0, 20, None, Some("Darkness"))
        .await
        .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, 42);
    assert!(
        CatalogService::list_series_books(library.path(), "Hainish", None)
            .await
            .unwrap()
            .is_empty()
    );
    let format = CatalogService::get_book_format(library.path(), 42, "epub")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(format.relative_path, "Le Guin/Left Hand/Left Hand.epub");
}

#[tokio::test]
async fn rejects_missing_required_columns_with_schema_diagnostics() {
    for (table, column) in [
        ("books", "path"),
        ("books", "id"),
        ("books", "title"),
        ("data", "book"),
        ("data", "format"),
        ("data", "name"),
        ("data", "uncompressed_size"),
        ("library_id", "uuid"),
    ] {
        let library = tempfile::tempdir().unwrap();
        seed_library(library.path(), SCHEMAS[3].1);
        rusqlite::Connection::open(library.path().join("metadata.db"))
            .unwrap()
            .execute_batch(&format!(
                "ALTER TABLE {table} RENAME COLUMN {column} TO changed_field;"
            ))
            .unwrap();

        let error = CatalogService::inspect_library(library.path())
            .await
            .expect_err("missing required columns must not silently lose catalog data")
            .to_string();

        assert!(error.contains("CALIBRE_SCHEMA_UNSUPPORTED"), "{error}");
        assert!(error.contains("user_version=28"), "{error}");
        assert!(error.contains(&format!("{table}.{column}")), "{error}");
    }
}

#[tokio::test]
async fn keeps_the_cached_catalog_and_files_when_the_remote_schema_is_incompatible() {
    let app = tempfile::tempdir().unwrap();
    let cache = app.path().join("cache");
    let remote = app.path().join("remote");
    seed_library(&cache, SCHEMAS[0].1);
    seed_library(&remote, SCHEMAS[3].1);
    seed_sync_config(app.path());
    let cached_book = cache.join("Le Guin/Left Hand/Left Hand.epub");
    std::fs::create_dir_all(cached_book.parent().unwrap()).unwrap();
    std::fs::write(&cached_book, b"cached book").unwrap();
    rusqlite::Connection::open(remote.join("metadata.db"))
        .unwrap()
        .execute_batch("ALTER TABLE data RENAME COLUMN format TO changed_format;")
        .unwrap();
    let before = std::fs::read(cache.join("metadata.db")).unwrap();
    let config_before = std::fs::read(app.path().join("config.json")).unwrap();

    let report = sync_catalog(app.path()).await;

    assert!(
        report
            .calibre
            .error
            .as_deref()
            .unwrap()
            .contains("CALIBRE_SCHEMA_UNSUPPORTED"),
        "{:?}",
        report.calibre.error
    );
    assert!(!report.calibre.changed);
    assert!(
        std::fs::read(cache.join("metadata.db")).unwrap() == before,
        "incompatible remote metadata replaced the usable cache"
    );
    assert_eq!(
        std::fs::read(app.path().join("config.json")).unwrap(),
        config_before
    );
    assert_eq!(std::fs::read(cached_book).unwrap(), b"cached book");
    assert!(!cache.join("metadata.db.download").exists());
    assert_eq!(
        CatalogService::get_book_detail(&cache, 42)
            .await
            .unwrap()
            .identifiers[0]
            .value,
        "9780441478125"
    );
}

#[tokio::test]
async fn file_queries_do_not_decode_unrelated_book_metadata() {
    let library = tempfile::tempdir().unwrap();
    seed_library(library.path(), SCHEMAS[3].1);
    rusqlite::Connection::open(library.path().join("metadata.db"))
        .unwrap()
        .execute_batch("UPDATE books SET timestamp = X'80FF', pubdate = X'80FF';")
        .unwrap();

    let summaries = CatalogService::list_book_summaries(library.path())
        .await
        .unwrap();
    assert_eq!(summaries[0].id, 42);
    assert_eq!(
        summaries[0].format_paths,
        ["Le Guin/Left Hand/Left Hand.epub"]
    );
    let formats = CatalogService::list_book_formats(library.path(), 42)
        .await
        .unwrap();
    assert_eq!(formats[0].relative_path, summaries[0].format_paths[0]);
    let format = CatalogService::get_book_format(library.path(), 42, "epub")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(format, formats[0]);
    let paths = CatalogService::get_book_file_paths(library.path(), &[(42, "epub".into())])
        .await
        .unwrap();
    assert_eq!(
        paths[&(42, "EPUB".into())],
        library.path().join(&format.relative_path)
    );
}

#[tokio::test]
async fn syncs_between_old_and_new_official_schemas() {
    for (old, new) in [(0, 3), (3, 0)] {
        let app = tempfile::tempdir().unwrap();
        let cache = app.path().join("cache");
        let remote = app.path().join("remote");
        seed_library(&cache, SCHEMAS[old].1);
        seed_library(&remote, SCHEMAS[new].1);
        seed_sync_config(app.path());
        rusqlite::Connection::open(remote.join("metadata.db"))
            .unwrap()
            .execute_batch(
                "UPDATE books SET title = 'Updated title' WHERE id = 42;
                 INSERT INTO books (id, title, path) VALUES (43, 'Another Book', 'Author/Another Book');",
            ).unwrap();

        let report = sync_catalog(app.path()).await;

        assert_eq!(report.error, None);
        assert!(report.calibre.changed);
        assert_eq!(report.calibre.library.book_count, 2);
        assert!(report.calibre.library.metadata_etag.is_some());
        let detail = CatalogService::get_book_detail(&cache, 42).await.unwrap();
        assert_eq!(detail.book.title, "Updated title");
        assert_eq!(detail.book.tags, ["Science fiction"]);
        assert_eq!(detail.identifiers[0].value, "9780441478125");
        assert!(
            std::fs::read(cache.join("metadata.db")).unwrap()
                == std::fs::read(remote.join("metadata.db")).unwrap()
        );
    }
}

#[tokio::test]
async fn replaces_an_incompatible_old_cache_with_a_valid_remote_catalog() {
    let app = tempfile::tempdir().unwrap();
    let cache = app.path().join("cache");
    seed_library(&cache, SCHEMAS[0].1);
    seed_library(&app.path().join("remote"), SCHEMAS[3].1);
    seed_sync_config(app.path());
    rusqlite::Connection::open(cache.join("metadata.db"))
        .unwrap()
        .execute_batch("ALTER TABLE data RENAME COLUMN format TO changed_format;")
        .unwrap();

    let report = sync_catalog(app.path()).await;

    assert_eq!(report.error, None);
    assert!(report.calibre.changed);
    let detail = CatalogService::get_book_detail(&cache, 42).await.unwrap();
    assert_eq!(detail.identifiers[0].value, "9780441478125");
}

#[tokio::test]
async fn does_not_register_an_incompatible_local_library_as_empty() {
    let app = tempfile::tempdir().unwrap();
    let library = app.path().join("library");
    let config = app.path().join("config.json");
    seed_library(&library, SCHEMAS[3].1);
    ConfigService::load_or_initialize(&config, Some(AppConfig::empty())).unwrap();
    rusqlite::Connection::open(library.join("metadata.db"))
        .unwrap()
        .execute_batch("ALTER TABLE data RENAME COLUMN format TO changed_format;")
        .unwrap();

    let error = LibraryService::add_local(
        &config,
        LocalLibraryRequest {
            library_root_path: library.to_string_lossy().into_owned(),
            path: library.to_string_lossy().into_owned(),
            source_path: None,
            sidecar_container_parent_path: Some(
                app.path().join("sidecars").to_string_lossy().into_owned(),
            ),
            name: Some("Incompatible library".into()),
            metadata_uri: None,
            added_at: None,
            security_scoped_bookmark: None,
        },
    )
    .await
    .expect_err("schema errors must not be converted into a zero book count");

    assert!(error.to_string().contains("CALIBRE_SCHEMA_UNSUPPORTED"));
    assert!(ConfigService::load_or_initialize(&config, None)
        .unwrap()
        .libraries
        .is_empty());
}
