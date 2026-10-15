use my_reader_core::api::catalog::CatalogService;
use my_reader_core::models::{CatalogQuery, LibraryType};
use std::path::Path;

fn seed(root: &Path) {
    let db = rusqlite::Connection::open(root.join("metadata.db")).unwrap();
    db.execute_batch(include_str!("fixtures/calibre/schema-28.sql"))
        .unwrap();
    db.execute_batch(
        "DROP TRIGGER books_insert_trg; DROP TRIGGER books_update_trg;
        DROP TRIGGER series_insert_trg; DROP TRIGGER series_update_trg;
        INSERT INTO authors(id,name) VALUES (1,'Author A'),(2,'Author B');
        INSERT INTO tags(id,name) VALUES (1,'标签 A'),(2,'标签 B'),(3,'100%_done');
        INSERT INTO series(id,name) VALUES (1,'Series A'),(2,'Series B');",
    )
    .unwrap();
    for id in 1..=6 {
        db.execute("INSERT INTO books(id,title,sort,path,series_index,has_cover) VALUES (?1,'Book','Book',?2,?3,1)",
            rusqlite::params![id,format!("author/book-{id}"),7-id]).unwrap();
        db.execute(
            "INSERT INTO books_authors_link(book,author) VALUES (?1,1)",
            [id],
        )
        .unwrap();
        db.execute("INSERT INTO books_tags_link(book,tag) VALUES (?1,1)", [id])
            .unwrap();
        db.execute(
            "INSERT INTO books_series_link(book,series) VALUES (?1,1)",
            [id],
        )
        .unwrap();
    }
    db.execute_batch(
        "INSERT INTO books_authors_link(book,author) VALUES (5,2),(6,2);
        INSERT INTO books_tags_link(book,tag) VALUES (6,2),(6,3);",
    )
    .unwrap();
}

async fn query(root: &Path, request: CatalogQuery) -> my_reader_core::models::PaginatedBooks {
    CatalogService::query_library_books(LibraryType::Calibre, root, root, request)
        .await
        .unwrap()
}

#[tokio::test]
async fn filters_intersect_every_value_before_counting_and_paging() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path());
    let request = CatalogQuery {
        authors: vec!["Author A".into(), "Author B".into()],
        tags: vec!["标签 A".into(), "标签 B".into(), "标签 A".into()],
        series: vec!["Series A".into()],
        limit: Some(1),
        ..Default::default()
    };
    let page = query(dir.path(), request.clone()).await;
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, 6);
    assert!(query(
        dir.path(),
        CatalogQuery {
            offset: 1,
            ..request.clone()
        }
    )
    .await
    .items
    .is_empty());
    assert_eq!(
        query(
            dir.path(),
            CatalogQuery {
                series: vec!["Series A".into(), "Series B".into()],
                ..request.clone()
            }
        )
        .await
        .total,
        0
    );
    assert_eq!(
        query(
            dir.path(),
            CatalogQuery {
                book_ids: Some(vec![5]),
                ..request.clone()
            }
        )
        .await
        .total,
        0
    );
    assert_eq!(
        query(
            dir.path(),
            CatalogQuery {
                search: Some("100%_done".into()),
                ..request
            }
        )
        .await
        .total,
        1
    );
    assert_eq!(
        query(
            dir.path(),
            CatalogQuery {
                search: Some("100%_other".into()),
                ..Default::default()
            }
        )
        .await
        .total,
        0
    );
    assert_eq!(
        query(
            dir.path(),
            CatalogQuery {
                search: Some("series a".into()),
                ..Default::default()
            }
        )
        .await
        .total,
        6
    );
    assert_eq!(
        query(
            dir.path(),
            CatalogQuery {
                authors: vec!["Author A' OR 1=1 --".into()],
                ..Default::default()
            }
        )
        .await
        .total,
        0
    );
}

#[tokio::test]
async fn directories_count_books_and_pick_at_most_four_covers_in_series_order() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path());
    let navigation =
        CatalogService::catalog_navigation(LibraryType::Calibre, dir.path(), dir.path())
            .await
            .unwrap();
    assert_eq!(navigation.authors.len(), 2);
    assert_eq!(navigation.authors[0].book_count, 6);
    assert!(navigation.authors[0].covers.is_empty());
    assert_eq!(navigation.tags.len(), 3);
    assert_eq!(navigation.series.len(), 1); // No books in Series B.
    assert_eq!(navigation.series[0].book_count, 6);
    assert_eq!(
        navigation.series[0]
            .covers
            .iter()
            .map(|c| c.id)
            .collect::<Vec<_>>(),
        [6, 5, 4, 3]
    );
}

#[tokio::test]
async fn absent_optional_metadata_is_empty_and_cannot_match_a_selected_token() {
    let dir = tempfile::tempdir().unwrap();
    let db = rusqlite::Connection::open(dir.path().join("metadata.db")).unwrap();
    db.execute_batch(
        "CREATE TABLE books(id INTEGER PRIMARY KEY,title TEXT,path TEXT);
        CREATE TABLE data(book INTEGER,format TEXT,name TEXT,uncompressed_size INTEGER);
        INSERT INTO books VALUES (1,'Minimal','book');",
    )
    .unwrap();
    drop(db);
    let navigation =
        CatalogService::catalog_navigation(LibraryType::Calibre, dir.path(), dir.path())
            .await
            .unwrap();
    assert!(
        navigation.authors.is_empty() && navigation.tags.is_empty() && navigation.series.is_empty()
    );
    assert_eq!(
        query(
            dir.path(),
            CatalogQuery {
                tags: vec!["Missing".into()],
                ..Default::default()
            }
        )
        .await
        .total,
        0
    );
    assert_eq!(
        query(
            dir.path(),
            CatalogQuery {
                search: Some("Minimal".into()),
                ..Default::default()
            }
        )
        .await
        .total,
        1
    );
}

#[tokio::test]
async fn recent_reads_filter_before_paging_even_beyond_two_hundred_books() {
    let dir = tempfile::tempdir().unwrap();
    seed(dir.path());
    my_reader_core::api::reading::ReadingService::latest_read_at_by_book(dir.path())
        .await
        .unwrap();
    let metadata = rusqlite::Connection::open(dir.path().join("metadata.db")).unwrap();
    let progress = rusqlite::Connection::open(dir.path().join(".myreader/myreader.db")).unwrap();
    for id in 1..=210 {
        if id > 6 {
            metadata
                .execute(
                    "INSERT INTO books(id,title,path) VALUES (?1,'Recent book',?2)",
                    rusqlite::params![id, format!("book-{id}")],
                )
                .unwrap();
        }
        progress.execute("INSERT INTO reading_progress(id,book_id,format,locator_json,updated_at,sync_conflict_count) VALUES (?1,?2,'EPUB','{}',?2,0)", rusqlite::params![format!("progress-{id}"),id]).unwrap();
    }
    drop(metadata);
    drop(progress);
    let request = CatalogQuery {
        tags: vec!["标签 A".into()],
        sort_by: Some("lastRead".into()),
        offset: 1,
        limit: Some(2),
        ..Default::default()
    };
    let page = query(dir.path(), request).await;
    assert_eq!(page.total, 6);
    assert_eq!(
        page.items.iter().map(|book| book.id).collect::<Vec<_>>(),
        [5, 4]
    );
    let all = query(
        dir.path(),
        CatalogQuery {
            sort_by: Some("lastRead".into()),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(all.items.len(), 210);
    assert_eq!(all.items[0].id, 210);
}
