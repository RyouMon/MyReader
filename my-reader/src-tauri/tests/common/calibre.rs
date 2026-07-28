//! Calibre library fixtures for integration tests.

use std::path::{Path, PathBuf};

use my_reader_core::test_support::entities::calibre::{
    authors, books, books_authors_link, books_languages_link, books_publishers_link,
    books_ratings_link, books_series_link, books_tags_link, comments, data, identifiers, languages,
    publishers, ratings, series, tags,
};
use sea_orm::{
    ActiveModelTrait, ConnectionTrait, Database, DatabaseConnection, EntityTrait, Schema, Set,
};

/// A single book in a minimal Calibre library: `(book_id, format, book_file_path)`.
#[allow(dead_code)] // `file_path` is unused by some command-layer tests.
pub struct SeededBook {
    pub book_id: i64,
    pub format: String,
    pub file_path: PathBuf,
}

/// Create an empty Calibre `metadata.db` using the real SeaORM entity definitions.
pub async fn create_calibre_db(root: &Path) -> DatabaseConnection {
    let db_path = root.join("metadata.db");
    let url = format!(
        "sqlite://{}?mode=rwc",
        db_path.to_str().expect("valid utf8")
    );
    let db = Database::connect(&url).await.expect("connect to setup db");

    let builder = db.get_database_backend();
    let schema = Schema::new(builder);
    create_table(&db, &schema, authors::Entity).await;
    create_table(&db, &schema, books::Entity).await;
    create_table(&db, &schema, books_authors_link::Entity).await;
    create_table(&db, &schema, books_languages_link::Entity).await;
    create_table(&db, &schema, books_publishers_link::Entity).await;
    create_table(&db, &schema, books_ratings_link::Entity).await;
    create_table(&db, &schema, books_series_link::Entity).await;
    create_table(&db, &schema, books_tags_link::Entity).await;
    create_table(&db, &schema, comments::Entity).await;
    create_table(&db, &schema, data::Entity).await;
    create_table(&db, &schema, identifiers::Entity).await;
    create_table(&db, &schema, languages::Entity).await;
    create_table(&db, &schema, publishers::Entity).await;
    create_table(&db, &schema, ratings::Entity).await;
    create_table(&db, &schema, series::Entity).await;
    create_table(&db, &schema, tags::Entity).await;
    db.execute_unprepared(
        "CREATE TABLE IF NOT EXISTS library_id (\
           id INTEGER PRIMARY KEY, uuid TEXT NOT NULL, UNIQUE(uuid)\
         );\
         INSERT OR IGNORE INTO library_id (id, uuid) \
         VALUES (1, '018f2f8d-980b-40ef-b72e-c6e86cb7cc28');",
    )
    .await
    .expect("create Calibre library identity");

    db
}

/// Create `metadata.db` plus one EPUB book under `root`. Returns enough info to invoke
/// book-level commands without further setup.
pub async fn seed_minimal_calibre_library(root: &Path) -> SeededBook {
    let db = create_calibre_db(root).await;

    let book_id = 42i64;
    let book_path = "It";
    let file_name = "It";
    let format = "EPUB";

    books::ActiveModel {
        id: Set(book_id),
        title: Set(Some("It".to_string())),
        sort: Set(Some("It".to_string())),
        author_sort: Set(Some("King, Stephen".to_string())),
        path: Set(Some(book_path.to_string())),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("insert book");

    data::ActiveModel {
        id: Set(1),
        book: Set(book_id),
        format: Set(format.to_string()),
        uncompressed_size: Set(12),
        name: Set(file_name.to_string()),
    }
    .insert(&db)
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

async fn create_table<E>(db: &DatabaseConnection, schema: &Schema, entity: E)
where
    E: EntityTrait,
{
    let mut stmt = schema.create_table_from_entity(entity);
    stmt.if_not_exists();
    db.execute(&stmt).await.expect("create calibre table");
}
