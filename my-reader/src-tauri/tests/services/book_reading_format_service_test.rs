use std::collections::BTreeMap;

use my_reader_lib::models::{AppConfig, LibraryConfig};
use my_reader_lib::services::book_reading_format_service::BookReadingFormatService;
use myreader_core::test_support::entities::{
    app::book_reading_format,
    calibre::{books, data},
};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};

use crate::common::calibre::{seed_minimal_calibre_library, SeededBook};

async fn seed_format_library(root: &std::path::Path) -> SeededBook {
    let seeded = seed_minimal_calibre_library(root).await;
    let db_path = root.join("metadata.db");
    let url = format!(
        "sqlite://{}?mode=rwc",
        db_path.to_str().expect("valid utf8")
    );
    let db = sea_orm::Database::connect(&url)
        .await
        .expect("connect to setup db");

    for active in [
        data::ActiveModel {
            id: Set(2),
            book: Set(seeded.book_id),
            format: Set("PDF".to_string()),
            uncompressed_size: Set(21),
            name: Set("It".to_string()),
        },
        data::ActiveModel {
            id: Set(3),
            book: Set(seeded.book_id),
            format: Set("MOBI".to_string()),
            uncompressed_size: Set(34),
            name: Set("It".to_string()),
        },
    ] {
        active.insert(&db).await.expect("insert extra format");
    }

    books::ActiveModel {
        id: Set(43),
        title: Set(Some("Single Format".to_string())),
        sort: Set(Some("Single Format".to_string())),
        author_sort: Set(Some("Author, One".to_string())),
        path: Set(Some("Single Format".to_string())),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("insert single-format book");

    data::ActiveModel {
        id: Set(4),
        book: Set(43),
        format: Set("EPUB".to_string()),
        uncompressed_size: Set(12),
        name: Set("Single Format".to_string()),
    }
    .insert(&db)
    .await
    .expect("insert single readable format");

    seeded
}

fn config_for(lib_root: &std::path::Path) -> AppConfig {
    AppConfig {
        libraries: vec![LibraryConfig {
            id: "lib-format".into(),
            name: "Format Library".into(),
            path: lib_root.to_string_lossy().to_string(),
            source_type: Some("local".into()),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("lib-format".into()),
        ..Default::default()
    }
}

async fn raw_preferences(app_data_dir: &std::path::Path) -> Vec<(i64, String)> {
    let sidecar_root = app_data_dir.join("libraries").join("lib-format");
    let db = myreader_core::test_support::open_db(&sidecar_root.to_string_lossy())
        .await
        .expect("open reading format db");
    book_reading_format::Entity::find()
        .order_by_asc(book_reading_format::Column::BookId)
        .all(&db)
        .await
        .expect("list raw preferences")
        .into_iter()
        .map(|row| (row.book_id, row.reading_format))
        .collect()
}

async fn set_raw_preference(app_data_dir: &std::path::Path, book_id: i64, format: &str) {
    let sidecar_root = app_data_dir.join("libraries").join("lib-format");
    let db = myreader_core::test_support::open_db(&sidecar_root.to_string_lossy())
        .await
        .expect("open reading format db");
    let existing = book_reading_format::Entity::find()
        .filter(book_reading_format::Column::BookId.eq(book_id))
        .one(&db)
        .await
        .expect("read raw preference");
    if let Some(existing) = existing {
        let mut active: book_reading_format::ActiveModel = existing.into();
        active.reading_format = Set(format.to_owned());
        active.update(&db).await.expect("update raw preference");
    } else {
        book_reading_format::ActiveModel {
            id: Set(format!("test-{book_id}")),
            book_id: Set(book_id),
            reading_format: Set(format.to_owned()),
            updated_at: Set(1.0),
        }
        .insert(&db)
        .await
        .expect("insert raw preference");
    }
}

#[tokio::test]
async fn set_should_store_uppercase_format_for_books_with_multiple_readable_formats() {
    let app_data = tempfile::tempdir().unwrap();
    let lib = tempfile::tempdir().unwrap();
    let seeded = seed_format_library(lib.path()).await;
    let config = config_for(lib.path());

    BookReadingFormatService::set(
        app_data.path(),
        &config,
        "lib-format",
        seeded.book_id,
        Some("pdf"),
    )
    .await
    .expect("set format should succeed");

    let formats = BookReadingFormatService::list(app_data.path(), &config, "lib-format")
        .await
        .expect("list should succeed");
    assert_eq!(
        formats,
        BTreeMap::from([(seeded.book_id.to_string(), "PDF".to_string())])
    );
}

#[tokio::test]
async fn set_should_update_existing_preference_and_clear_when_format_is_none() {
    let app_data = tempfile::tempdir().unwrap();
    let lib = tempfile::tempdir().unwrap();
    let seeded = seed_format_library(lib.path()).await;
    let config = config_for(lib.path());

    BookReadingFormatService::set(
        app_data.path(),
        &config,
        "lib-format",
        seeded.book_id,
        Some("epub"),
    )
    .await
    .expect("initial set should succeed");
    BookReadingFormatService::set(
        app_data.path(),
        &config,
        "lib-format",
        seeded.book_id,
        Some("pdf"),
    )
    .await
    .expect("update should succeed");

    let rows = raw_preferences(app_data.path()).await;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0], (seeded.book_id, "PDF".to_string()));

    BookReadingFormatService::set(app_data.path(), &config, "lib-format", seeded.book_id, None)
        .await
        .expect("clear should succeed");
    assert!(raw_preferences(app_data.path()).await.is_empty());
}

#[tokio::test]
async fn set_should_reject_unreadable_format_and_missing_book() {
    let app_data = tempfile::tempdir().unwrap();
    let lib = tempfile::tempdir().unwrap();
    let seeded = seed_format_library(lib.path()).await;
    let config = config_for(lib.path());

    let unreadable = BookReadingFormatService::set(
        app_data.path(),
        &config,
        "lib-format",
        seeded.book_id,
        Some("mobi"),
    )
    .await
    .expect_err("unreadable format should fail");
    assert!(format!("{unreadable}").contains("BOOK_READING_FORMAT_NOT_READABLE: MOBI"));

    let missing =
        BookReadingFormatService::set(app_data.path(), &config, "lib-format", 404, Some("epub"))
            .await
            .expect_err("missing book should fail");
    assert!(format!("{missing}").contains("BOOK_NOT_FOUND: 404"));
}

#[tokio::test]
async fn set_should_clear_single_readable_books_instead_of_storing_redundant_choice() {
    let app_data = tempfile::tempdir().unwrap();
    let lib = tempfile::tempdir().unwrap();
    seed_format_library(lib.path()).await;
    let config = config_for(lib.path());

    BookReadingFormatService::set(app_data.path(), &config, "lib-format", 43, Some("epub"))
        .await
        .expect("single readable format should be a no-op");

    assert!(raw_preferences(app_data.path()).await.is_empty());
}

#[tokio::test]
async fn list_should_ignore_stale_single_format_and_unreadable_preferences() {
    let app_data = tempfile::tempdir().unwrap();
    let lib = tempfile::tempdir().unwrap();
    let seeded = seed_format_library(lib.path()).await;
    let config = config_for(lib.path());
    set_raw_preference(app_data.path(), seeded.book_id, "PDF").await;
    set_raw_preference(app_data.path(), 43, "EPUB").await;
    set_raw_preference(app_data.path(), 404, "PDF").await;

    let formats = BookReadingFormatService::list(app_data.path(), &config, "lib-format")
        .await
        .expect("list should succeed");
    assert_eq!(
        formats,
        BTreeMap::from([(seeded.book_id.to_string(), "PDF".to_string())])
    );
}
