use std::collections::BTreeMap;
use std::path::Path;

use crate::error::AppError;
use crate::models::AppConfig;
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
        let library_root = library_root_path(&lib, app_data_dir);
        Ok(
            my_reader_core::api::content::list_reading_formats(&sidecar_root, &library_root)
                .await?,
        )
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
        let library_root = library_root_path(&lib, app_data_dir);
        Ok(my_reader_core::api::content::set_reading_format(
            &sidecar_root,
            &library_root,
            book_id,
            format,
        )
        .await?)
    }
}
