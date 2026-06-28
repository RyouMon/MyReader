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
    publishers, ratings, series, tags,
};
use crate::error::AppError;
use crate::models::BookEntry;

/// Lightweight summary for cover download — avoids joining all book columns.
pub struct CoverSummary {
    pub id: i64,
    pub path: String,
    pub has_cover: bool,
}

/// Repository trait for Calibre book metadata access.
#[async_trait::async_trait]
pub trait BookRepository {
    async fn get_all_books(&self) -> Result<Vec<BookEntry>, AppError>;
    async fn get_books_page(
        &self,
        offset: usize,
        limit: usize,
        sort_by: &str,
        search: Option<&str>,
    ) -> Result<(Vec<BookEntry>, usize), AppError>;
    async fn get_book_by_id(&self, book_id: i64) -> Result<Option<BookEntry>, AppError>;
    async fn get_books_by_series(
        &self,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError>;
    async fn get_book_format_sizes(&self, book_id: i64) -> Result<Vec<(String, i64)>, AppError>;
    async fn get_book_identifiers(&self, book_id: i64) -> Result<Vec<(String, String)>, AppError>;
    async fn get_book_count(&self) -> Result<usize, AppError>;
    fn get_book_cover_path(&self, book_path: &str) -> Result<Option<PathBuf>, AppError>;
    async fn get_book_file_path(
        &self,
        library_path: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<PathBuf>, AppError>;
}

/// Read-only Calibre metadata.db repository using SeaORM.
pub struct CalibreBookRepository {
    db: DatabaseConnection,
    library_path: String,
}

impl CalibreBookRepository {
    pub async fn open(library_path: &str) -> Result<Self, AppError> {
        info!("Start to open Calibre database. library path: \"{library_path}\"");
        let db_path = Path::new(library_path).join("metadata.db");
        let url = format!(
            "sqlite://{}?mode=ro",
            db_path
                .to_str()
                .ok_or_else(|| AppError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?
        );
        let db = Database::connect(&url)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        info!(
            "Success to open Calibre database. db path: \"{}\"",
            db_path.display()
        );
        Ok(Self {
            db,
            library_path: library_path.to_string(),
        })
    }

    pub fn validate_library(library_path: &str) -> bool {
        Path::new(library_path).join("metadata.db").is_file()
    }

    /// Return lightweight (id, path, has_cover) for every book — used by bulk cover download.
    pub async fn get_cover_summaries(&self) -> Result<Vec<CoverSummary>, AppError> {
        let rows = books::Entity::find()
            .select_only()
            .column(books::Column::Id)
            .column(books::Column::Path)
            .column(books::Column::HasCover)
            .all(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(rows
            .into_iter()
            .map(|m| CoverSummary {
                id: m.id,
                path: m.path.unwrap_or_default(),
                has_cover: m.has_cover.unwrap_or(0) != 0,
            })
            .collect())
    }
}

/// Fetch all related data for a list of book IDs and assemble BookEntry objects.
async fn assemble_book_entries(
    db: &DatabaseConnection,
    book_models: Vec<books::Model>,
) -> Result<Vec<BookEntry>, AppError> {
    if book_models.is_empty() {
        return Ok(Vec::new());
    }

    let book_ids: Vec<i64> = book_models.iter().map(|b| b.id).collect();

    // Authors: books_authors_link JOIN authors
    let author_links = books_authors_link::Entity::find()
        .filter(books_authors_link::Column::Book.is_in(book_ids.clone()))
        .all(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let author_ids: Vec<i64> = author_links.iter().map(|l| l.author).collect();
    let author_models = if author_ids.is_empty() {
        Vec::new()
    } else {
        authors::Entity::find()
            .filter(authors::Column::Id.is_in(author_ids))
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
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
        .map_err(|e| AppError::Database(e.to_string()))?;

    let tag_ids: Vec<i64> = tag_links.iter().map(|l| l.tag).collect();
    let tag_models = if tag_ids.is_empty() {
        Vec::new()
    } else {
        tags::Entity::find()
            .filter(tags::Column::Id.is_in(tag_ids))
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
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
        .map_err(|e| AppError::Database(e.to_string()))?;

    let series_ids: Vec<i64> = series_links.iter().map(|l| l.series).collect();
    let series_models = if series_ids.is_empty() {
        Vec::new()
    } else {
        series::Entity::find()
            .filter(series::Column::Id.is_in(series_ids))
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
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
        .map_err(|e| AppError::Database(e.to_string()))?;

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
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut book_comment_map: HashMap<i64, String> =
        comment_rows.into_iter().map(|c| (c.book, c.text)).collect();

    // Publishers: books_publishers_link JOIN publishers
    let pub_links = books_publishers_link::Entity::find()
        .filter(books_publishers_link::Column::Book.is_in(book_ids.clone()))
        .all(db)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let pub_ids: Vec<i64> = pub_links.iter().map(|l| l.publisher).collect();
    let pub_models = if pub_ids.is_empty() {
        Vec::new()
    } else {
        publishers::Entity::find()
            .filter(publishers::Column::Id.is_in(pub_ids))
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
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
        .map_err(|e| AppError::Database(e.to_string()))?;

    let lang_ids: Vec<i64> = lang_links.iter().map(|l| l.lang_code).collect();
    let lang_models = if lang_ids.is_empty() {
        Vec::new()
    } else {
        languages::Entity::find()
            .filter(languages::Column::Id.is_in(lang_ids))
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
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
        .map_err(|e| AppError::Database(e.to_string()))?;

    let rating_ids: Vec<i64> = rating_links.iter().map(|l| l.rating).collect();
    let rating_models = if rating_ids.is_empty() {
        Vec::new()
    } else {
        ratings::Entity::find()
            .filter(ratings::Column::Id.is_in(rating_ids))
            .all(db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
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

#[async_trait::async_trait]
impl BookRepository for CalibreBookRepository {
    async fn get_all_books(&self) -> Result<Vec<BookEntry>, AppError> {
        info!("Start to load all books from Calibre.");
        let book_models = books::Entity::find()
            .all(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        let result = assemble_book_entries(&self.db, book_models).await?;
        info!(
            "Success to load all books from Calibre. count: {}",
            result.len()
        );
        Ok(result)
    }

    async fn get_books_page(
        &self,
        offset: usize,
        limit: usize,
        sort_by: &str,
        search: Option<&str>,
    ) -> Result<(Vec<BookEntry>, usize), AppError> {
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
                .map_err(|e| AppError::Database(e.to_string()))?
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
                    .map_err(|e| AppError::Database(e.to_string()))?
                    .into_iter()
                    .map(|l| l.book)
                    .collect()
            };

            // 3. Find tag IDs whose name matches (case-insensitive)
            let matching_tag_ids: Vec<i64> = tags::Entity::find()
                .filter(tags::Column::Name.contains(keyword))
                .all(&self.db)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?
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
                    .map_err(|e| AppError::Database(e.to_string()))?
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
                .map_err(|e| AppError::Database(e.to_string()))?;

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
                .map_err(|e| AppError::Database(e.to_string()))?;

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
            .map_err(|e| AppError::Database(e.to_string()))?;

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
            .map_err(|e| AppError::Database(e.to_string()))?;

        let result = assemble_book_entries(&self.db, book_models).await?;
        info!(
            "Success to query books page. returned count: {}, total: {}",
            result.len(),
            total
        );
        Ok((result, total as usize))
    }

    async fn get_book_by_id(&self, book_id: i64) -> Result<Option<BookEntry>, AppError> {
        info!("Start to load book by id. book id: {book_id}");
        let book_model = books::Entity::find_by_id(book_id)
            .one(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        match book_model {
            Some(m) => {
                let entries = assemble_book_entries(&self.db, vec![m]).await?;
                Ok(entries.into_iter().next())
            }
            None => Ok(None),
        }
    }

    async fn get_books_by_series(
        &self,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError> {
        info!(
            "Start to load books by series. series name: \"{series_name}\", exclude book id: {exclude_book_id:?}"
        );

        // Find series by name
        let series_model = series::Entity::find()
            .filter(series::Column::Name.eq(series_name))
            .one(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

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
            .map_err(|e| AppError::Database(e.to_string()))?;
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
            .map_err(|e| AppError::Database(e.to_string()))?;

        let result = assemble_book_entries(&self.db, book_models).await?;
        info!(
            "Success to load books by series. series name: \"{series_name}\", count: {}",
            result.len()
        );
        Ok(result)
    }

    async fn get_book_format_sizes(&self, book_id: i64) -> Result<Vec<(String, i64)>, AppError> {
        debug!("Start to load book format sizes. book id: {book_id}");
        let rows = data::Entity::find()
            .filter(data::Column::Book.eq(book_id))
            .order_by_asc(data::Column::Format)
            .all(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
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

    async fn get_book_identifiers(&self, book_id: i64) -> Result<Vec<(String, String)>, AppError> {
        debug!("Start to load book identifiers. book id: {book_id}");
        let rows = identifiers::Entity::find()
            .filter(identifiers::Column::Book.eq(book_id))
            .order_by_asc(identifiers::Column::Type)
            .all(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
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

    async fn get_book_count(&self) -> Result<usize, AppError> {
        debug!("Start to count books in Calibre.");
        let count = books::Entity::find()
            .count(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        debug!("Success to count books in Calibre. count: {count}");
        Ok(count as usize)
    }

    fn get_book_cover_path(&self, book_path: &str) -> Result<Option<PathBuf>, AppError> {
        debug!(
            "Start to resolve book cover path. library path: \"{}\", book path: \"{book_path}\"",
            self.library_path
        );
        let book_path_buf = Path::new(book_path);
        if book_path_buf
            .components()
            .any(|c| c == std::path::Component::ParentDir)
        {
            debug!(
                "Blocked path traversal in book cover path. library path: \"{}\", book path: \"{book_path}\"",
                self.library_path
            );
            return Ok(None);
        }
        let cover = Path::new(&self.library_path)
            .join(book_path)
            .join("cover.jpg");
        let result = cover.exists().then_some(cover);
        debug!(
            "Success to resolve book cover path. library path: \"{}\", book path: \"{book_path}\", found: {}",
            self.library_path,
            result.is_some()
        );
        Ok(result)
    }

    async fn get_book_file_path(
        &self,
        library_path: &str,
        book_id: i64,
        format: &str,
    ) -> Result<Option<PathBuf>, AppError> {
        info!(
            "Start to resolve book file path. library path: \"{library_path}\", book id: {book_id}, format: \"{format}\""
        );

        // Find book's path
        let book_model = books::Entity::find_by_id(book_id)
            .one(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let Some(book_model) = book_model else {
            info!(
                "Success to resolve book file path. found: false, book id: {book_id}, format: \"{format}\""
            );
            return Ok(None);
        };

        // Find data row matching format (case-insensitive)
        let data_rows = data::Entity::find()
            .filter(data::Column::Book.eq(book_id))
            .all(&self.db)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let data_match = data_rows
            .into_iter()
            .find(|d| d.format.eq_ignore_ascii_case(format));

        let result = match data_match {
            Some(d) => {
                let full = Path::new(library_path)
                    .join(book_model.path.unwrap_or_default())
                    .join(format!("{}.{}", d.name, d.format.to_lowercase()));
                info!(
                    "Success to resolve book file path. found: true, path: \"{}\"",
                    full.display()
                );
                Some(full)
            }
            None => {
                info!(
                    "Success to resolve book file path. found: false, book id: {book_id}, format: \"{format}\""
                );
                None
            }
        };
        Ok(result)
    }
}
