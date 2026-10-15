use serde::{Deserialize, Serialize};
use specta::Type;

/// Every selected value must match. Names are stable across rebuilt projections;
/// database-local author/tag IDs are deliberately not part of this contract.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogQuery {
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Vec<String>,
    pub search: Option<String>,
    pub book_ids: Option<Vec<i64>>,
    pub sort_by: Option<String>,
    pub offset: usize,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogCover {
    pub id: i64,
    pub title: String,
    pub path: String,
    pub has_cover: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFacet {
    pub name: String,
    pub book_count: usize,
    pub covers: Vec<CatalogCover>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CatalogNavigation {
    pub authors: Vec<CatalogFacet>,
    pub tags: Vec<CatalogFacet>,
    pub series: Vec<CatalogFacet>,
}

impl From<CatalogQuery> for my_reader_core::models::CatalogQuery {
    fn from(v: CatalogQuery) -> Self {
        Self {
            authors: v.authors,
            tags: v.tags,
            series: v.series,
            search: v.search,
            book_ids: v.book_ids,
            sort_by: v.sort_by,
            offset: v.offset,
            limit: v.limit,
        }
    }
}
impl From<my_reader_core::models::CatalogCover> for CatalogCover {
    fn from(v: my_reader_core::models::CatalogCover) -> Self {
        Self {
            id: v.id,
            title: v.title,
            path: v.path,
            has_cover: v.has_cover,
        }
    }
}
impl From<my_reader_core::models::CatalogFacet> for CatalogFacet {
    fn from(v: my_reader_core::models::CatalogFacet) -> Self {
        Self {
            name: v.name,
            book_count: v.book_count,
            covers: v.covers.into_iter().map(Into::into).collect(),
        }
    }
}
impl From<my_reader_core::models::CatalogNavigation> for CatalogNavigation {
    fn from(v: my_reader_core::models::CatalogNavigation) -> Self {
        Self {
            authors: v.authors.into_iter().map(Into::into).collect(),
            tags: v.tags.into_iter().map(Into::into).collect(),
            series: v.series.into_iter().map(Into::into).collect(),
        }
    }
}
