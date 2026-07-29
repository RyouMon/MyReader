use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::models::catalog::BookFilePathRequest;
use crate::models::{
    BookDetail, BookEntry, BookFormat, BookIdentifier, BookSummary, FormatSize, PaginatedBooks,
};
use crate::repositories::calibre::CalibreBookRepository;
use crate::CoreError;

pub struct CatalogService;

impl CatalogService {
    pub fn validate_library(library_root: &Path) -> bool {
        CalibreBookRepository::validate_library(&library_root.to_string_lossy())
    }

    pub async fn list_books(library_root: &Path) -> Result<Vec<BookEntry>, CoreError> {
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_all_books()
            .await
    }

    pub async fn list_books_page(
        library_root: &Path,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, CoreError> {
        let repository = CalibreBookRepository::open(&library_root.to_string_lossy()).await?;
        let (items, total) = repository
            .get_books_page(
                offset,
                limit.clamp(1, 200),
                sort_by.unwrap_or("title"),
                search,
            )
            .await?;
        Ok(PaginatedBooks { items, total })
    }

    pub async fn list_books_page_by_last_read(
        library_root: &Path,
        sidecar_root: &Path,
        offset: usize,
        limit: usize,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, CoreError> {
        let mut books = Self::list_books(library_root).await?;
        if let Some(keyword) = search.filter(|value| !value.trim().is_empty()) {
            let keyword = keyword.to_lowercase();
            books.retain(|book| {
                book.title.to_lowercase().contains(&keyword)
                    || book.author_sort.to_lowercase().contains(&keyword)
                    || book
                        .authors
                        .iter()
                        .any(|author| author.to_lowercase().contains(&keyword))
                    || book
                        .tags
                        .iter()
                        .any(|tag| tag.to_lowercase().contains(&keyword))
            });
        }

        let latest_by_book =
            crate::services::reading::ReadingService::latest_read_at_by_book(sidecar_root).await?;
        books.retain(|book| latest_by_book.contains_key(&book.id));
        books.sort_by(|left, right| {
            let left_read_at = latest_by_book.get(&left.id).copied();
            let right_read_at = latest_by_book.get(&right.id).copied();
            match (left_read_at, right_read_at) {
                (Some(left_time), Some(right_time)) => right_time
                    .partial_cmp(&left_time)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase())),
                _ => left.title.to_lowercase().cmp(&right.title.to_lowercase()),
            }
        });

        let total = books.len();
        let items = books
            .into_iter()
            .skip(offset)
            .take(limit.clamp(1, 200))
            .collect();
        Ok(PaginatedBooks { items, total })
    }

    pub async fn get_book_detail(
        library_root: &Path,
        book_id: i64,
    ) -> Result<BookDetail, CoreError> {
        let repository = CalibreBookRepository::open(&library_root.to_string_lossy()).await?;
        let book = repository
            .get_book_by_id(book_id)
            .await?
            .ok_or_else(|| CoreError::NotFound(format!("BOOK_NOT_FOUND: {book_id}")))?;
        let format_sizes = repository
            .get_book_format_sizes(book_id)
            .await?
            .into_iter()
            .map(|(format, size_bytes)| FormatSize { format, size_bytes })
            .collect();
        let identifiers = repository
            .get_book_identifiers(book_id)
            .await?
            .into_iter()
            .map(|(id_type, value)| BookIdentifier { id_type, value })
            .collect();
        Ok(BookDetail {
            book,
            format_sizes,
            identifiers,
        })
    }

    pub async fn list_series_books(
        library_root: &Path,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, CoreError> {
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_books_by_series(series_name, exclude_book_id)
            .await
    }

    pub async fn count_books(library_root: &Path) -> Result<usize, CoreError> {
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_book_count()
            .await
    }

    pub async fn get_library_uuid(library_root: &Path) -> Result<String, CoreError> {
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_library_uuid()
            .await
    }

    pub async fn list_book_summaries(library_root: &Path) -> Result<Vec<BookSummary>, CoreError> {
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_book_summaries()
            .await
    }

    pub async fn list_book_formats(
        library_root: &Path,
        book_id: i64,
    ) -> Result<Vec<BookFormat>, CoreError> {
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_book_formats(book_id)
            .await
    }

    pub async fn get_book_file_path(
        library_root: &Path,
        book_id: i64,
        format: &str,
    ) -> Result<Option<PathBuf>, CoreError> {
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_book_file_path(&library_root.to_string_lossy(), book_id, format)
            .await
    }

    pub async fn get_book_file_paths(
        library_root: &Path,
        requests: &[(i64, String)],
    ) -> Result<HashMap<(i64, String), PathBuf>, CoreError> {
        let requests = requests
            .iter()
            .map(|(book_id, format)| BookFilePathRequest {
                book_id: *book_id,
                format: format.clone(),
            })
            .collect::<Vec<_>>();
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_book_file_paths(&library_root.to_string_lossy(), &requests)
            .await
    }

    pub async fn get_book_cover_path(
        library_root: &Path,
        book_path: &str,
    ) -> Result<Option<PathBuf>, CoreError> {
        CalibreBookRepository::open(&library_root.to_string_lossy())
            .await?
            .get_book_cover_path(book_path)
    }

    pub async fn get_book_cover_bytes(
        library_root: &Path,
        book_path: &str,
    ) -> Result<Option<Vec<u8>>, CoreError> {
        match Self::get_book_cover_path(library_root, book_path).await? {
            Some(path) => Ok(Some(std::fs::read(path)?)),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use sea_orm::{
        ActiveModelTrait, ConnectionTrait, Database, DatabaseConnection, EntityTrait, Schema, Set,
    };

    use crate::entities::calibre::{
        authors, books, books_authors_link, books_languages_link, books_publishers_link,
        books_ratings_link, books_series_link, books_tags_link, comments, data, identifiers,
        languages, publishers, ratings, series, tags,
    };

    async fn create_table<E>(db: &DatabaseConnection, schema: &Schema, entity: E)
    where
        E: EntityTrait,
    {
        let mut statement = schema.create_table_from_entity(entity);
        statement.if_not_exists();
        db.execute(&statement).await.expect("create Calibre table");
    }

    async fn seed_library(root: &Path) {
        let database_path = root.join("metadata.db");
        let database = Database::connect(format!(
            "sqlite://{}?mode=rwc",
            database_path.to_string_lossy()
        ))
        .await
        .expect("open fixture database");
        let schema = Schema::new(database.get_database_backend());
        create_table(&database, &schema, authors::Entity).await;
        create_table(&database, &schema, books::Entity).await;
        create_table(&database, &schema, books_authors_link::Entity).await;
        create_table(&database, &schema, books_languages_link::Entity).await;
        create_table(&database, &schema, books_publishers_link::Entity).await;
        create_table(&database, &schema, books_ratings_link::Entity).await;
        create_table(&database, &schema, books_series_link::Entity).await;
        create_table(&database, &schema, books_tags_link::Entity).await;
        create_table(&database, &schema, comments::Entity).await;
        create_table(&database, &schema, data::Entity).await;
        create_table(&database, &schema, identifiers::Entity).await;
        create_table(&database, &schema, languages::Entity).await;
        create_table(&database, &schema, publishers::Entity).await;
        create_table(&database, &schema, ratings::Entity).await;
        create_table(&database, &schema, series::Entity).await;
        create_table(&database, &schema, tags::Entity).await;
        database
            .execute_unprepared(
                "CREATE TABLE library_id (
                    id INTEGER PRIMARY KEY,
                    uuid TEXT NOT NULL UNIQUE
                );
                INSERT INTO library_id (id, uuid)
                VALUES (1, '018f2f8d-980b-40ef-b72e-c6e86cb7cc28');",
            )
            .await
            .expect("seed library identity");

        books::ActiveModel {
            id: Set(42),
            title: Set(Some("The Left Hand of Darkness".to_owned())),
            sort: Set(Some("Left Hand of Darkness, The".to_owned())),
            author_sort: Set(Some("Le Guin, Ursula K.".to_owned())),
            path: Set(Some(
                "Ursula K. Le Guin/The Left Hand of Darkness".to_owned(),
            )),
            has_cover: Set(Some(1)),
            ..Default::default()
        }
        .insert(&database)
        .await
        .expect("seed book");
        authors::ActiveModel {
            id: Set(7),
            name: Set("Ursula K. Le Guin".to_owned()),
            ..Default::default()
        }
        .insert(&database)
        .await
        .expect("seed author");
        books_authors_link::ActiveModel {
            id: Set(1),
            book: Set(42),
            author: Set(7),
        }
        .insert(&database)
        .await
        .expect("link author");
        data::ActiveModel {
            id: Set(1),
            book: Set(42),
            format: Set("EPUB".to_owned()),
            uncompressed_size: Set(1024),
            name: Set("The Left Hand of Darkness".to_owned()),
        }
        .insert(&database)
        .await
        .expect("seed format");
        identifiers::ActiveModel {
            id: Set(1),
            book: Set(42),
            r#type: Set(Some("isbn".to_owned())),
            val: Set("9780441478125".to_owned()),
        }
        .insert(&database)
        .await
        .expect("seed identifier");
        database.close().await.expect("close fixture database");
    }

    #[tokio::test]
    async fn should_return_joined_catalog_data_when_calibre_library_is_valid() {
        let library = tempfile::tempdir().expect("create library");
        seed_library(library.path()).await;

        let books = super::CatalogService::list_books(library.path())
            .await
            .expect("list books");
        let detail = super::CatalogService::get_book_detail(library.path(), 42)
            .await
            .expect("get book detail");

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].authors, vec!["Ursula K. Le Guin"]);
        assert_eq!(books[0].title_sort, "Left Hand of Darkness, The");
        assert_eq!(detail.format_sizes[0].size_bytes, 1024);
        assert_eq!(detail.identifiers[0].value, "9780441478125");
    }

    #[tokio::test]
    async fn should_return_identity_and_format_path_when_calibre_library_is_valid() {
        let library = tempfile::tempdir().expect("create library");
        seed_library(library.path()).await;

        let library_uuid = super::CatalogService::get_library_uuid(library.path())
            .await
            .expect("read library identity");
        let formats = super::CatalogService::list_book_formats(library.path(), 42)
            .await
            .expect("list book formats");
        let summaries = super::CatalogService::list_book_summaries(library.path())
            .await
            .expect("list book summaries");

        assert_eq!(library_uuid, "018f2f8d-980b-40ef-b72e-c6e86cb7cc28");
        assert_eq!(formats.len(), 1);
        assert_eq!(
            formats[0].relative_path,
            "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub"
        );
        assert_eq!(
            summaries[0].format_paths,
            vec![formats[0].relative_path.clone()]
        );
    }

    #[tokio::test]
    async fn should_sort_and_filter_books_when_last_read_page_is_requested() {
        let library = tempfile::tempdir().expect("create library");
        let sidecar = tempfile::tempdir().expect("create sidecar");
        seed_library(library.path()).await;
        let database = Database::connect(format!(
            "sqlite://{}?mode=rw",
            library.path().join("metadata.db").to_string_lossy()
        ))
        .await
        .expect("open fixture database");
        books::ActiveModel {
            id: Set(43),
            title: Set(Some("A Wizard of Earthsea".to_owned())),
            sort: Set(Some("Wizard of Earthsea, A".to_owned())),
            author_sort: Set(Some("Le Guin, Ursula K.".to_owned())),
            path: Set(Some("Ursula K. Le Guin/A Wizard of Earthsea".to_owned())),
            has_cover: Set(Some(0)),
            ..Default::default()
        }
        .insert(&database)
        .await
        .expect("seed second book");
        database.close().await.expect("close fixture database");

        crate::services::reading::ReadingService::set_reading_position(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            r#"{"href":"left-hand.xhtml","type":"application/xhtml+xml"}"#,
            Some(0.4),
            1_000,
        )
        .await
        .expect("write older position");
        crate::services::reading::ReadingService::set_reading_position(
            sidecar.path(),
            library.path(),
            43,
            "EPUB",
            r#"{"href":"earthsea.xhtml","type":"application/xhtml+xml"}"#,
            Some(0.6),
            2_000,
        )
        .await
        .expect("write newer position");

        let page = super::CatalogService::list_books_page_by_last_read(
            library.path(),
            sidecar.path(),
            0,
            10,
            None,
        )
        .await
        .expect("list recent books");
        let filtered = super::CatalogService::list_books_page_by_last_read(
            library.path(),
            sidecar.path(),
            0,
            10,
            Some("Darkness"),
        )
        .await
        .expect("filter recent books");

        assert_eq!(page.total, 2);
        assert_eq!(page.items[0].id, 43);
        assert_eq!(page.items[1].id, 42);
        assert_eq!(filtered.total, 1);
        assert_eq!(filtered.items[0].id, 42);
    }
}
