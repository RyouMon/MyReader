use serde_json::json;

use my_reader_lib::services::bookmark_service::BookmarkService;

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
