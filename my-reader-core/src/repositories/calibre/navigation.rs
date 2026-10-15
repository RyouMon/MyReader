use sea_orm::{Condition, ConnectionTrait, DbBackend, Statement};

use super::*;
use crate::models::{CatalogCover, CatalogFacet, CatalogNavigation, CatalogQuery, PaginatedBooks};

impl Metadata {
    fn facet_tables(self) -> (&'static str, &'static str, &'static str) {
        match self {
            Self::Authors => ("authors", "books_authors_link", "author"),
            Self::Tags => ("tags", "books_tags_link", "tag"),
            Self::Series => ("series", "books_series_link", "series"),
            _ => unreachable!("only catalog facets have navigation tables"),
        }
    }
}

fn facet_match(metadata: Metadata, predicate: &str) -> String {
    let (table, links, target) = metadata.facet_tables();
    format!(
        "EXISTS (SELECT 1 FROM {links} l JOIN {table} f ON f.id = l.{target}
         WHERE l.book = books.id AND {predicate})"
    )
}

fn selected_facets(schema: &CatalogSchema, request: &CatalogQuery) -> Condition {
    let mut condition = Condition::all();
    for (metadata, values) in [
        (Metadata::Authors, &request.authors),
        (Metadata::Tags, &request.tags),
        (Metadata::Series, &request.series),
    ] {
        if values.is_empty() {
            continue;
        }
        if !schema.supports(metadata) {
            return condition.add(Expr::cust("0"));
        }
        for value in values.iter().collect::<std::collections::BTreeSet<_>>() {
            condition = condition.add(Expr::cust_with_values(
                facet_match(metadata, "f.name = ? COLLATE BINARY"),
                [value.clone()],
            ));
        }
    }
    condition
}

fn text_match(schema: &CatalogSchema, keyword: &str) -> Condition {
    // Treat user text literally, including SQL wildcard characters.
    let pattern = format!(
        "%{}%",
        keyword
            .to_lowercase()
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    );
    let mut condition = Condition::any();
    for column in [
        books::Column::Title,
        books::Column::Sort,
        books::Column::AuthorSort,
    ] {
        condition = condition.add(Expr::cust_with_values(
            format!(
                "LOWER({}) LIKE ? ESCAPE '\\'",
                schema.book_column_sql(column)
            ),
            [pattern.clone()],
        ));
    }
    for metadata in [Metadata::Authors, Metadata::Tags, Metadata::Series] {
        if schema.supports(metadata) {
            condition = condition.add(Expr::cust_with_values(
                facet_match(metadata, "LOWER(f.name) LIKE ? ESCAPE '\\'"),
                [pattern.clone()],
            ));
        }
    }
    condition
}

impl CatalogRepository {
    pub(crate) async fn query_books(
        &self,
        request: &CatalogQuery,
    ) -> Result<PaginatedBooks, CoreError> {
        self.schema.require_catalog()?;
        let mut condition = selected_facets(&self.schema, request);
        if let Some(ids) = &request.book_ids {
            condition = condition.add(books::Column::Id.is_in(ids.iter().copied()));
        }
        if let Some(keyword) = request
            .search
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            condition = condition.add(text_match(&self.schema, keyword));
        }
        let query = book_query(&self.schema).filter(condition);
        let total = query.clone().count(&self.db).await? as usize;
        let (order, direction) =
            book_page_order(&self.schema, request.sort_by.as_deref().unwrap_or("title"));
        let mut query = query
            .order_by(order, direction)
            .order_by_asc(books::Column::Id);
        // An absent limit is used by the mobile catalog, which already renders a
        // complete collection. Paged consumers always filter before slicing.
        query = query.limit(
            request
                .limit
                .map(|limit| limit.clamp(1, 200) as u64)
                .unwrap_or(i64::MAX as u64),
        );
        let rows = query.offset(request.offset as u64).all(&self.db).await?;
        let items = assemble_book_entries(&self.db, &self.schema, rows).await?;
        Ok(PaginatedBooks { items, total })
    }

    pub(crate) async fn catalog_navigation(&self) -> Result<CatalogNavigation, CoreError> {
        self.schema.require_catalog()?;
        Ok(CatalogNavigation {
            authors: self.catalog_facets(Metadata::Authors, false).await?,
            tags: self.catalog_facets(Metadata::Tags, false).await?,
            series: self.catalog_facets(Metadata::Series, true).await?,
        })
    }

    async fn catalog_facets(
        &self,
        metadata: Metadata,
        with_covers: bool,
    ) -> Result<Vec<CatalogFacet>, CoreError> {
        if !self.schema.supports(metadata) {
            return Ok(Vec::new());
        }
        let (table, links, target) = metadata.facet_tables();
        let relation = format!("FROM {table} f JOIN {links} l ON l.{target} = f.id JOIN books ON books.id = l.book WHERE TRIM(f.name) <> ''");
        let rows = self.db.query_all_raw(Statement::from_string(DbBackend::Sqlite,
            format!("SELECT f.name, COUNT(DISTINCT books.id) AS book_count {relation} GROUP BY f.name COLLATE BINARY ORDER BY f.name COLLATE NOCASE")
        )).await?;
        let mut facets = rows
            .into_iter()
            .map(|row| {
                Ok(CatalogFacet {
                    name: row.try_get("", "name")?,
                    book_count: row.try_get::<i64>("", "book_count")? as usize,
                    covers: Vec::new(),
                })
            })
            .collect::<Result<Vec<_>, CoreError>>()?;
        if with_covers {
            let covers = self.facet_covers(&relation).await?;
            for facet in &mut facets {
                facet.covers = covers.get(&facet.name).cloned().unwrap_or_default();
            }
        }
        Ok(facets)
    }

    async fn facet_covers(
        &self,
        relation: &str,
    ) -> Result<HashMap<String, Vec<CatalogCover>>, CoreError> {
        let index = self.schema.book_column_sql(books::Column::SeriesIndex);
        let has_cover = self.schema.book_column_sql(books::Column::HasCover);
        let rows = self.db.query_all_raw(Statement::from_string(DbBackend::Sqlite, format!(
            "SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY name ORDER BY series_index, id) AS position FROM (
             SELECT DISTINCT f.name, books.id, books.title, books.path, {has_cover} AS has_cover, {index} AS series_index {relation}
             )) WHERE position <= 4 ORDER BY name, position"
        ))).await?;
        let mut covers = HashMap::<String, Vec<CatalogCover>>::new();
        for row in rows {
            covers
                .entry(row.try_get("", "name")?)
                .or_default()
                .push(CatalogCover {
                    id: row.try_get("", "id")?,
                    title: row
                        .try_get::<Option<String>>("", "title")?
                        .unwrap_or_default(),
                    path: row
                        .try_get::<Option<String>>("", "path")?
                        .unwrap_or_default(),
                    has_cover: row
                        .try_get::<Option<i64>>("", "has_cover")?
                        .unwrap_or_default()
                        != 0,
                });
        }
        Ok(covers)
    }
}
