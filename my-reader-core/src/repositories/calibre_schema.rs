use std::collections::{BTreeMap, BTreeSet};

use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, IdenStatic, Statement};
use tracing::info;

use crate::entities::calibre::books;
use crate::CoreError;

#[derive(Clone, Copy)]
pub(super) enum Metadata {
    Authors,
    Tags,
    Series,
    Publishers,
    Languages,
    Ratings,
    Comments,
    Identifiers,
}

/// External schemas 25..=28 share a catalog contract. Actual columns determine
/// optional capabilities, including for an otherwise compatible unknown version.
#[derive(Default)]
pub(super) struct CatalogSchema {
    version: i64,
    // None is the MyReader-owned projection, whose schema is managed by migrations.
    columns: Option<BTreeMap<String, BTreeSet<String>>>,
}

impl CatalogSchema {
    pub async fn inspect(db: &DatabaseConnection) -> Result<Self, CoreError> {
        let version = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "PRAGMA user_version",
            ))
            .await?
            .ok_or_else(|| CoreError::Database("CALIBRE_SCHEMA_VERSION_MISSING".into()))?
            .try_get::<i64>("", "user_version")?;
        let rows = db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT m.name AS table_name, c.name AS column_name
                 FROM sqlite_master AS m JOIN pragma_table_xinfo(m.name) AS c
                 WHERE m.type = 'table' AND m.name IN (
                    'books', 'data', 'library_id', 'authors', 'books_authors_link',
                    'tags', 'books_tags_link', 'series', 'books_series_link',
                    'publishers', 'books_publishers_link', 'languages', 'books_languages_link',
                    'ratings', 'books_ratings_link', 'comments', 'identifiers'
                 )",
            ))
            .await?;
        let mut columns = BTreeMap::<String, BTreeSet<String>>::new();
        for row in rows {
            columns
                .entry(row.try_get("", "table_name")?)
                .or_default()
                .insert(row.try_get("", "column_name")?);
        }
        let schema = Self {
            version,
            columns: Some(columns),
        };
        info!(
            user_version = version,
            known_version = (25..=28).contains(&version),
            "Detected Calibre catalog schema"
        );
        Ok(schema)
    }

    pub fn require_catalog(&self) -> Result<(), CoreError> {
        self.require_columns(&[
            ("books", &["id", "title", "path"]),
            ("data", &["book", "format", "name", "uncompressed_size"]),
        ])
    }

    pub fn require_identity(&self) -> Result<(), CoreError> {
        self.require_columns(&[("library_id", &["uuid"])])
    }

    fn require_columns(&self, requirements: &[(&str, &[&str])]) -> Result<(), CoreError> {
        let mut missing = Vec::new();
        for (table, fields) in requirements {
            for field in *fields {
                if !self.has_columns(table, &[field]) {
                    missing.push(format!("{table}.{field}"));
                }
            }
        }
        if !missing.is_empty() {
            return Err(CoreError::DataIntegrity(format!(
                "CALIBRE_SCHEMA_UNSUPPORTED: user_version={}; missing columns: {}",
                self.version,
                missing.join(", ")
            )));
        }
        Ok(())
    }

    pub fn has_columns(&self, table: &str, fields: &[&str]) -> bool {
        self.columns.as_ref().is_none_or(|tables| {
            tables
                .get(table)
                .is_some_and(|columns| fields.iter().all(|field| columns.contains(*field)))
        })
    }

    pub fn supports(&self, metadata: Metadata) -> bool {
        let requirements: &[(&str, &[&str])] = match metadata {
            Metadata::Authors => &[
                ("authors", &["id", "name"]),
                ("books_authors_link", &["book", "author"]),
            ],
            Metadata::Tags => &[
                ("tags", &["id", "name"]),
                ("books_tags_link", &["book", "tag"]),
            ],
            Metadata::Series => &[
                ("series", &["id", "name"]),
                ("books_series_link", &["book", "series"]),
            ],
            Metadata::Publishers => &[
                ("publishers", &["id", "name"]),
                ("books_publishers_link", &["book", "publisher"]),
            ],
            Metadata::Languages => &[
                ("languages", &["id", "lang_code"]),
                ("books_languages_link", &["book", "lang_code"]),
            ],
            Metadata::Ratings => &[
                ("ratings", &["id", "rating"]),
                ("books_ratings_link", &["book", "rating"]),
            ],
            Metadata::Comments => &[("comments", &["book", "text"])],
            Metadata::Identifiers => &[("identifiers", &["book", "type", "val"])],
        };
        requirements
            .iter()
            .all(|(table, fields)| self.has_columns(table, fields))
    }

    pub fn book_column_sql(&self, column: books::Column) -> String {
        if self.has_columns("books", &[column.as_str()]) {
            format!("\"books\".\"{}\"", column.as_str())
        } else if matches!(column, books::Column::Sort) {
            "\"books\".\"title\"".into()
        } else {
            "NULL".into()
        }
    }
}
