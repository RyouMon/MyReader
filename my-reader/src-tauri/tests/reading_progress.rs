use my_reader_lib::reading_progress::{get_progress, initialize_schema, set_progress};
use rusqlite::Connection;
use serde_json::json;

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
    let locator = json!({
        "href": "chapter1.xhtml",
        "type": "application/xhtml+xml",
        "locations": { "position": 1, "progression": 0.0 }
    });
    set_progress(&conn, 42, "EPUB", &locator, 1712345678.0).expect("expected set_progress success");

    let loaded = get_progress(&conn, "lib-1", 42, "epub")
        .expect("expected get_progress success")
        .expect("expected existing progress row");

    assert_eq!(loaded.library_id, "lib-1");
    assert_eq!(loaded.book_id, 42);
    assert_eq!(loaded.format, "EPUB");
    assert_eq!(loaded.locator["href"], "chapter1.xhtml");
    assert_eq!(loaded.locator["locations"]["position"], 1);
}
