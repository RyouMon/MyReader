use crate::error::AppError;
use std::path::Path;

use crate::models::{
    AppConfig, BookDetail, BookEntry, ImportBookOutcome, LibraryConfig, PaginatedBooks,
};
use crate::services::book_transfer_scheduler::BookTransferScheduler;
use crate::services::library_service::LibraryService;
use crate::utils::paths::{library_root_path, library_sidecar_path};

pub struct BookService;

impl BookService {
    pub async fn get_library_books(
        lib: &LibraryConfig,
        app_data_dir: &Path,
    ) -> Result<Vec<BookEntry>, AppError> {
        let content_root = library_root_path(lib, app_data_dir);
        let sidecar_root = library_sidecar_path(lib, app_data_dir);
        Ok(
            my_reader_core::api::catalog::CatalogService::list_library_books(
                lib.library_type.into(),
                &sidecar_root,
                &content_root,
            )
            .await?
            .into_iter()
            .map(Into::into)
            .collect(),
        )
    }

    pub async fn get_library_books_page(
        lib: &LibraryConfig,
        app_data_dir: &Path,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        let content_root = library_root_path(lib, app_data_dir);
        let sidecar_root = library_sidecar_path(lib, app_data_dir);
        Ok(
            my_reader_core::api::catalog::CatalogService::list_library_books_page(
                lib.library_type.into(),
                &sidecar_root,
                &content_root,
                offset,
                limit,
                sort_by,
                search,
            )
            .await?
            .into(),
        )
    }

    pub async fn get_library_books_page_by_last_read(
        lib: &LibraryConfig,
        app_data_dir: &Path,
        offset: usize,
        limit: usize,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        let content_root = library_root_path(lib, app_data_dir);
        let sidecar_root = library_sidecar_path(lib, app_data_dir);
        Ok(
            my_reader_core::api::catalog::CatalogService::list_library_books_page_by_last_read(
                lib.library_type.into(),
                &sidecar_root,
                &content_root,
                offset,
                limit,
                search,
            )
            .await?
            .into(),
        )
    }

    pub async fn get_library_book_detail(
        lib: &LibraryConfig,
        app_data_dir: &Path,
        book_id: i64,
    ) -> Result<BookDetail, AppError> {
        let content_root = library_root_path(lib, app_data_dir);
        let sidecar_root = library_sidecar_path(lib, app_data_dir);
        Ok(
            my_reader_core::api::catalog::CatalogService::get_library_book_detail(
                lib.library_type.into(),
                &sidecar_root,
                &content_root,
                book_id,
            )
            .await?
            .into(),
        )
    }

    pub async fn get_library_series_books(
        lib: &LibraryConfig,
        app_data_dir: &Path,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError> {
        let content_root = library_root_path(lib, app_data_dir);
        let sidecar_root = library_sidecar_path(lib, app_data_dir);
        Ok(
            my_reader_core::api::catalog::CatalogService::list_library_series_books(
                lib.library_type.into(),
                &sidecar_root,
                &content_root,
                series_name,
                exclude_book_id,
            )
            .await?
            .into_iter()
            .map(Into::into)
            .collect(),
        )
    }

    pub async fn import_book(
        config_path: &Path,
        lib: &LibraryConfig,
        app_data_dir: &Path,
        request: my_reader_core::models::ImportBookRequest,
    ) -> Result<ImportBookOutcome, AppError> {
        let content_root = library_root_path(lib, app_data_dir);
        let sidecar_root = library_sidecar_path(lib, app_data_dir);
        let book = if lib.is_remote() {
            my_reader_core::api::catalog::CatalogService::stage_remote_book_import(
                config_path,
                &lib.id,
                &sidecar_root,
                &content_root,
                request,
            )
            .await?
        } else {
            my_reader_core::api::catalog::CatalogService::import_local_book(
                config_path,
                &lib.id,
                &sidecar_root,
                &content_root,
                request,
            )
            .await?
        };
        Ok(ImportBookOutcome {
            queued: false,
            book: Some(book.into()),
        })
    }

    pub fn request_book_upload(
        config: &AppConfig,
        scheduler: &BookTransferScheduler,
        library_id: &str,
        book_uuid: &str,
    ) -> Result<(), AppError> {
        let library = LibraryService::resolve_library(Some(library_id), config)?;
        if !library.is_remote() || !library.is_myreader() {
            return Err(AppError::Config("REMOTE_MYREADER_LIBRARY_REQUIRED".into()));
        }
        let book_uuid = book_uuid.trim();
        if book_uuid.is_empty() {
            return Err(AppError::Config("BOOK_UUID_REQUIRED".into()));
        }
        scheduler.request_book(library.id, book_uuid);
        Ok(())
    }

    pub async fn update_local_book_metadata(
        config_path: &Path,
        lib: &LibraryConfig,
        app_data_dir: &Path,
        request: my_reader_core::models::UpdateBookMetadataRequest,
    ) -> Result<BookEntry, AppError> {
        let content_root = library_root_path(lib, app_data_dir);
        let sidecar_root = library_sidecar_path(lib, app_data_dir);
        Ok(
            my_reader_core::api::catalog::CatalogService::update_local_book_metadata(
                config_path,
                &lib.id,
                &sidecar_root,
                &content_root,
                request,
            )
            .await?
            .into(),
        )
    }

    pub async fn delete_local_book(
        config_path: &Path,
        lib: &LibraryConfig,
        app_data_dir: &Path,
        book_id: i64,
        recorded_at_ms: i64,
    ) -> Result<(), AppError> {
        let content_root = library_root_path(lib, app_data_dir);
        let sidecar_root = library_sidecar_path(lib, app_data_dir);
        Ok(
            my_reader_core::api::catalog::CatalogService::delete_local_book(
                config_path,
                &lib.id,
                &sidecar_root,
                &content_root,
                book_id,
                recorded_at_ms,
            )
            .await?,
        )
    }

    pub async fn get_books(lib_path: &str) -> Result<Vec<BookEntry>, AppError> {
        Ok(
            my_reader_core::api::catalog::CatalogService::list_books(Path::new(lib_path))
                .await?
                .into_iter()
                .map(Into::into)
                .collect(),
        )
    }

    pub async fn get_books_page(
        lib_path: &str,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        Ok(
            my_reader_core::api::catalog::CatalogService::list_books_page(
                Path::new(lib_path),
                offset,
                limit,
                sort_by,
                search,
            )
            .await?
            .into(),
        )
    }

    pub async fn get_books_page_by_last_read(
        lib_path: &str,
        sidecar_root: &str,
        offset: usize,
        limit: usize,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, AppError> {
        Ok(
            my_reader_core::api::catalog::CatalogService::list_books_page_by_last_read(
                Path::new(lib_path),
                Path::new(sidecar_root),
                offset,
                limit,
                search,
            )
            .await?
            .into(),
        )
    }

    pub async fn get_book_detail(lib_path: &str, book_id: i64) -> Result<BookDetail, AppError> {
        Ok(
            my_reader_core::api::catalog::CatalogService::get_book_detail(
                Path::new(lib_path),
                book_id,
            )
            .await?
            .into(),
        )
    }

    pub async fn get_series_books(
        lib_path: &str,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, AppError> {
        Ok(
            my_reader_core::api::catalog::CatalogService::list_series_books(
                Path::new(lib_path),
                series_name,
                exclude_book_id,
            )
            .await?
            .into_iter()
            .map(Into::into)
            .collect(),
        )
    }

    pub async fn get_book_cover_bytes(
        lib_path: &str,
        book_path: &str,
    ) -> Result<Option<Vec<u8>>, AppError> {
        Ok(
            my_reader_core::api::catalog::CatalogService::get_book_cover_bytes(
                Path::new(lib_path),
                book_path,
            )
            .await?,
        )
    }
}
