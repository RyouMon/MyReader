use std::collections::BTreeMap;
use std::path::Path;

use crate::error::AppError;
use crate::models::AppConfig;
use crate::repositories::book_reading_format_repo::SqliteBookReadingFormatRepository;
use crate::services::library_service::LibraryService;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct BookReadingFormatService;

impl BookReadingFormatService {
    pub async fn list(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
    ) -> Result<BTreeMap<String, String>, AppError> {
        let lib = LibraryService::resolve_library(Some(library_id), config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir);
        let db = SqliteBookReadingFormatRepository::open(&sidecar_root.to_string_lossy()).await?;
        let rows = SqliteBookReadingFormatRepository::list(&db).await?;
        let library_root = library_root_path(&lib, app_data_dir);
        let mut result = BTreeMap::new();

        for row in rows {
            let book = match myreader_core::api::catalog::get_book_detail(
                &library_root,
                row.book_id,
            )
            .await
            {
                Ok(detail) => detail.book,
                Err(myreader_core::CoreError::NotFound(_)) => continue,
                Err(error) => return Err(error.into()),
            };
            let readable = readable_formats(&book.formats);
            if readable.len() <= 1 {
                continue;
            }
            let format = row.reading_format.to_uppercase();
            if readable.iter().any(|item| item == &format) {
                result.insert(row.book_id.to_string(), format);
            }
        }

        Ok(result)
    }

    pub async fn set(
        app_data_dir: &Path,
        config: &AppConfig,
        library_id: &str,
        book_id: i64,
        format: Option<&str>,
    ) -> Result<(), AppError> {
        let lib = LibraryService::resolve_library(Some(library_id), config)?;
        let sidecar_root = library_sidecar_path(&lib, app_data_dir);
        let db = SqliteBookReadingFormatRepository::open(&sidecar_root.to_string_lossy()).await?;

        let Some(format) = format else {
            SqliteBookReadingFormatRepository::clear(&db, book_id).await?;
            return Ok(());
        };

        let library_root = library_root_path(&lib, app_data_dir);
        let book = myreader_core::api::catalog::get_book_detail(&library_root, book_id)
            .await?
            .book;
        let readable = readable_formats(&book.formats);
        if readable.len() <= 1 {
            SqliteBookReadingFormatRepository::clear(&db, book_id).await?;
            return Ok(());
        }

        let format = format.to_uppercase();
        if !readable.iter().any(|item| item == &format) {
            return Err(AppError::Config(format!(
                "BOOK_READING_FORMAT_NOT_READABLE: {format}"
            )));
        }

        SqliteBookReadingFormatRepository::set(&db, book_id, &format).await
    }
}

fn readable_formats(formats: &[String]) -> Vec<String> {
    let mut result: Vec<String> = formats
        .iter()
        .map(|format| format.to_uppercase())
        .filter(|format| matches!(format.as_str(), "EPUB" | "CBZ" | "PDF"))
        .collect();
    result.sort();
    result.dedup();
    result
}
