use crate::{
    types::{required_i64, required_usize, PaginatedBooks},
    CoreFfiError,
};
use my_reader_core::api::catalog::CatalogService;
use std::path::Path;

/// Every selected value must match. Names are stable across rebuilt projections;
/// database-local author/tag IDs are deliberately not part of this contract.
#[derive(Debug, Clone, uniffi::Record)]
pub struct CatalogQuery {
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Vec<String>,
    pub search: Option<String>,
    pub book_ids: Option<Vec<f64>>,
    pub sort_by: Option<String>,
    pub offset: f64,
    pub limit: Option<f64>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CatalogCover {
    pub id: f64,
    pub title: String,
    pub path: String,
    pub has_cover: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CatalogFacet {
    pub name: String,
    pub book_count: f64,
    pub covers: Vec<CatalogCover>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CatalogNavigation {
    pub authors: Vec<CatalogFacet>,
    pub tags: Vec<CatalogFacet>,
    pub series: Vec<CatalogFacet>,
}

impl From<my_reader_core::models::CatalogCover> for CatalogCover {
    fn from(v: my_reader_core::models::CatalogCover) -> Self {
        Self {
            id: v.id as f64,
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
            book_count: v.book_count as f64,
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

impl TryFrom<CatalogQuery> for my_reader_core::models::CatalogQuery {
    type Error = CoreFfiError;
    fn try_from(v: CatalogQuery) -> Result<Self, Self::Error> {
        Ok(Self {
            authors: v.authors,
            tags: v.tags,
            series: v.series,
            search: v.search,
            sort_by: v.sort_by,
            book_ids: v
                .book_ids
                .map(|ids| {
                    ids.into_iter()
                        .map(|id| required_i64(id, "bookId"))
                        .collect::<Result<Vec<_>, _>>()
                })
                .transpose()?,
            offset: required_usize(v.offset, "offset")?,
            limit: v.limit.map(|n| required_usize(n, "limit")).transpose()?,
        })
    }
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_navigation(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
) -> Result<CatalogNavigation, CoreFfiError> {
    Ok(CatalogService::registered_catalog_navigation(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn catalog_query_books(
    config_path: String,
    library_id: String,
    sidecar_root_path: String,
    content_root_path: String,
    request: CatalogQuery,
) -> Result<PaginatedBooks, CoreFfiError> {
    Ok(CatalogService::query_registered_library_books(
        Path::new(&config_path),
        &library_id,
        Path::new(&sidecar_root_path),
        Path::new(&content_root_path),
        request.try_into()?,
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}
