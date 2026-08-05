use std::collections::HashMap;
use std::path::{Path, PathBuf};

use sea_orm::{
    ColumnTrait, Database, DatabaseConnection, EntityTrait, ExprTrait, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect,
};
use tracing::{debug, info};

use crate::entities::calibre::{
    authors, books, books_authors_link, books_languages_link, books_publishers_link,
    books_ratings_link, books_series_link, books_tags_link, comments, data, identifiers, languages,
    library_id, publishers, ratings, series, tags,
};
use crate::models::catalog::BookFilePathRequest;
use crate::models::{BookEntry, BookFormat, BookSummary};
use crate::CoreError;

/// Shared catalog queries over either an external Calibre database or a
/// MyReader-owned local projection.
pub struct CatalogRepository {
    db: DatabaseConnection,
    content_root: PathBuf,
}

pub type CalibreBookRepository = CatalogRepository;

impl CatalogRepository {
    pub async fn open(library_path: &str) -> Result<Self, CoreError> {
        info!("Start to open Calibre database. library path: \"{library_path}\"");
        let db_path = Path::new(library_path).join("metadata.db");
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
        Ok(Self::from_connection(db, Path::new(library_path)))
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
        }
    }

    pub fn validate_library(library_path: &str) -> bool {
        Path::new(library_path).join("metadata.db").is_file()
    }

    pub async fn get_library_uuid(&self) -> Result<String, CoreError> {
        let row = library_id::Entity::find()
            .one(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?
            .ok_or_else(|| CoreError::Database("Calibre library UUID is missing".into()))?;
        Ok(row.uuid.to_lowercase())
    }

    pub async fn get_book_summaries(&self) -> Result<Vec<BookSummary>, CoreError> {
        let book_rows = books::Entity::find()
            .all(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?;
        let format_rows = data::Entity::find()
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
        let book = books::Entity::find_by_id(book_id)
            .one(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?
            .ok_or_else(|| CoreError::NotFound(format!("BOOK_NOT_FOUND: {book_id}")))?;
        let book_path = book.path.unwrap_or_default();
        let rows = data::Entity::find()
            .filter(data::Column::Book.eq(book_id))
            .order_by_asc(data::Column::Format)
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
        let book = books::Entity::find_by_id(book_id)
            .one(&self.db)
            .await
            .map_err(|error| CoreError::Database(error.to_string()))?;
        let Some(book) = book else {
            return Ok(None);
        };
        let rows = data::Entity::find()
            .filter(data::Column::Book.eq(book_id))
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
        if requests.is_empty() {
            return Ok(HashMap::new());
        }

        let book_ids: Vec<i64> = requests.iter().map(|item| item.book_id).collect();
        let book_rows = books::Entity::find()
            .filter(books::Column::Id.is_in(book_ids.clone()))
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        let data_rows = data::Entity::find()
            .filter(data::Column::Book.is_in(book_ids))
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let books_by_id: HashMap<i64, books::Model> =
            book_rows.into_iter().map(|book| (book.id, book)).collect();
        let mut data_by_book: HashMap<i64, Vec<data::Model>> = HashMap::new();
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

/// Fetch all related data for a list of book IDs and assemble BookEntry objects.
async fn assemble_book_entries(
    db: &DatabaseConnection,
    book_models: Vec<books::Model>,
) -> Result<Vec<BookEntry>, CoreError> {
    if book_models.is_empty() {
        return Ok(Vec::new());
    }

    let book_ids: Vec<i64> = book_models.iter().map(|b| b.id).collect();

    // Authors: books_authors_link JOIN authors
    let author_links = books_authors_link::Entity::find()
        .filter(books_authors_link::Column::Book.is_in(book_ids.clone()))
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let author_ids: Vec<i64> = author_links.iter().map(|l| l.author).collect();
    let author_models = if author_ids.is_empty() {
        Vec::new()
    } else {
        authors::Entity::find()
            .filter(authors::Column::Id.is_in(author_ids))
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let author_map: HashMap<i64, String> =
        author_models.into_iter().map(|a| (a.id, a.name)).collect();

    let mut book_authors_map: HashMap<i64, Vec<String>> = HashMap::new();
    for link in &author_links {
        if let Some(name) = author_map.get(&link.author) {
            book_authors_map
                .entry(link.book)
                .or_default()
                .push(name.clone());
        }
    }

    // Tags: books_tags_link JOIN tags
    let tag_links = books_tags_link::Entity::find()
        .filter(books_tags_link::Column::Book.is_in(book_ids.clone()))
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let tag_ids: Vec<i64> = tag_links.iter().map(|l| l.tag).collect();
    let tag_models = if tag_ids.is_empty() {
        Vec::new()
    } else {
        tags::Entity::find()
            .filter(tags::Column::Id.is_in(tag_ids))
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let tag_map: HashMap<i64, String> = tag_models.into_iter().map(|t| (t.id, t.name)).collect();

    let mut book_tags_map: HashMap<i64, Vec<String>> = HashMap::new();
    for link in &tag_links {
        if let Some(name) = tag_map.get(&link.tag) {
            book_tags_map
                .entry(link.book)
                .or_default()
                .push(name.clone());
        }
    }

    // Series: books_series_link JOIN series
    let series_links = books_series_link::Entity::find()
        .filter(books_series_link::Column::Book.is_in(book_ids.clone()))
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let series_ids: Vec<i64> = series_links.iter().map(|l| l.series).collect();
    let series_models = if series_ids.is_empty() {
        Vec::new()
    } else {
        series::Entity::find()
            .filter(series::Column::Id.is_in(series_ids))
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let series_map: HashMap<i64, String> =
        series_models.into_iter().map(|s| (s.id, s.name)).collect();

    let mut book_series_map: HashMap<i64, String> = HashMap::new();
    for link in &series_links {
        if let Some(name) = series_map.get(&link.series) {
            book_series_map.insert(link.book, name.clone());
        }
    }

    // Formats: data table
    let data_rows = data::Entity::find()
        .filter(data::Column::Book.is_in(book_ids.clone()))
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
    let comment_rows = comments::Entity::find()
        .filter(comments::Column::Book.is_in(book_ids.clone()))
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let mut book_comment_map: HashMap<i64, String> =
        comment_rows.into_iter().map(|c| (c.book, c.text)).collect();

    // Publishers: books_publishers_link JOIN publishers
    let pub_links = books_publishers_link::Entity::find()
        .filter(books_publishers_link::Column::Book.is_in(book_ids.clone()))
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let pub_ids: Vec<i64> = pub_links.iter().map(|l| l.publisher).collect();
    let pub_models = if pub_ids.is_empty() {
        Vec::new()
    } else {
        publishers::Entity::find()
            .filter(publishers::Column::Id.is_in(pub_ids))
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let pub_map: HashMap<i64, String> = pub_models.into_iter().map(|p| (p.id, p.name)).collect();

    let mut book_publisher_map: HashMap<i64, String> = HashMap::new();
    for link in &pub_links {
        if let Some(name) = pub_map.get(&link.publisher) {
            book_publisher_map.insert(link.book, name.clone());
        }
    }

    // Languages: books_languages_link JOIN languages
    let lang_links = books_languages_link::Entity::find()
        .filter(books_languages_link::Column::Book.is_in(book_ids.clone()))
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let lang_ids: Vec<i64> = lang_links.iter().map(|l| l.lang_code).collect();
    let lang_models = if lang_ids.is_empty() {
        Vec::new()
    } else {
        languages::Entity::find()
            .filter(languages::Column::Id.is_in(lang_ids))
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
        if let Some(code) = lang_map.get(&link.lang_code) {
            book_languages_map
                .entry(link.book)
                .or_default()
                .push(code.clone());
        }
    }

    // Ratings: books_ratings_link JOIN ratings
    let rating_links = books_ratings_link::Entity::find()
        .filter(books_ratings_link::Column::Book.is_in(book_ids))
        .all(db)
        .await
        .map_err(|e| CoreError::Database(e.to_string()))?;

    let rating_ids: Vec<i64> = rating_links.iter().map(|l| l.rating).collect();
    let rating_models = if rating_ids.is_empty() {
        Vec::new()
    } else {
        ratings::Entity::find()
            .filter(ratings::Column::Id.is_in(rating_ids))
            .all(db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?
    };
    let rating_map: HashMap<i64, i64> = rating_models
        .into_iter()
        .map(|r| (r.id, r.rating))
        .collect();

    let mut book_rating_map: HashMap<i64, i32> = HashMap::new();
    for link in &rating_links {
        if let Some(r) = rating_map.get(&link.rating) {
            book_rating_map.insert(link.book, *r as i32);
        }
    }

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
        info!("Start to load all books from Calibre.");
        let book_models = books::Entity::find()
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        let result = assemble_book_entries(&self.db, book_models).await?;
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
        info!(
            "Start to query books page. offset: {offset}, limit: {limit}, sort by: {sort_by}, search: {search:?}"
        );

        let search_filter = search.filter(|s| !s.is_empty());

        if let Some(keyword) = search_filter {
            // Split-query search: find matching author/tag IDs first, then filter books in code.
            let keyword: &str = keyword;

            // 1. Find author IDs whose name matches (case-insensitive)
            let matching_author_ids: Vec<i64> = authors::Entity::find()
                .filter(authors::Column::Name.contains(keyword))
                .all(&self.db)
                .await
                .map_err(|e| CoreError::Database(e.to_string()))?
                .into_iter()
                .map(|a| a.id)
                .collect();

            // 2. Find book IDs linked to those authors
            let author_book_ids: Vec<i64> = if matching_author_ids.is_empty() {
                Vec::new()
            } else {
                books_authors_link::Entity::find()
                    .filter(books_authors_link::Column::Author.is_in(matching_author_ids))
                    .all(&self.db)
                    .await
                    .map_err(|e| CoreError::Database(e.to_string()))?
                    .into_iter()
                    .map(|l| l.book)
                    .collect()
            };

            // 3. Find tag IDs whose name matches (case-insensitive)
            let matching_tag_ids: Vec<i64> = tags::Entity::find()
                .filter(tags::Column::Name.contains(keyword))
                .all(&self.db)
                .await
                .map_err(|e| CoreError::Database(e.to_string()))?
                .into_iter()
                .map(|t| t.id)
                .collect();

            // 4. Find book IDs linked to those tags
            let tag_book_ids: Vec<i64> = if matching_tag_ids.is_empty() {
                Vec::new()
            } else {
                books_tags_link::Entity::find()
                    .filter(books_tags_link::Column::Tag.is_in(matching_tag_ids))
                    .all(&self.db)
                    .await
                    .map_err(|e| CoreError::Database(e.to_string()))?
                    .into_iter()
                    .map(|l| l.book)
                    .collect()
            };

            // 5. Combine: books where sort/title/author_sort contains keyword OR book is in author/tag match sets
            let all_books = books::Entity::find()
                .filter(
                    books::Column::Sort
                        .contains(keyword)
                        .or(books::Column::Title.contains(keyword))
                        .or(books::Column::AuthorSort.contains(keyword)),
                )
                .all(&self.db)
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

            let total = matched_ids.len();

            // 6. Fetch matched books with ordering and pagination
            let matched_ids_vec: Vec<i64> = matched_ids.into_iter().collect();

            if matched_ids_vec.is_empty() {
                info!("Success to query books page. returned count: 0, total: 0");
                return Ok((Vec::new(), 0));
            }

            let (order_expr, order_dir) = match sort_by {
                "author" => ("author_sort COLLATE NOCASE", sea_orm::Order::Asc),
                "recent" | "progress" => ("timestamp", sea_orm::Order::Desc),
                _ => ("sort COLLATE NOCASE", sea_orm::Order::Asc),
            };
            let book_models = books::Entity::find()
                .filter(books::Column::Id.is_in(matched_ids_vec))
                .order_by(sea_orm::sea_query::Expr::cust(order_expr), order_dir)
                .offset(offset as u64)
                .limit(limit as u64)
                .all(&self.db)
                .await
                .map_err(|e| CoreError::Database(e.to_string()))?;

            let result = assemble_book_entries(&self.db, book_models).await?;
            info!(
                "Success to query books page. returned count: {}, total: {}",
                result.len(),
                total
            );
            return Ok((result, total));
        }

        // Non-search path: use SeaORM query builder directly
        let total = books::Entity::find()
            .count(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let (order_expr, order_dir) = match sort_by {
            "author" => ("author_sort COLLATE NOCASE", sea_orm::Order::Asc),
            "recent" | "progress" => ("timestamp", sea_orm::Order::Desc),
            _ => ("sort COLLATE NOCASE", sea_orm::Order::Asc),
        };
        let book_models = books::Entity::find()
            .order_by(sea_orm::sea_query::Expr::cust(order_expr), order_dir)
            .offset(offset as u64)
            .limit(limit as u64)
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let result = assemble_book_entries(&self.db, book_models).await?;
        info!(
            "Success to query books page. returned count: {}, total: {}",
            result.len(),
            total
        );
        Ok((result, total as usize))
    }

    pub(crate) async fn get_book_by_id(
        &self,
        book_id: i64,
    ) -> Result<Option<BookEntry>, CoreError> {
        info!("Start to load book by id. book id: {book_id}");
        let book_model = books::Entity::find_by_id(book_id)
            .one(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        match book_model {
            Some(m) => {
                let entries = assemble_book_entries(&self.db, vec![m]).await?;
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
        info!(
            "Start to load books by series. series name: \"{series_name}\", exclude book id: {exclude_book_id:?}"
        );

        // Find series by name
        let series_model = series::Entity::find()
            .filter(series::Column::Name.eq(series_name))
            .one(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let Some(series_model) = series_model else {
            return Ok(Vec::new());
        };

        // Find book IDs via link table
        let mut query = books_series_link::Entity::find()
            .filter(books_series_link::Column::Series.eq(series_model.id));

        if let Some(eid) = exclude_book_id {
            query = query.filter(books_series_link::Column::Book.ne(eid));
        }

        let links = query
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;
        let book_ids: Vec<i64> = links.iter().map(|l| l.book).collect();

        if book_ids.is_empty() {
            return Ok(Vec::new());
        }

        // Fetch full book models ordered by series_index
        let book_models = books::Entity::find()
            .filter(books::Column::Id.is_in(book_ids))
            .order_by_asc(books::Column::SeriesIndex)
            .all(&self.db)
            .await
            .map_err(|e| CoreError::Database(e.to_string()))?;

        let result = assemble_book_entries(&self.db, book_models).await?;
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
        debug!("Start to load book format sizes. book id: {book_id}");
        let rows = data::Entity::find()
            .filter(data::Column::Book.eq(book_id))
            .order_by_asc(data::Column::Format)
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
        debug!("Start to load book identifiers. book id: {book_id}");
        let rows = identifiers::Entity::find()
            .filter(identifiers::Column::Book.eq(book_id))
            .order_by_asc(identifiers::Column::Type)
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
        debug!("Start to count books in Calibre.");
        let count = books::Entity::find()
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

fn book_format_from_row(book_path: &str, row: data::Model) -> BookFormat {
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
