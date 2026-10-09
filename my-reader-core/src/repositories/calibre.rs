use std::collections::HashMap;
use std::path::{Path, PathBuf};

use sea_orm::{
    ColumnTrait, Database, DatabaseConnection, EntityTrait, ExprTrait, FromQueryResult, Iterable,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Select,
};
use tracing::{debug, info};

use super::calibre_schema::{CatalogSchema, Metadata};
use sea_orm::sea_query::Expr;

use crate::entities::calibre::{
    authors, books, books_authors_link, books_languages_link, books_publishers_link,
    books_ratings_link, books_series_link, books_tags_link, comments, data, identifiers, languages,
    library_id, publishers, ratings, series, tags,
};
use crate::models::catalog::BookFilePathRequest;
use crate::models::{BookEntry, BookFormat, BookSummary};
use crate::CoreError;

#[derive(FromQueryResult)]
struct BookPathRow {
    id: i64,
    path: Option<String>,
}

#[derive(FromQueryResult)]
struct BookSummaryRow {
    id: i64,
    path: Option<String>,
    has_cover: Option<i64>,
}

#[derive(FromQueryResult)]
struct BookLinkRow {
    book: i64,
    target: i64,
}

#[derive(FromQueryResult)]
struct FormatRow {
    book: i64,
    format: String,
    name: String,
    uncompressed_size: i64,
}

#[derive(FromQueryResult)]
struct CommentRow {
    book: i64,
    text: String,
}

#[derive(FromQueryResult)]
struct IdentifierRow {
    r#type: Option<String>,
    val: String,
}

#[derive(FromQueryResult)]
struct NamedRow {
    id: i64,
    name: String,
}

#[derive(FromQueryResult)]
struct LanguageRow {
    id: i64,
    lang_code: String,
}

#[derive(FromQueryResult)]
struct RatingRow {
    id: i64,
    rating: Option<i64>,
}

/// Shared catalog queries over either an external Calibre database or a
/// MyReader-owned local projection.
pub struct CatalogRepository {
    db: DatabaseConnection,
    content_root: PathBuf,
    schema: CatalogSchema,
}

pub type CalibreBookRepository = CatalogRepository;

impl CatalogRepository {
    pub async fn open(library_path: &str) -> Result<Self, CoreError> {
        info!("Start to open Calibre database. library path: \"{library_path}\"");
        let db_path = Path::new(library_path).join("metadata.db");
        Self::open_calibre_file(&db_path).await
    }

    async fn open_calibre_file(db_path: &Path) -> Result<Self, CoreError> {
        let url = format!(
            "sqlite://{}?mode=ro",
            db_path
                .to_str()
                .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?
        );
        let db = Database::connect(&url)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        info!(
            "Success to open Calibre database. db path: \"{}\"",
            db_path.display()
        );
        let schema = match CatalogSchema::inspect(&db).await {
            Ok(schema) => schema,
            Err(error) => {
                let _ = db.close().await;
                return Err(error);
            }
        };
        let mut repository = Self::from_connection(db, db_path.parent().unwrap_or(Path::new("")));
        repository.schema = schema;
        Ok(repository)
    }

    pub(crate) async fn validate_calibre_metadata(db_path: &Path) -> Result<u64, CoreError> {
        let repository = Self::open_calibre_file(db_path).await?;
        let result: Result<u64, CoreError> = async {
            repository.get_library_uuid().await?;
            Ok(repository.get_book_summaries().await?.len() as u64)
        }
        .await;
        let closed = repository.db.close().await;
        let count = result?;
        closed?;
        Ok(count)
    }

    pub async fn open_myreader(
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<Self, CoreError> {
        let sidecar_root = sidecar_root
            .to_str()
            .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
        let db = crate::database::open_db(sidecar_root).await?;
        Ok(Self::from_connection(db, content_root))
    }

    pub(crate) fn from_connection(db: DatabaseConnection, content_root: &Path) -> Self {
        Self {
            db,
            content_root: content_root.to_path_buf(),
            schema: CatalogSchema::default(),
        }
    }

    pub fn validate_library(library_path: &str) -> bool {
        Path::new(library_path).join("metadata.db").is_file()
    }

    pub async fn get_library_uuid(&self) -> Result<String, CoreError> {
        self.schema.require_identity()?;
        let row = library_id::Entity::find()
            .select_only()
            .column(library_id::Column::Uuid)
            .into_tuple::<String>()
            .one(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?
            .ok_or_else(|| CoreError::Database("Calibre library UUID is missing".into()))?;
        Ok(row.to_lowercase())
    }

    pub async fn get_book_summaries(&self) -> Result<Vec<BookSummary>, CoreError> {
        self.schema.require_catalog()?;
        let book_rows = book_paths_query()
            .expr_as(
                Expr::cust(self.schema.book_column_sql(books::Column::HasCover)),
                books::Column::HasCover,
            )
            .into_model::<BookSummaryRow>()
            .all(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?;
        let format_rows = data::Entity::find()
            .select_only()
            .columns([
                data::Column::Book,
                data::Column::Format,
                data::Column::Name,
                data::Column::UncompressedSize,
            ])
            .into_model::<FormatRow>()
            .all(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?;
        let book_paths = book_rows
            .iter()
            .filter_map(|book| book.path.as_deref().map(|path| (book.id, path)))
            .collect::<HashMap<_, _>>();
        let mut formats_by_book = HashMap::<i64, Vec<String>>::new();
        let mut format_paths_by_book = HashMap::<i64, Vec<String>>::new();
        for row in format_rows {
            formats_by_book
                .entry(row.book)
                .or_default()
                .push(row.format.clone());
            if let Some(book_path) = book_paths.get(&row.book) {
                format_paths_by_book.entry(row.book).or_default().push(
                    Path::new(book_path)
                        .join(format!("{}.{}", row.name, row.format.to_lowercase()))
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }

        Ok(book_rows
            .into_iter()
            .map(|book| BookSummary {
                id: book.id,
                path: book.path.unwrap_or_default(),
                has_cover: book.has_cover.unwrap_or_default() != 0,
                formats: formats_by_book.remove(&book.id).unwrap_or_default(),
                format_paths: format_paths_by_book.remove(&book.id).unwrap_or_default(),
            })
            .collect())
    }

    pub async fn get_book_formats(&self, book_id: i64) -> Result<Vec<BookFormat>, CoreError> {
        self.schema.require_catalog()?;
        let book = book_paths_query()
            .filter(books::Column::Id.eq(book_id))
            .into_model::<BookPathRow>()
            .one(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?
            .ok_or_else(|| CoreError::NotFound(format!("BOOK_NOT_FOUND: {book_id}")))?;
        let book_path = book.path.unwrap_or_default();
        let rows = data::Entity::find()
            .select_only()
            .columns([
                data::Column::Book,
                data::Column::Format,
                data::Column::Name,
                data::Column::UncompressedSize,
            ])
            .filter(data::Column::Book.eq(book_id))
            .order_by_asc(data::Column::Format)
            .into_model::<FormatRow>()
            .all(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?;

        Ok(rows
            .into_iter()
            .map(|row| book_format_from_row(&book_path, row))
            .collect())
    }

    pub async fn get_book_format(
        &self,
        book_id: i64,
        format: &str,
    ) -> Result<Option<BookFormat>, CoreError> {
        self.schema.require_catalog()?;
        let book = book_paths_query()
            .filter(books::Column::Id.eq(book_id))
            .into_model::<BookPathRow>()
            .one(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?;
        let Some(book) = book else {
            return Ok(None);
        };
        let rows = data::Entity::find()
            .select_only()
            .columns([
                data::Column::Book,
                data::Column::Format,
                data::Column::Name,
                data::Column::UncompressedSize,
            ])
            .filter(data::Column::Book.eq(book_id))
            .into_model::<FormatRow>()
            .all(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?;

        Ok(rows
            .into_iter()
            .find(|row| row.format.eq_ignore_ascii_case(format))
            .map(|row| book_format_from_row(book.path.as_deref().unwrap_or_default(), row)))
    }

    pub async fn get_book_file_paths(
        &self,
        requests: &[BookFilePathRequest],
    ) -> Result<HashMap<(i64, String), PathBuf>, CoreError> {
        self.schema.require_catalog()?;
        if requests.is_empty() {
            return Ok(HashMap::new());
        }

        let book_ids: Vec<i64> = requests.iter().map(|item| item.book_id).collect();
        let book_rows = book_paths_query()
            .filter(books::Column::Id.is_in(book_ids.clone()))
            .into_model::<BookPathRow>()
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        let data_rows = data::Entity::find()
            .select_only()
            .columns([
                data::Column::Book,
                data::Column::Format,
                data::Column::Name,
                data::Column::UncompressedSize,
            ])
            .filter(data::Column::Book.is_in(book_ids))
            .into_model::<FormatRow>()
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let books_by_id: HashMap<i64, BookPathRow> =
            book_rows.into_iter().map(|book| (book.id, book)).collect();
        let mut data_by_book: HashMap<i64, Vec<FormatRow>> = HashMap::new();
        for row in data_rows {
            data_by_book.entry(row.book).or_default().push(row);
        }

        let mut result = HashMap::new();
        for request in requests {
            let Some(book) = books_by_id.get(&request.book_id) else {
                continue;
            };
            let Some(rows) = data_by_book.get(&request.book_id) else {
                continue;
            };
            let Some(format_row) = rows
                .iter()
                .find(|row| row.format.eq_ignore_ascii_case(&request.format))
            else {
                continue;
            };
            let relative_path = book_format_relative_path(
                book.path.as_deref().unwrap_or_default(),
                &format_row.name,
                &format_row.format,
            );
            let path = self.content_root.join(relative_path);
            result.insert((request.book_id, request.format.to_uppercase()), path);
        }
        Ok(result)
    }
}

async fn load_book_authors(
    db: &DatabaseConnection,
    schema: &CatalogSchema,
    book_ids: &[i64],
) -> Result<HashMap<i64, Vec<String>>, CoreError> {
    if !schema.supports(Metadata::Authors) {
        return Ok(HashMap::new());
    }

    // Authors: books_authors_link JOIN authors
    let author_links = books_authors_link::Entity::find()
        .select_only()
        .column(books_authors_link::Column::Book)
        .column_as(books_authors_link::Column::Author, "target")
        .filter(books_authors_link::Column::Book.is_in(book_ids.iter().copied()))
        .into_model::<BookLinkRow>()
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let author_ids: Vec<i64> = author_links.iter().map(|l| l.target).collect();
    let author_models = if author_ids.is_empty() {
        Vec::new()
    } else {
        authors::Entity::find()
            .select_only()
            .columns([authors::Column::Id, authors::Column::Name])
            .filter(authors::Column::Id.is_in(author_ids))
            .into_model::<NamedRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let author_map: HashMap<i64, String> =
        author_models.into_iter().map(|a| (a.id, a.name)).collect();

    let mut book_authors_map: HashMap<i64, Vec<String>> = HashMap::new();
    for link in &author_links {
        if let Some(name) = author_map.get(&link.target) {
            book_authors_map
                .entry(link.book)
                .or_default()
                .push(name.clone());
        }
    }

    Ok(book_authors_map)
}

async fn load_book_tags(
    db: &DatabaseConnection,
    schema: &CatalogSchema,
    book_ids: &[i64],
) -> Result<HashMap<i64, Vec<String>>, CoreError> {
    if !schema.supports(Metadata::Tags) {
        return Ok(HashMap::new());
    }

    // Tags: books_tags_link JOIN tags
    let tag_links = books_tags_link::Entity::find()
        .select_only()
        .column(books_tags_link::Column::Book)
        .column_as(books_tags_link::Column::Tag, "target")
        .filter(books_tags_link::Column::Book.is_in(book_ids.iter().copied()))
        .into_model::<BookLinkRow>()
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let tag_ids: Vec<i64> = tag_links.iter().map(|l| l.target).collect();
    let tag_models = if tag_ids.is_empty() {
        Vec::new()
    } else {
        tags::Entity::find()
            .select_only()
            .columns([tags::Column::Id, tags::Column::Name])
            .filter(tags::Column::Id.is_in(tag_ids))
            .into_model::<NamedRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let tag_map: HashMap<i64, String> = tag_models.into_iter().map(|t| (t.id, t.name)).collect();

    let mut book_tags_map: HashMap<i64, Vec<String>> = HashMap::new();
    for link in &tag_links {
        if let Some(name) = tag_map.get(&link.target) {
            book_tags_map
                .entry(link.book)
                .or_default()
                .push(name.clone());
        }
    }

    Ok(book_tags_map)
}

async fn matching_book_ids(
    db: &DatabaseConnection,
    schema: &CatalogSchema,
    keyword: &str,
) -> Result<std::collections::HashSet<i64>, CoreError> {
    // Split-query search: find matching author/tag IDs first, then filter books in code.

    // 1. Find author IDs whose name matches (case-insensitive)
    let matching_author_ids: Vec<i64> = if schema.supports(Metadata::Authors) {
        authors::Entity::find()
            .select_only()
            .columns([authors::Column::Id, authors::Column::Name])
            .filter(authors::Column::Name.contains(keyword))
            .into_model::<NamedRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .into_iter()
            .map(|a| a.id)
            .collect()
    } else {
        Vec::new()
    };

    // 2. Find book IDs linked to those authors
    let author_book_ids: Vec<i64> = if matching_author_ids.is_empty() {
        Vec::new()
    } else {
        books_authors_link::Entity::find()
            .select_only()
            .column(books_authors_link::Column::Book)
            .column_as(books_authors_link::Column::Author, "target")
            .filter(books_authors_link::Column::Author.is_in(matching_author_ids))
            .into_model::<BookLinkRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .into_iter()
            .map(|l| l.book)
            .collect()
    };

    // 3. Find tag IDs whose name matches (case-insensitive)
    let matching_tag_ids: Vec<i64> = if schema.supports(Metadata::Tags) {
        tags::Entity::find()
            .select_only()
            .columns([tags::Column::Id, tags::Column::Name])
            .filter(tags::Column::Name.contains(keyword))
            .into_model::<NamedRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .into_iter()
            .map(|t| t.id)
            .collect()
    } else {
        Vec::new()
    };

    // 4. Find book IDs linked to those tags
    let tag_book_ids: Vec<i64> = if matching_tag_ids.is_empty() {
        Vec::new()
    } else {
        books_tags_link::Entity::find()
            .select_only()
            .column(books_tags_link::Column::Book)
            .column_as(books_tags_link::Column::Tag, "target")
            .filter(books_tags_link::Column::Tag.is_in(matching_tag_ids))
            .into_model::<BookLinkRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
            .into_iter()
            .map(|l| l.book)
            .collect()
    };

    // 5. Combine: books where sort/title/author_sort contains keyword OR book is in author/tag match sets
    let all_books = book_query(schema)
        .filter(
            Expr::cust(schema.book_column_sql(books::Column::Sort))
                .like(format!("%{keyword}%"))
                .or(books::Column::Title.contains(keyword))
                .or(
                    Expr::cust(schema.book_column_sql(books::Column::AuthorSort))
                        .like(format!("%{keyword}%")),
                ),
        )
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let mut matched_ids: std::collections::HashSet<i64> =
        all_books.into_iter().map(|b| b.id).collect();
    for id in author_book_ids {
        matched_ids.insert(id);
    }
    for id in tag_book_ids {
        matched_ids.insert(id);
    }

    Ok(matched_ids)
}

fn book_paths_query() -> Select<books::Entity> {
    books::Entity::find()
        .select_only()
        .columns([books::Column::Id, books::Column::Path])
}

fn book_query(schema: &CatalogSchema) -> Select<books::Entity> {
    let mut query = books::Entity::find().select_only();
    for column in books::Column::iter() {
        query = query.expr_as(Expr::cust(schema.book_column_sql(column)), column);
    }
    query
}

fn book_page_order(schema: &CatalogSchema, sort_by: &str) -> (Expr, sea_orm::Order) {
    let (column, order) = match sort_by {
        "author" => (books::Column::AuthorSort, sea_orm::Order::Asc),
        "recent" | "progress" => (books::Column::Timestamp, sea_orm::Order::Desc),
        _ => (books::Column::Sort, sea_orm::Order::Asc),
    };
    (
        Expr::cust(format!("{} COLLATE NOCASE", schema.book_column_sql(column))),
        order,
    )
}

async fn load_book_ratings(
    db: &DatabaseConnection,
    schema: &CatalogSchema,
    book_ids: &[i64],
) -> Result<HashMap<i64, i32>, CoreError> {
    let rating_links = if schema.supports(Metadata::Ratings) {
        books_ratings_link::Entity::find()
            .select_only()
            .column(books_ratings_link::Column::Book)
            .column_as(books_ratings_link::Column::Rating, "target")
            .filter(books_ratings_link::Column::Book.is_in(book_ids.iter().copied()))
            .into_model::<BookLinkRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    } else {
        Vec::new()
    };

    let rating_ids: Vec<i64> = rating_links.iter().map(|l| l.target).collect();
    let rating_models = if rating_ids.is_empty() {
        Vec::new()
    } else {
        ratings::Entity::find()
            .select_only()
            .columns([ratings::Column::Id, ratings::Column::Rating])
            .filter(ratings::Column::Id.is_in(rating_ids))
            .into_model::<RatingRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let rating_map: HashMap<i64, i64> = rating_models
        .into_iter()
        .filter_map(|r| r.rating.map(|rating| (r.id, rating)))
        .collect();

    let mut book_rating_map: HashMap<i64, i32> = HashMap::new();
    for link in &rating_links {
        if let Some(r) = rating_map.get(&link.target) {
            book_rating_map.insert(link.book, *r as i32);
        }
    }

    Ok(book_rating_map)
}

/// Fetch all related data for a list of book IDs and assemble BookEntry objects.
async fn assemble_book_entries(
    db: &DatabaseConnection,
    schema: &CatalogSchema,
    book_models: Vec<books::Model>,
) -> Result<Vec<BookEntry>, CoreError> {
    if book_models.is_empty() {
        return Ok(Vec::new());
    }

    let book_ids: Vec<i64> = book_models.iter().map(|b| b.id).collect();

    let mut book_authors_map = load_book_authors(db, schema, &book_ids).await?;

    let mut book_tags_map = load_book_tags(db, schema, &book_ids).await?;

    // Series: books_series_link JOIN series
    let series_links = if schema.supports(Metadata::Series) {
        books_series_link::Entity::find()
            .select_only()
            .column(books_series_link::Column::Book)
            .column_as(books_series_link::Column::Series, "target")
            .filter(books_series_link::Column::Book.is_in(book_ids.clone()))
            .into_model::<BookLinkRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    } else {
        Vec::new()
    };

    let series_ids: Vec<i64> = series_links.iter().map(|l| l.target).collect();
    let series_models = if series_ids.is_empty() {
        Vec::new()
    } else {
        series::Entity::find()
            .select_only()
            .columns([series::Column::Id, series::Column::Name])
            .filter(series::Column::Id.is_in(series_ids))
            .into_model::<NamedRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let series_map: HashMap<i64, String> =
        series_models.into_iter().map(|s| (s.id, s.name)).collect();

    let mut book_series_map: HashMap<i64, String> = HashMap::new();
    for link in &series_links {
        if let Some(name) = series_map.get(&link.target) {
            book_series_map.insert(link.book, name.clone());
        }
    }

    // Formats: data table
    let data_rows = data::Entity::find()
        .select_only()
        .columns([
            data::Column::Book,
            data::Column::Format,
            data::Column::Name,
            data::Column::UncompressedSize,
        ])
        .filter(data::Column::Book.is_in(book_ids.clone()))
        .into_model::<FormatRow>()
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let mut book_formats_map: HashMap<i64, Vec<String>> = HashMap::new();
    for d in &data_rows {
        book_formats_map
            .entry(d.book)
            .or_default()
            .push(d.format.clone());
    }

    // Comments
    let comment_rows = if schema.supports(Metadata::Comments) {
        comments::Entity::find()
            .select_only()
            .columns([comments::Column::Book, comments::Column::Text])
            .filter(comments::Column::Book.is_in(book_ids.clone()))
            .into_model::<CommentRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    } else {
        Vec::new()
    };

    let mut book_comment_map: HashMap<i64, String> =
        comment_rows.into_iter().map(|c| (c.book, c.text)).collect();

    // Publishers: books_publishers_link JOIN publishers
    let pub_links = if schema.supports(Metadata::Publishers) {
        books_publishers_link::Entity::find()
            .select_only()
            .column(books_publishers_link::Column::Book)
            .column_as(books_publishers_link::Column::Publisher, "target")
            .filter(books_publishers_link::Column::Book.is_in(book_ids.clone()))
            .into_model::<BookLinkRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    } else {
        Vec::new()
    };

    let pub_ids: Vec<i64> = pub_links.iter().map(|l| l.target).collect();
    let pub_models = if pub_ids.is_empty() {
        Vec::new()
    } else {
        publishers::Entity::find()
            .select_only()
            .columns([publishers::Column::Id, publishers::Column::Name])
            .filter(publishers::Column::Id.is_in(pub_ids))
            .into_model::<NamedRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let pub_map: HashMap<i64, String> = pub_models.into_iter().map(|p| (p.id, p.name)).collect();

    let mut book_publisher_map: HashMap<i64, String> = HashMap::new();
    for link in &pub_links {
        if let Some(name) = pub_map.get(&link.target) {
            book_publisher_map.insert(link.book, name.clone());
        }
    }

    // Languages: books_languages_link JOIN languages
    let lang_links = if schema.supports(Metadata::Languages) {
        books_languages_link::Entity::find()
            .select_only()
            .column(books_languages_link::Column::Book)
            .column_as(books_languages_link::Column::LangCode, "target")
            .filter(books_languages_link::Column::Book.is_in(book_ids.clone()))
            .into_model::<BookLinkRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    } else {
        Vec::new()
    };

    let lang_ids: Vec<i64> = lang_links.iter().map(|l| l.target).collect();
    let lang_models = if lang_ids.is_empty() {
        Vec::new()
    } else {
        languages::Entity::find()
            .select_only()
            .columns([languages::Column::Id, languages::Column::LangCode])
            .filter(languages::Column::Id.is_in(lang_ids))
            .into_model::<LanguageRow>()
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let lang_map: HashMap<i64, String> = lang_models
        .into_iter()
        .map(|l| (l.id, l.lang_code))
        .collect();

    let mut book_languages_map: HashMap<i64, Vec<String>> = HashMap::new();
    for link in &lang_links {
        if let Some(code) = lang_map.get(&link.target) {
            book_languages_map
                .entry(link.book)
                .or_default()
                .push(code.clone());
        }
    }

    let mut book_rating_map = load_book_ratings(db, schema, &book_ids).await?;

    // Assemble BookEntry objects
    Ok(book_models
        .into_iter()
        .map(|b| BookEntry {
            id: b.id,
            title: b.title.unwrap_or_default(),
            title_sort: b.sort.unwrap_or_default(),
            author_sort: b.author_sort.unwrap_or_default(),
            authors: book_authors_map.remove(&b.id).unwrap_or_default(),
            tags: book_tags_map.remove(&b.id).unwrap_or_default(),
            series: book_series_map.remove(&b.id),
            series_index: b.series_index,
            formats: book_formats_map.remove(&b.id).unwrap_or_default(),
            has_cover: b.has_cover.unwrap_or(0) != 0,
            path: b.path.unwrap_or_default(),
            timestamp: b.timestamp,
            pubdate: b.pubdate,
            last_modified: b.last_modified,
            comment: book_comment_map.remove(&b.id),
            publisher: book_publisher_map.remove(&b.id),
            languages: book_languages_map.remove(&b.id).unwrap_or_default(),
            rating: book_rating_map.remove(&b.id),
            uuid: b.uuid,
        })
        .collect())
}

impl CatalogRepository {
    pub(crate) async fn get_all_books(&self) -> Result<Vec<BookEntry>, CoreError> {
        self.schema.require_catalog()?;
        info!("Start to load all books from Calibre.");
        let book_models = book_query(&self.schema)
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        let result = assemble_book_entries(&self.db, &self.schema, book_models).await?;
        info!(
            "Success to load all books from Calibre. count: {}",
            result.len()
        );
        Ok(result)
    }

    pub(crate) async fn get_books_page(
        &self,
        offset: usize,
        limit: usize,
        sort_by: &str,
        search: Option<&str>,
    ) -> Result<(Vec<BookEntry>, usize), CoreError> {
        self.schema.require_catalog()?;
        info!(
            "Start to query books page. offset: {offset}, limit: {limit}, sort by: {sort_by}, search: {search:?}"
        );

        let (query, total) = if let Some(keyword) = search.filter(|s| !s.is_empty()) {
            let matched_ids = matching_book_ids(&self.db, &self.schema, keyword).await?;
            let total = matched_ids.len();
            if matched_ids.is_empty() {
                info!("Success to query books page. returned count: 0, total: 0");
                return Ok((Vec::new(), 0));
            }
            (
                book_query(&self.schema).filter(books::Column::Id.is_in(matched_ids)),
                total,
            )
        } else {
            let total = book_query(&self.schema)
                .count(&self.db)
                .await
                .map_err(|e| CoreError::Database(e.to_string()))?;
            (book_query(&self.schema), total as usize)
        };

        let (order_expr, order_dir) = book_page_order(&self.schema, sort_by);
        let book_models = query
            .order_by(order_expr, order_dir)
            .offset(offset as u64)
            .limit(limit as u64)
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let result = assemble_book_entries(&self.db, &self.schema, book_models).await?;
        info!(
            "Success to query books page. returned count: {}, total: {}",
            result.len(),
            total
        );
        Ok((result, total))
    }

    pub(crate) async fn get_book_by_id(
        &self,
        book_id: i64,
    ) -> Result<Option<BookEntry>, CoreError> {
        self.schema.require_catalog()?;
        info!("Start to load book by id. book id: {book_id}");
        let book_model = book_query(&self.schema)
            .filter(books::Column::Id.eq(book_id))
            .one(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        match book_model {
            Some(m) => {
                let entries = assemble_book_entries(&self.db, &self.schema, vec![m]).await?;
                Ok(entries.into_iter().next())
            }
            None => Ok(None),
        }
    }

    pub(crate) async fn get_books_by_series(
        &self,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, CoreError> {
        self.schema.require_catalog()?;
        if !self.schema.supports(Metadata::Series) {
            return Ok(Vec::new());
        }
        info!(
            "Start to load books by series. series name: \"{series_name}\", exclude book id: {exclude_book_id:?}"
        );

        // Find series by name
        let series_model = series::Entity::find()
            .select_only()
            .columns([series::Column::Id, series::Column::Name])
            .filter(series::Column::Name.eq(series_name))
            .into_model::<NamedRow>()
            .one(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let Some(series_model) = series_model else {
            return Ok(Vec::new());
        };

        // Find book IDs via link table
        let mut query = books_series_link::Entity::find()
            .select_only()
            .column(books_series_link::Column::Book)
            .column_as(books_series_link::Column::Series, "target")
            .filter(books_series_link::Column::Series.eq(series_model.id));

        if let Some(eid) = exclude_book_id {
            query = query.filter(books_series_link::Column::Book.ne(eid));
        }

        let links = query
            .into_model::<BookLinkRow>()
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        let book_ids: Vec<i64> = links.iter().map(|l| l.book).collect();

        if book_ids.is_empty() {
            return Ok(Vec::new());
        }

        // Fetch full book models ordered by series_index
        let book_models = book_query(&self.schema)
            .filter(books::Column::Id.is_in(book_ids))
            .order_by(
                Expr::cust(self.schema.book_column_sql(books::Column::SeriesIndex)),
                sea_orm::Order::Asc,
            )
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let result = assemble_book_entries(&self.db, &self.schema, book_models).await?;
        info!(
            "Success to load books by series. series name: \"{series_name}\", count: {}",
            result.len()
        );
        Ok(result)
    }

    pub(crate) async fn get_book_format_sizes(
        &self,
        book_id: i64,
    ) -> Result<Vec<(String, i64)>, CoreError> {
        self.schema.require_catalog()?;
        debug!("Start to load book format sizes. book id: {book_id}");
        let rows = data::Entity::find()
            .select_only()
            .columns([
                data::Column::Book,
                data::Column::Format,
                data::Column::Name,
                data::Column::UncompressedSize,
            ])
            .filter(data::Column::Book.eq(book_id))
            .order_by_asc(data::Column::Format)
            .into_model::<FormatRow>()
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        let result: Vec<(String, i64)> = rows
            .into_iter()
            .map(|d| (d.format, d.uncompressed_size))
            .collect();
        debug!(
            "Success to load book format sizes. book id: {}, count: {}",
            book_id,
            result.len()
        );
        Ok(result)
    }

    pub(crate) async fn get_book_identifiers(
        &self,
        book_id: i64,
    ) -> Result<Vec<(String, String)>, CoreError> {
        self.schema.require_catalog()?;
        if !self.schema.supports(Metadata::Identifiers) {
            return Ok(Vec::new());
        }
        debug!("Start to load book identifiers. book id: {book_id}");
        let rows = identifiers::Entity::find()
            .select_only()
            .columns([identifiers::Column::Type, identifiers::Column::Val])
            .filter(identifiers::Column::Book.eq(book_id))
            .order_by_asc(identifiers::Column::Type)
            .into_model::<IdentifierRow>()
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        let result: Vec<(String, String)> = rows
            .into_iter()
            .map(|i| (i.r#type.unwrap_or_default(), i.val))
            .collect();
        debug!(
            "Success to load book identifiers. book id: {}, count: {}",
            book_id,
            result.len()
        );
        Ok(result)
    }

    pub(crate) async fn get_book_count(&self) -> Result<usize, CoreError> {
        self.schema.require_catalog()?;
        debug!("Start to count books in Calibre.");
        let count = book_query(&self.schema)
            .count(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        debug!("Success to count books in Calibre. count: {count}");
        Ok(count as usize)
    }

    pub(crate) fn get_book_cover_path(
        &self,
        book_path: &str,
    ) -> Result<Option<PathBuf>, CoreError> {
        debug!(
            "Start to resolve book cover path. library path: \"{}\", book path: \"{book_path}\"",
            self.content_root.display()
        );
        let book_path_buf = Path::new(book_path);
        if book_path_buf
            .components()
            .any(|c| c == std::path::Component::ParentDir)
        {
            debug!(
                "Blocked path traversal in book cover path. library path: \"{}\", book path: \"{book_path}\"",
                self.content_root.display()
            );
            return Ok(None);
        }
        let cover = self.content_root.join(book_path).join("cover.jpg");
        let result = cover.exists().then_some(cover);
        debug!(
            "Success to resolve book cover path. library path: \"{}\", book path: \"{book_path}\", found: {}",
            self.content_root.display(),
            result.is_some()
        );
        Ok(result)
    }
}

fn book_format_relative_path(book_path: &str, name: &str, format: &str) -> String {
    Path::new(book_path)
        .join(format!("{}.{}", name, format.to_lowercase()))
        .to_string_lossy()
        .to_string()
}

fn book_format_from_row(book_path: &str, row: FormatRow) -> BookFormat {
    let relative_path = book_format_relative_path(book_path, &row.name, &row.format);
    BookFormat {
        format: row.format,
        name: row.name,
        size_bytes: row.uncompressed_size,
        relative_path,
    }
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Database};

    use super::CatalogRepository;
    use crate::models::catalog::BookFilePathRequest;

    #[tokio::test]
    async fn should_keep_external_calibre_database_read_only() {
        let library = tempfile::tempdir().expect("create library");
        let database_path = library.path().join("metadata.db");
        let database = Database::connect(format!(
            "sqlite://{}?mode=rwc",
            database_path.to_string_lossy()
        ))
        .await
        .expect("open fixture database");
        database
            .execute_unprepared("CREATE TABLE fixture (id INTEGER PRIMARY KEY);")
            .await
            .expect("create fixture table");
        database.close().await.expect("close fixture database");

        let repository = CatalogRepository::open(&library.path().to_string_lossy())
            .await
            .expect("open external Calibre database");

        assert!(repository
            .db
            .execute_unprepared("CREATE TABLE forbidden (id INTEGER PRIMARY KEY);")
            .await
            .is_err());
    }

    #[tokio::test]
    async fn should_query_myreader_projection_with_shared_catalog_repository() {
        let sidecar = tempfile::tempdir().expect("create sidecar");
        let content = tempfile::tempdir().expect("create content root");
        let database = crate::database::open_db(&sidecar.path().to_string_lossy())
            .await
            .expect("open sidecar database");
        database
            .execute_unprepared(
                "INSERT INTO library_id (id, uuid)
                 VALUES (1, '018f2f8d-980b-40ef-b72e-c6e86cb7cc28');
                 INSERT INTO books
                   (id, title, sort, author_sort, path, uuid, has_cover)
                 VALUES
                   (42, 'The Left Hand of Darkness', 'Left Hand of Darkness, The',
                    'Le Guin, Ursula K.',
                    'Books/018f2f8d-980b-40ef-b72e-c6e86cb7cc29',
                    '018f2f8d-980b-40ef-b72e-c6e86cb7cc29', 1);
                 INSERT INTO authors (id, name, sort)
                 VALUES (7, 'Ursula K. Le Guin', 'Le Guin, Ursula K.');
                 INSERT INTO books_authors_link (id, book, author)
                 VALUES (1, 42, 7);
                 INSERT INTO data (id, book, format, uncompressed_size, name)
                 VALUES (1, 42, 'EPUB', 1024, 'book');",
            )
            .await
            .expect("seed projected catalog");
        drop(database);

        let repository = CatalogRepository::open_myreader(sidecar.path(), content.path())
            .await
            .expect("open MyReader projection");
        let books = repository.get_all_books().await.expect("list books");
        let (page, total) = repository
            .get_books_page(0, 20, "title", Some("Ursula"))
            .await
            .expect("query books page");
        let formats = repository.get_book_formats(42).await.expect("list formats");
        let paths = repository
            .get_book_file_paths(&[BookFilePathRequest {
                book_id: 42,
                format: "epub".into(),
            }])
            .await
            .expect("resolve file path");

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].authors, ["Ursula K. Le Guin"]);
        assert_eq!(total, 1);
        assert_eq!(page[0].id, 42);
        assert_eq!(
            formats[0].relative_path,
            "Books/018f2f8d-980b-40ef-b72e-c6e86cb7cc29/book.epub"
        );
        assert_eq!(
            paths.get(&(42, "EPUB".into())),
            Some(
                &content
                    .path()
                    .join("Books/018f2f8d-980b-40ef-b72e-c6e86cb7cc29/book.epub")
            )
        );
    }
}
