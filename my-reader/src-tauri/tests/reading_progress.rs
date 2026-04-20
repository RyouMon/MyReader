use my_reader_lib::models::BookAnchor;
use my_reader_lib::reading_progress::{get_progress, initialize_schema, set_progress};
use rusqlite::Connection;

/// 创建内存数据库连接，并复用生产 schema 初始化流程。
fn test_connection() -> Connection {
    let conn = Connection::open_in_memory().expect("expected in-memory sqlite connection");
    initialize_schema(&conn).expect("expected reading progress schema initialization");
    conn
}

/// 进度写入后应可完整读回，且格式查询大小写不敏感。
#[test]
fn set_and_get_progress_roundtrip() {
    let conn = test_connection();
    let anchor = BookAnchor {
        chapter_index: 8,
        char_offset: Some(256),
        text_snippet: Some("hello".into()),
        text_snippet_after: Some("world".into()),
    };
    set_progress(&conn, "lib-1", 42, "EPUB", &anchor, 1712345678.0)
        .expect("expected set_progress success");

    let loaded = get_progress(&conn, "lib-1", 42, "epub")
        .expect("expected get_progress success")
        .expect("expected existing progress row");

    assert_eq!(loaded.library_id, "lib-1");
    assert_eq!(loaded.book_id, 42);
    assert_eq!(loaded.format, "EPUB");
    assert_eq!(loaded.anchor.chapter_index, 8);
    assert_eq!(loaded.anchor.char_offset, Some(256));
    assert_eq!(loaded.anchor.text_snippet.as_deref(), Some("hello"));
    assert_eq!(loaded.anchor.text_snippet_after.as_deref(), Some("world"));
}
