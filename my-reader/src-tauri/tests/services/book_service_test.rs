use my_reader_core::test_support::entities::calibre::{
    authors, books, books_authors_link, books_languages_link, books_publishers_link,
    books_ratings_link, books_series_link, books_tags_link, comments, data, identifiers, languages,
    publishers, ratings, series, tags,
};
use my_reader_lib::models::BookEntry;
use my_reader_lib::services::book_service::BookService;
use sea_orm::{ActiveModelTrait, Set};

use crate::common::calibre::create_calibre_db;

async fn seed_catalog_calibre_library(root: &std::path::Path) {
    let db = create_calibre_db(root).await;

    for active in [
        books::ActiveModel {
            id: Set(1),
            title: Set(Some("Alpha Book".to_string())),
            sort: Set(Some("Alpha Book".to_string())),
            timestamp: Set(Some("2024-01-01T00:00:00+00:00".to_string())),
            pubdate: Set(Some("2020-01-01T00:00:00+00:00".to_string())),
            series_index: Set(Some(1.0)),
            author_sort: Set(Some("Adams, Alice".to_string())),
            path: Set(Some("Alpha Book".to_string())),
            flags: Set(Some(1)),
            uuid: Set(Some("uuid-alpha".to_string())),
            has_cover: Set(Some(1)),
            last_modified: Set(Some("2024-01-02T00:00:00+00:00".to_string())),
            ..Default::default()
        },
        books::ActiveModel {
            id: Set(2),
            title: Set(Some("Beta Book".to_string())),
            sort: Set(Some("Beta Book".to_string())),
            timestamp: Set(Some("2024-02-01T00:00:00+00:00".to_string())),
            pubdate: Set(Some("2021-01-01T00:00:00+00:00".to_string())),
            series_index: Set(Some(2.0)),
            author_sort: Set(Some("Brown, Bob".to_string())),
            path: Set(Some("Beta Book".to_string())),
            flags: Set(Some(1)),
            uuid: Set(Some("uuid-beta".to_string())),
            has_cover: Set(Some(0)),
            last_modified: Set(Some("2024-02-02T00:00:00+00:00".to_string())),
            ..Default::default()
        },
        books::ActiveModel {
            id: Set(3),
            title: Set(Some("Gamma Notes".to_string())),
            sort: Set(Some("Gamma Notes".to_string())),
            timestamp: Set(Some("2024-03-01T00:00:00+00:00".to_string())),
            pubdate: Set(Some("2022-01-01T00:00:00+00:00".to_string())),
            author_sort: Set(Some("Clark, Carol".to_string())),
            path: Set(Some("Gamma Notes".to_string())),
            flags: Set(Some(1)),
            uuid: Set(Some("uuid-gamma".to_string())),
            has_cover: Set(Some(0)),
            last_modified: Set(Some("2024-03-02T00:00:00+00:00".to_string())),
            ..Default::default()
        },
    ] {
        active.insert(&db).await.expect("insert book");
    }

    for active in [
        authors::ActiveModel {
            id: Set(1),
            name: Set("Alice Adams".to_string()),
            sort: Set(Some("Adams, Alice".to_string())),
            ..Default::default()
        },
        authors::ActiveModel {
            id: Set(2),
            name: Set("Bob Brown".to_string()),
            sort: Set(Some("Brown, Bob".to_string())),
            ..Default::default()
        },
        authors::ActiveModel {
            id: Set(3),
            name: Set("Carol Clark".to_string()),
            sort: Set(Some("Clark, Carol".to_string())),
            ..Default::default()
        },
    ] {
        active.insert(&db).await.expect("insert author");
    }

    for active in [
        books_authors_link::ActiveModel {
            id: Set(1),
            book: Set(1),
            author: Set(1),
        },
        books_authors_link::ActiveModel {
            id: Set(2),
            book: Set(2),
            author: Set(2),
        },
        books_authors_link::ActiveModel {
            id: Set(3),
            book: Set(3),
            author: Set(3),
        },
    ] {
        active.insert(&db).await.expect("insert author link");
    }

    for active in [
        tags::ActiveModel {
            id: Set(1),
            name: Set("Fiction".to_string()),
            ..Default::default()
        },
        tags::ActiveModel {
            id: Set(2),
            name: Set("Science".to_string()),
            ..Default::default()
        },
        tags::ActiveModel {
            id: Set(3),
            name: Set("History".to_string()),
            ..Default::default()
        },
    ] {
        active.insert(&db).await.expect("insert tag");
    }

    for active in [
        books_tags_link::ActiveModel {
            id: Set(1),
            book: Set(1),
            tag: Set(1),
        },
        books_tags_link::ActiveModel {
            id: Set(2),
            book: Set(2),
            tag: Set(2),
        },
        books_tags_link::ActiveModel {
            id: Set(3),
            book: Set(3),
            tag: Set(3),
        },
    ] {
        active.insert(&db).await.expect("insert tag link");
    }

    series::ActiveModel {
        id: Set(1),
        name: Set("Saga".to_string()),
        sort: Set(Some("Saga".to_string())),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("insert series");

    for active in [
        books_series_link::ActiveModel {
            id: Set(1),
            book: Set(1),
            series: Set(1),
        },
        books_series_link::ActiveModel {
            id: Set(2),
            book: Set(2),
            series: Set(1),
        },
    ] {
        active.insert(&db).await.expect("insert series link");
    }

    for active in [
        data::ActiveModel {
            id: Set(1),
            book: Set(1),
            format: Set("EPUB".to_string()),
            uncompressed_size: Set(1200),
            name: Set("Alpha Book".to_string()),
        },
        data::ActiveModel {
            id: Set(2),
            book: Set(1),
            format: Set("MOBI".to_string()),
            uncompressed_size: Set(1500),
            name: Set("Alpha Book".to_string()),
        },
        data::ActiveModel {
            id: Set(3),
            book: Set(2),
            format: Set("EPUB".to_string()),
            uncompressed_size: Set(900),
            name: Set("Beta Book".to_string()),
        },
        data::ActiveModel {
            id: Set(4),
            book: Set(3),
            format: Set("PDF".to_string()),
            uncompressed_size: Set(2000),
            name: Set("Gamma Notes".to_string()),
        },
    ] {
        active.insert(&db).await.expect("insert format");
    }

    for active in [
        comments::ActiveModel {
            id: Set(1),
            book: Set(1),
            text: Set("Alpha comment".to_string()),
        },
        comments::ActiveModel {
            id: Set(2),
            book: Set(2),
            text: Set("Beta comment".to_string()),
        },
    ] {
        active.insert(&db).await.expect("insert comment");
    }

    for active in [
        publishers::ActiveModel {
            id: Set(1),
            name: Set("Press One".to_string()),
            sort: Set(Some("Press One".to_string())),
            ..Default::default()
        },
        publishers::ActiveModel {
            id: Set(2),
            name: Set("Press Two".to_string()),
            sort: Set(Some("Press Two".to_string())),
            ..Default::default()
        },
    ] {
        active.insert(&db).await.expect("insert publisher");
    }

    for active in [
        books_publishers_link::ActiveModel {
            id: Set(1),
            book: Set(1),
            publisher: Set(1),
        },
        books_publishers_link::ActiveModel {
            id: Set(2),
            book: Set(2),
            publisher: Set(2),
        },
    ] {
        active.insert(&db).await.expect("insert publisher link");
    }

    for active in [
        languages::ActiveModel {
            id: Set(1),
            lang_code: Set("eng".to_string()),
            ..Default::default()
        },
        languages::ActiveModel {
            id: Set(2),
            lang_code: Set("zho".to_string()),
            ..Default::default()
        },
    ] {
        active.insert(&db).await.expect("insert language");
    }

    for active in [
        books_languages_link::ActiveModel {
            id: Set(1),
            book: Set(1),
            lang_code: Set(1),
            item_order: Set(Some(0)),
        },
        books_languages_link::ActiveModel {
            id: Set(2),
            book: Set(2),
            lang_code: Set(2),
            item_order: Set(Some(0)),
        },
    ] {
        active.insert(&db).await.expect("insert language link");
    }

    for active in [
        ratings::ActiveModel {
            id: Set(1),
            rating: Set(8),
            ..Default::default()
        },
        ratings::ActiveModel {
            id: Set(2),
            rating: Set(6),
            ..Default::default()
        },
    ] {
        active.insert(&db).await.expect("insert rating");
    }

    for active in [
        books_ratings_link::ActiveModel {
            id: Set(1),
            book: Set(1),
            rating: Set(1),
        },
        books_ratings_link::ActiveModel {
            id: Set(2),
            book: Set(2),
            rating: Set(2),
        },
    ] {
        active.insert(&db).await.expect("insert rating link");
    }

    for active in [
        identifiers::ActiveModel {
            id: Set(1),
            book: Set(1),
            r#type: Set(Some("goodreads".to_string())),
            val: Set("gr-alpha".to_string()),
        },
        identifiers::ActiveModel {
            id: Set(2),
            book: Set(1),
            r#type: Set(Some("isbn".to_string())),
            val: Set("isbn-alpha".to_string()),
        },
        identifiers::ActiveModel {
            id: Set(3),
            book: Set(2),
            r#type: Set(None),
            val: Set("no-type-beta".to_string()),
        },
    ] {
        active.insert(&db).await.expect("insert identifier");
    }

    let alpha_dir = root.join("Alpha Book");
    std::fs::create_dir_all(&alpha_dir).expect("create alpha dir");
    std::fs::write(alpha_dir.join("cover.jpg"), b"alpha-cover").expect("write cover");
}

fn path_string(root: &std::path::Path) -> String {
    root.to_string_lossy().to_string()
}

fn ids(books: &[BookEntry]) -> Vec<i64> {
    books.iter().map(|book| book.id).collect()
}

#[tokio::test]
async fn get_books_page_should_return_related_metadata_and_sort_by_author() {
    let lib = tempfile::tempdir().unwrap();
    seed_catalog_calibre_library(lib.path()).await;

    let page = BookService::get_books_page(&path_string(lib.path()), 0, 500, Some("author"), None)
        .await
        .expect("page should load");

    assert_eq!(page.total, 3);
    assert_eq!(ids(&page.items), vec![1, 2, 3]);

    let alpha = &page.items[0];
    assert_eq!(alpha.title, "Alpha Book");
    assert_eq!(alpha.author_sort, "Adams, Alice");
    assert_eq!(alpha.authors, vec!["Alice Adams"]);
    assert_eq!(alpha.tags, vec!["Fiction"]);
    assert_eq!(alpha.series.as_deref(), Some("Saga"));
    assert_eq!(alpha.series_index, Some(1.0));
    assert_eq!(alpha.formats, vec!["EPUB", "MOBI"]);
    assert!(alpha.has_cover);
    assert_eq!(alpha.comment.as_deref(), Some("Alpha comment"));
    assert_eq!(alpha.publisher.as_deref(), Some("Press One"));
    assert_eq!(alpha.languages, vec!["eng"]);
    assert_eq!(alpha.rating, Some(8));
    assert_eq!(alpha.uuid.as_deref(), Some("uuid-alpha"));
}

#[tokio::test]
async fn get_books_page_should_search_title_author_tag_and_handle_empty_matches() {
    let lib = tempfile::tempdir().unwrap();
    seed_catalog_calibre_library(lib.path()).await;
    let lib_path = path_string(lib.path());

    let title_match = BookService::get_books_page(&lib_path, 0, 10, Some("recent"), Some("Gamma"))
        .await
        .expect("title search should load");
    assert_eq!(ids(&title_match.items), vec![3]);
    assert_eq!(title_match.total, 1);

    let author_match = BookService::get_books_page(&lib_path, 0, 10, Some("title"), Some("Alice"))
        .await
        .expect("author search should load");
    assert_eq!(ids(&author_match.items), vec![1]);

    let tag_match = BookService::get_books_page(&lib_path, 0, 10, Some("title"), Some("Science"))
        .await
        .expect("tag search should load");
    assert_eq!(ids(&tag_match.items), vec![2]);

    let missing = BookService::get_books_page(&lib_path, 0, 10, Some("title"), Some("Nope"))
        .await
        .expect("missing search should load");
    assert!(missing.items.is_empty());
    assert_eq!(missing.total, 0);
}

#[tokio::test]
async fn get_books_page_by_last_read_should_filter_sort_and_paginate() {
    let lib = tempfile::tempdir().unwrap();
    let sidecar = tempfile::tempdir().unwrap();
    seed_catalog_calibre_library(lib.path()).await;
    let lib_path = path_string(lib.path());
    let sidecar_path = path_string(sidecar.path());

    my_reader_core::api::reading::ReadingService::set_reading_position(
        sidecar.path(),
        lib.path(),
        1,
        "EPUB",
        r#"{"href":"alpha.xhtml","type":"application/xhtml+xml"}"#,
        None,
        1000,
    )
    .await
    .expect("set alpha progress");
    my_reader_core::api::reading::ReadingService::set_reading_position(
        sidecar.path(),
        lib.path(),
        2,
        "EPUB",
        r#"{"href":"beta.xhtml","type":"application/xhtml+xml"}"#,
        None,
        2000,
    )
    .await
    .expect("set beta progress");

    let page = BookService::get_books_page_by_last_read(&lib_path, &sidecar_path, 0, 10, None)
        .await
        .expect("last read page should load");
    assert_eq!(page.total, 2);
    assert_eq!(ids(&page.items), vec![2, 1]);

    let second = BookService::get_books_page_by_last_read(&lib_path, &sidecar_path, 1, 1, None)
        .await
        .expect("paginated last read page should load");
    assert_eq!(second.total, 2);
    assert_eq!(ids(&second.items), vec![1]);

    let filtered =
        BookService::get_books_page_by_last_read(&lib_path, &sidecar_path, 0, 10, Some("Fiction"))
            .await
            .expect("filtered last read page should load");
    assert_eq!(filtered.total, 1);
    assert_eq!(ids(&filtered.items), vec![1]);
}

#[tokio::test]
async fn get_book_detail_should_return_formats_identifiers_and_not_found() {
    let lib = tempfile::tempdir().unwrap();
    seed_catalog_calibre_library(lib.path()).await;
    let lib_path = path_string(lib.path());

    let detail = BookService::get_book_detail(&lib_path, 1)
        .await
        .expect("detail should load");
    assert_eq!(detail.book.title, "Alpha Book");
    assert_eq!(detail.format_sizes.len(), 2);
    assert_eq!(detail.format_sizes[0].format, "EPUB");
    assert_eq!(detail.format_sizes[0].size_bytes, 1200);
    assert_eq!(detail.format_sizes[1].format, "MOBI");
    assert_eq!(detail.identifiers.len(), 2);
    assert_eq!(detail.identifiers[0].id_type, "goodreads");
    assert_eq!(detail.identifiers[0].value, "gr-alpha");
    assert_eq!(detail.identifiers[1].id_type, "isbn");
    assert_eq!(detail.identifiers[1].value, "isbn-alpha");

    let err = BookService::get_book_detail(&lib_path, 404)
        .await
        .expect_err("missing book should fail");
    assert!(format!("{err}").contains("BOOK_NOT_FOUND: 404"));
}

#[tokio::test]
async fn get_series_books_should_order_exclude_and_return_empty_for_unknown_series() {
    let lib = tempfile::tempdir().unwrap();
    seed_catalog_calibre_library(lib.path()).await;
    let lib_path = path_string(lib.path());

    let series = BookService::get_series_books(&lib_path, "Saga", None)
        .await
        .expect("series should load");
    assert_eq!(ids(&series), vec![1, 2]);

    let without_alpha = BookService::get_series_books(&lib_path, "Saga", Some(1))
        .await
        .expect("series with exclusion should load");
    assert_eq!(ids(&without_alpha), vec![2]);

    let unknown = BookService::get_series_books(&lib_path, "Missing", None)
        .await
        .expect("unknown series should load");
    assert!(unknown.is_empty());
}

#[tokio::test]
async fn get_book_cover_bytes_should_read_cover_and_reject_missing_or_unsafe_paths() {
    let lib = tempfile::tempdir().unwrap();
    seed_catalog_calibre_library(lib.path()).await;
    let lib_path = path_string(lib.path());

    let cover = BookService::get_book_cover_bytes(&lib_path, "Alpha Book")
        .await
        .expect("cover lookup should succeed")
        .expect("cover should exist");
    assert_eq!(cover, b"alpha-cover");

    let missing = BookService::get_book_cover_bytes(&lib_path, "Beta Book")
        .await
        .expect("missing cover lookup should succeed");
    assert!(missing.is_none());

    let unsafe_path = BookService::get_book_cover_bytes(&lib_path, "../Alpha Book")
        .await
        .expect("unsafe cover lookup should succeed");
    assert!(unsafe_path.is_none());
}

#[tokio::test]
async fn get_books_should_return_all_books() {
    let lib = tempfile::tempdir().unwrap();
    seed_catalog_calibre_library(lib.path()).await;

    let books = BookService::get_books(&path_string(lib.path()))
        .await
        .expect("books should load");

    assert_eq!(ids(&books), vec![1, 2, 3]);
}
