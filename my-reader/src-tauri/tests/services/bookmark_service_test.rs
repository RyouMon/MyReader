use sea_orm::{ConnectionTrait, DbBackend, Statement};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Barrier;
use tokio::task::JoinSet;

use my_reader_lib::repositories::bookmark_repo::SqliteBookmarkRepository;
use my_reader_lib::services::bookmark_service::BookmarkService;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn open_should_succeed_when_bookmark_database_is_opened_concurrently() {
    const OPEN_COUNT: usize = 8;

    let temp = tempfile::tempdir().unwrap();
    let sidecar_root = temp.path().to_string_lossy().to_string();
    SqliteBookmarkRepository::open(&sidecar_root)
        .await
        .expect("initial database open should create the shared bookmark indexes");

    let barrier = Arc::new(Barrier::new(OPEN_COUNT));
    let mut opens = JoinSet::new();
    for _ in 0..OPEN_COUNT {
        let barrier = Arc::clone(&barrier);
        let sidecar_root = sidecar_root.clone();
        opens.spawn(async move {
            barrier.wait().await;
            SqliteBookmarkRepository::open(&sidecar_root).await
        });
    }

    let mut errors = Vec::new();
    while let Some(result) = opens.join_next().await {
        match result.expect("database open task should complete") {
            Ok(_) => {}
            Err(error) => errors.push(error.to_string()),
        }
    }

    assert!(errors.is_empty(), "concurrent opens failed: {errors:?}");
}

#[tokio::test]
async fn schema_should_match_shared_bookmarks_table_when_database_is_created() {
    let temp = tempfile::tempdir().unwrap();
    let sidecar_root = temp.path().to_string_lossy().to_string();
    let db = SqliteBookmarkRepository::open(&sidecar_root)
        .await
        .expect("database should open");

    let columns = db
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA table_info('bookmarks')",
        ))
        .await
        .expect("columns should be readable");
    let actual: Vec<(String, String, i64)> = columns
        .into_iter()
        .map(|row| {
            let declared_type: String = row.try_get("", "type").unwrap();
            let column_type = match declared_type.to_ascii_uppercase().as_str() {
                "DOUBLE" => "REAL".to_string(),
                _ => declared_type.to_ascii_uppercase(),
            };
            (
                row.try_get("", "name").unwrap(),
                column_type,
                row.try_get("", "notnull").unwrap(),
            )
        })
        .collect();
    assert_eq!(
        actual,
        vec![
            ("id".into(), "TEXT".into(), 1),
            ("book_id".into(), "INTEGER".into(), 1),
            ("format".into(), "TEXT".into(), 1),
            ("locator_key".into(), "TEXT".into(), 1),
            ("locator_json".into(), "TEXT".into(), 1),
            ("created_at".into(), "REAL".into(), 1),
            ("updated_at".into(), "REAL".into(), 1),
            ("deleted_at".into(), "REAL".into(), 0),
        ]
    );

    let indexes = db
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA index_list('bookmarks')",
        ))
        .await
        .expect("indexes should be readable");
    let mut actual_indexes: Vec<(String, i64)> = indexes
        .into_iter()
        .filter_map(|row| {
            let name: String = row.try_get("", "name").ok()?;
            (!name.starts_with("sqlite_autoindex_"))
                .then(|| (name, row.try_get("", "unique").unwrap()))
        })
        .collect();
    actual_indexes.sort();
    assert_eq!(
        actual_indexes,
        vec![
            ("idx_bookmarks_book_format_locator".into(), 1),
            ("idx_bookmarks_updated_at".into(), 0),
        ]
    );

    let unique_columns = db
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA index_info('idx_bookmarks_book_format_locator')",
        ))
        .await
        .expect("unique index columns should be readable")
        .into_iter()
        .map(|row| row.try_get::<String>("", "name").unwrap())
        .collect::<Vec<_>>();
    assert_eq!(unique_columns, vec!["book_id", "format", "locator_key"]);

    let updated_at_columns = db
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA index_info('idx_bookmarks_updated_at')",
        ))
        .await
        .expect("updated-at index columns should be readable")
        .into_iter()
        .map(|row| row.try_get::<String>("", "name").unwrap())
        .collect::<Vec<_>>();
    assert_eq!(updated_at_columns, vec!["updated_at"]);
}

#[tokio::test]
async fn add_should_preserve_full_locator_when_bookmark_is_saved() {
    let temp = tempfile::tempdir().unwrap();
    let sidecar_root = temp.path().to_string_lossy().to_string();
    let locator = json!({
        "href": "OEBPS/chapter.xhtml",
        "type": "application/xhtml+xml",
        "title": "Chapter 3",
        "locations": {
            "fragments": ["paragraph-8"],
            "progression": 0.4,
            "position": 19,
            "totalProgression": 0.2
        },
        "text": {"before": "before", "highlight": "saved text", "after": "after"}
    });

    let added = BookmarkService::add(
        &sidecar_root,
        "lib",
        7,
        "epub",
        "chapter.xhtml#paragraph-8",
        &locator,
    )
    .await
    .expect("add should succeed");
    let rows = BookmarkService::list(&sidecar_root, "lib", 7, "EPUB")
        .await
        .expect("list should succeed");

    assert_eq!(added.format, "EPUB");
    assert_eq!(added.locator, locator);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].locator, locator);
}

#[tokio::test]
async fn delete_should_hide_row_when_bookmark_is_tombstoned() {
    let temp = tempfile::tempdir().unwrap();
    let sidecar_root = temp.path().to_string_lossy().to_string();
    let locator = json!({
        "href": "publication.pdf",
        "type": "application/pdf",
        "locations": {"fragments": ["page=3"], "position": 3}
    });

    let first = BookmarkService::add(&sidecar_root, "lib", 9, "pdf", "page=3", &locator)
        .await
        .expect("add should succeed");
    BookmarkService::delete(&sidecar_root, 9, "PDF", "page=3")
        .await
        .expect("delete should succeed");
    assert!(BookmarkService::list(&sidecar_root, "lib", 9, "PDF")
        .await
        .expect("list should succeed")
        .is_empty());

    let restored = BookmarkService::add(&sidecar_root, "lib", 9, "PDF", "page=3", &locator)
        .await
        .expect("re-add should succeed");
    assert_eq!(restored.id, first.id);
}

#[tokio::test]
async fn add_should_reject_locator_when_required_readium_fields_are_missing() {
    let temp = tempfile::tempdir().unwrap();
    let sidecar_root = temp.path().to_string_lossy().to_string();

    let error = BookmarkService::add(
        &sidecar_root,
        "lib",
        7,
        "EPUB",
        "missing-type",
        &json!({"href": "chapter.xhtml"}),
    )
    .await
    .expect_err("invalid locator should fail");

    assert!(format!("{error}").contains("INVALID_BOOKMARK_LOCATOR"));
}
