use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, TimeZone, Utc};
use uuid::Uuid;

use crate::models::catalog::{
    myreader_book_relative_path, myreader_cover_relative_path, BookFilePathRequest,
};
use crate::models::{
    is_remote_library_source_type, BookContent, BookDetail, BookEntry, BookFormat, BookIdentifier,
    BookSummary, FormatSize, ImportBookRequest, LibraryType, PaginatedBooks, ReadingFormatPolicy,
    UpdateBookMetadataRequest,
};
use crate::repositories::calibre::{CalibreBookRepository, CatalogRepository};
use crate::repositories::content::PendingBookImport;
use crate::sync::{
    document::CatalogBookValue,
    document_engine::DocumentCommand,
    persistence::{ensure_database_document, execute_local_database_command, SyncDatabaseCommand},
};
use crate::CoreError;

pub struct CatalogService;

#[derive(Clone, Copy, PartialEq, Eq)]
enum ImportDelivery {
    Local,
    DeferredRemote,
}

impl CatalogService {
    fn registered_library_type(
        config_path: &Path,
        library_id: &str,
    ) -> Result<LibraryType, CoreError> {
        let config = crate::services::config::ConfigService::load(config_path)?
            .ok_or_else(|| CoreError::NotFound("APP_CONFIG_NOT_FOUND".into()))?;
        config
            .libraries
            .iter()
            .find(|library| library.id == library_id)
            .map(|library| library.library_type)
            .ok_or_else(|| CoreError::NotFound(format!("LIBRARY_NOT_FOUND: {library_id}")))
    }

    async fn open_library_repository(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<CatalogRepository, CoreError> {
        match library_type {
            LibraryType::Calibre => CatalogRepository::open(&content_root.to_string_lossy()).await,
            LibraryType::MyReader => {
                CatalogRepository::open_myreader(sidecar_root, content_root).await
            }
        }
    }

    pub async fn list_library_books(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<Vec<BookEntry>, CoreError> {
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_all_books()
            .await
    }

    pub async fn list_library_books_page(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, CoreError> {
        let repository =
            Self::open_library_repository(library_type, sidecar_root, content_root).await?;
        let (items, total) = repository
            .get_books_page(
                offset,
                limit.clamp(1, 200),
                sort_by.unwrap_or("title"),
                search,
            )
            .await?;
        Ok(PaginatedBooks { items, total })
    }

    pub async fn list_library_books_page_by_last_read(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        offset: usize,
        limit: usize,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, CoreError> {
        let mut books = Self::list_library_books(library_type, sidecar_root, content_root).await?;
        if let Some(keyword) = search.filter(|value| !value.trim().is_empty()) {
            let keyword = keyword.to_lowercase();
            books.retain(|book| {
                book.title.to_lowercase().contains(&keyword)
                    || book.author_sort.to_lowercase().contains(&keyword)
                    || book
                        .authors
                        .iter()
                        .any(|author| author.to_lowercase().contains(&keyword))
                    || book
                        .tags
                        .iter()
                        .any(|tag| tag.to_lowercase().contains(&keyword))
            });
        }

        let latest_by_book =
            crate::services::reading::ReadingService::latest_read_at_by_book(sidecar_root).await?;
        books.retain(|book| latest_by_book.contains_key(&book.id));
        books.sort_by(|left, right| {
            let left_read_at = latest_by_book.get(&left.id).copied();
            let right_read_at = latest_by_book.get(&right.id).copied();
            match (left_read_at, right_read_at) {
                (Some(left_time), Some(right_time)) => right_time
                    .partial_cmp(&left_time)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase())),
                _ => left.title.to_lowercase().cmp(&right.title.to_lowercase()),
            }
        });

        let total = books.len();
        let items = books
            .into_iter()
            .skip(offset)
            .take(limit.clamp(1, 200))
            .collect();
        Ok(PaginatedBooks { items, total })
    }

    pub async fn get_library_book_detail(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        book_id: i64,
    ) -> Result<BookDetail, CoreError> {
        let repository =
            Self::open_library_repository(library_type, sidecar_root, content_root).await?;
        let book = repository
            .get_book_by_id(book_id)
            .await?
            .ok_or_else(|| CoreError::NotFound(format!("BOOK_NOT_FOUND: {book_id}")))?;
        let format_sizes = repository
            .get_book_format_sizes(book_id)
            .await?
            .into_iter()
            .map(|(format, size_bytes)| FormatSize { format, size_bytes })
            .collect();
        let identifiers = repository
            .get_book_identifiers(book_id)
            .await?
            .into_iter()
            .map(|(id_type, value)| BookIdentifier { id_type, value })
            .collect();
        Ok(BookDetail {
            book,
            format_sizes,
            identifiers,
        })
    }

    pub async fn list_library_series_books(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, CoreError> {
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_books_by_series(series_name, exclude_book_id)
            .await
    }

    pub async fn count_library_books(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<usize, CoreError> {
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_book_count()
            .await
    }

    pub async fn get_library_identity(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<String, CoreError> {
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_library_uuid()
            .await
    }

    pub async fn list_library_book_summaries(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<Vec<BookSummary>, CoreError> {
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_book_summaries()
            .await
    }

    pub async fn list_library_book_formats(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        book_id: i64,
    ) -> Result<Vec<BookFormat>, CoreError> {
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_book_formats(book_id)
            .await
    }

    pub async fn get_library_book_format(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        book_id: i64,
        format: &str,
    ) -> Result<Option<BookFormat>, CoreError> {
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_book_format(book_id, format)
            .await
    }

    pub async fn count_registered_library_books(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<usize, CoreError> {
        Self::count_library_books(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
        )
        .await
    }

    pub async fn list_registered_library_books(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<Vec<BookEntry>, CoreError> {
        Self::list_library_books(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn list_registered_library_books_page(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, CoreError> {
        Self::list_library_books_page(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
            offset,
            limit,
            sort_by,
            search,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn list_registered_library_books_page_by_last_read(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        offset: usize,
        limit: usize,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, CoreError> {
        Self::list_library_books_page_by_last_read(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
            offset,
            limit,
            search,
        )
        .await
    }

    pub async fn get_registered_library_book_detail(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        book_id: i64,
    ) -> Result<BookDetail, CoreError> {
        Self::get_library_book_detail(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
            book_id,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn list_registered_library_series_books(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, CoreError> {
        Self::list_library_series_books(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
            series_name,
            exclude_book_id,
        )
        .await
    }

    pub async fn get_registered_library_identity(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<String, CoreError> {
        Self::get_library_identity(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
        )
        .await
    }

    pub async fn list_registered_library_book_summaries(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<Vec<BookSummary>, CoreError> {
        Self::list_library_book_summaries(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
        )
        .await
    }

    pub async fn list_registered_library_book_formats(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        book_id: i64,
    ) -> Result<Vec<BookFormat>, CoreError> {
        Self::list_library_book_formats(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
            book_id,
        )
        .await
    }

    pub async fn get_registered_library_book_format(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        book_id: i64,
        format: &str,
    ) -> Result<Option<BookFormat>, CoreError> {
        Self::get_library_book_format(
            Self::registered_library_type(config_path, library_id)?,
            sidecar_root,
            content_root,
            book_id,
            format,
        )
        .await
    }

    pub async fn get_library_book_file_paths(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        requests: &[(i64, String)],
    ) -> Result<HashMap<(i64, String), PathBuf>, CoreError> {
        let requests = requests
            .iter()
            .map(|(book_id, format)| BookFilePathRequest {
                book_id: *book_id,
                format: format.clone(),
            })
            .collect::<Vec<_>>();
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_book_file_paths(&requests)
            .await
    }

    pub async fn get_library_book_cover_path(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        book_path: &str,
    ) -> Result<Option<PathBuf>, CoreError> {
        Self::open_library_repository(library_type, sidecar_root, content_root)
            .await?
            .get_book_cover_path(book_path)
    }

    pub async fn get_library_book_cover_bytes(
        library_type: LibraryType,
        sidecar_root: &Path,
        content_root: &Path,
        book_path: &str,
    ) -> Result<Option<Vec<u8>>, CoreError> {
        match Self::get_library_book_cover_path(library_type, sidecar_root, content_root, book_path)
            .await?
        {
            Some(path) => Ok(Some(std::fs::read(path)?)),
            None => Ok(None),
        }
    }

    pub fn validate_library(library_root: &Path) -> bool {
        CalibreBookRepository::validate_library(&library_root.to_string_lossy())
    }

    pub async fn inspect_library(
        library_root: &Path,
    ) -> Result<(PathBuf, Vec<BookSummary>), CoreError> {
        let library_root = dunce::canonicalize(library_root)
            .map_err(|error| CoreError::Config(format!("INVALID_LIBRARY_PATH: {error}")))?;
        if !Self::validate_library(&library_root) {
            return Err(CoreError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                library_root.display()
            )));
        }
        let books = Self::list_book_summaries(&library_root).await?;
        Ok((library_root, books))
    }

    pub async fn list_books(library_root: &Path) -> Result<Vec<BookEntry>, CoreError> {
        Self::list_library_books(LibraryType::Calibre, library_root, library_root).await
    }

    pub async fn list_myreader_books(
        sidecar_root: &Path,
        content_root: &Path,
    ) -> Result<Vec<BookEntry>, CoreError> {
        Self::list_library_books(LibraryType::MyReader, sidecar_root, content_root).await
    }

    pub async fn get_myreader_book_content(
        sidecar_root: &Path,
        content_root: &Path,
        book_id: i64,
        format: &str,
    ) -> Result<BookContent, CoreError> {
        let format = ReadingFormatPolicy::normalize(format)
            .ok_or_else(|| CoreError::Config("BOOK_FORMAT_UNSUPPORTED".into()))?;
        let marker = crate::services::library::LibraryService::read_myreader_marker(content_root)?;
        crate::database::open_db(&sidecar_root.to_string_lossy()).await?;
        let database_path = crate::database::library_db_path(&sidecar_root.to_string_lossy())?;
        let database_path = database_path
            .to_str()
            .ok_or_else(|| CoreError::Config("LIBRARY_PATH_INVALID_UTF8".into()))?;
        let identity = crate::sync::persistence::ensure_database_identity(
            database_path,
            &marker.library_uuid,
        )?;
        let document = ensure_database_document(database_path, &identity, 0)?;
        let book = document
            .projection
            .catalog_books
            .into_iter()
            .find(|book| book.book_id == book_id && !book.deleted && book.format == format)
            .ok_or_else(|| {
                CoreError::NotFound(format!("BOOK_FORMAT_NOT_FOUND: {book_id}/{format}"))
            })?;
        Ok(BookContent {
            book_id,
            format,
            relative_path: myreader_book_relative_path(&book.path, &book.name, &book.format),
            size: book.size,
            sha256: book.sha256,
        })
    }

    pub async fn import_local_book(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        request: ImportBookRequest,
    ) -> Result<BookEntry, CoreError> {
        Self::import_myreader_book(
            config_path,
            library_id,
            sidecar_root,
            content_root,
            request,
            ImportDelivery::Local,
        )
        .await
    }

    pub async fn stage_remote_book_import(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        request: ImportBookRequest,
    ) -> Result<BookEntry, CoreError> {
        Self::import_myreader_book(
            config_path,
            library_id,
            sidecar_root,
            content_root,
            request,
            ImportDelivery::DeferredRemote,
        )
        .await
    }

    async fn import_myreader_book(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        request: ImportBookRequest,
        delivery: ImportDelivery,
    ) -> Result<BookEntry, CoreError> {
        let source_path = request.source_file_path.trim();
        if source_path.is_empty() {
            return Err(CoreError::Config("BOOK_FILE_PATH_REQUIRED".into()));
        }
        let source_path = dunce::canonicalize(source_path)
            .map_err(|error| CoreError::NotFound(format!("BOOK_FILE_NOT_FOUND: {error}")))?;
        if !source_path.is_file() {
            return Err(CoreError::NotFound("BOOK_FILE_NOT_FOUND".into()));
        }
        let format = source_path
            .extension()
            .and_then(|value| value.to_str())
            .and_then(ReadingFormatPolicy::normalize)
            .ok_or_else(|| CoreError::Config("BOOK_FORMAT_UNSUPPORTED".into()))?;
        let imported_file_name = request
            .source_file_name
            .as_deref()
            .and_then(imported_file_basename)
            .or_else(|| source_path.file_name().and_then(|value| value.to_str()))
            .ok_or_else(|| CoreError::Config("BOOK_FILE_NAME_REQUIRED".into()))?;
        let original_stem = imported_file_stem(imported_file_name, &format)
            .ok_or_else(|| CoreError::Config("BOOK_FILE_NAME_REQUIRED".into()))?;
        let analysis =
            crate::services::publication_analysis::analyze_publication(&source_path, &format).await;
        let crate::services::publication_analysis::PublicationAnalysis {
            title: analyzed_title,
            authors: analyzed_authors,
            cover_jpeg,
        } = analysis;
        let title = request
            .title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .or(analyzed_title)
            .unwrap_or_else(|| original_stem.clone());
        let name = sanitize_book_storage_name(&title);
        let authors = normalize_authors(if analyzed_authors.is_empty() {
            request.authors
        } else {
            analyzed_authors
        })?;
        let timestamp = catalog_timestamp(request.recorded_at_ms)?;
        let (library, _, database_path, identity) =
            crate::services::library::LibraryService::writable_myreader_identity(
                config_path,
                library_id,
                content_root,
                sidecar_root,
                request.recorded_at_ms,
            )
            .await?;
        let remote_library = is_remote_library_source_type(library.source_type.as_deref());
        if remote_library != (delivery == ImportDelivery::DeferredRemote) {
            return Err(CoreError::Config(if remote_library {
                "REMOTE_LIBRARY_STORAGE_REQUIRED".into()
            } else {
                "LOCAL_MYREADER_LIBRARY_REQUIRED".into()
            }));
        }
        let current = ensure_database_document(&database_path, &identity, request.recorded_at_ms)?;
        let pending_imports =
            crate::services::content::ContentService::list_pending_book_imports(sidecar_root)
                .await?;
        let mut used_book_ids = current
            .projection
            .catalog_books
            .iter()
            .map(|book| book.book_id)
            .collect::<HashSet<_>>();
        used_book_ids.extend(pending_imports.iter().map(|pending| pending.book_id));
        let mut used_book_uuids = current
            .projection
            .catalog_books
            .iter()
            .map(|book| book.uuid.clone())
            .collect::<HashSet<_>>();
        used_book_uuids.extend(
            pending_imports
                .iter()
                .map(|pending| pending.book_uuid.clone()),
        );
        let mut used_book_paths = current
            .projection
            .catalog_books
            .iter()
            .map(|book| book.path.clone())
            .collect::<HashSet<_>>();
        used_book_paths.extend(
            pending_imports
                .iter()
                .filter_map(|pending| pending_book_path(&pending.relative_path)),
        );
        let book_id = new_book_id(&used_book_ids);
        let (book_uuid, book_path) =
            new_book_storage(&used_book_uuids, &used_book_paths, content_root, &name);
        let book_directory = content_root.join(&book_path);
        let file_name = format!("{name}.{}", format.to_ascii_lowercase());
        let final_path = book_directory.join(&file_name);
        let temporary_path = book_directory.join(format!("{file_name}.part"));
        let cover_path = book_directory.join("cover.jpg");
        let cover_temporary_path = book_directory.join("cover.jpg.part");
        tokio::fs::create_dir_all(&book_directory).await?;

        let prepared = async {
            let digest = if request.consume_source_file {
                crate::infrastructure::file::consume_file_with_sha256(&source_path, &temporary_path)
                    .await?
            } else {
                crate::infrastructure::file::copy_file_with_sha256(&source_path, &temporary_path)
                    .await?
            };
            if digest.size < 1 {
                return Err(CoreError::DataIntegrity("BOOK_FILE_EMPTY".into()));
            }
            tokio::fs::rename(&temporary_path, &final_path).await?;
            if let Some(cover) = cover_jpeg.as_deref() {
                tokio::fs::write(&cover_temporary_path, cover).await?;
                tokio::fs::rename(&cover_temporary_path, &cover_path).await?;
            }
            Ok(digest)
        }
        .await;
        let digest = match prepared {
            Ok(digest) => digest,
            Err(error) => {
                let _ = tokio::fs::remove_dir_all(&book_directory).await;
                return Err(error);
            }
        };
        let has_cover = cover_jpeg.is_some();
        let relative_path = myreader_book_relative_path(&book_path, &name, &format);
        let pending = PendingBookImport {
            book_uuid: book_uuid.clone(),
            book_id,
            title: title.clone(),
            authors: authors.clone(),
            format: format.clone(),
            size: digest.size,
            sha256: digest.sha256.clone(),
            relative_path: relative_path.clone(),
            recorded_at_ms: request.recorded_at_ms,
        };
        let book = BookEntry {
            id: book_id,
            title: title.clone(),
            title_sort: title.clone(),
            author_sort: authors.join(" & "),
            authors: authors.clone(),
            tags: Vec::new(),
            series: None,
            series_index: None,
            formats: vec![format.clone()],
            has_cover,
            path: book_path.clone(),
            timestamp: Some(timestamp.clone()),
            pubdate: None,
            last_modified: Some(timestamp.clone()),
            comment: None,
            publisher: None,
            languages: Vec::new(),
            rating: None,
            uuid: Some(book_uuid.clone()),
        };
        if delivery == ImportDelivery::DeferredRemote {
            let local_mtime = match file_mtime_ms(&final_path).await {
                Ok(local_mtime) => local_mtime,
                Err(error) => {
                    let _ = tokio::fs::remove_dir_all(&book_directory).await;
                    return Err(error);
                }
            };
            if let Err(error) = crate::services::content::ContentService::stage_pending_book_import(
                sidecar_root,
                &pending,
                local_mtime,
            )
            .await
            {
                let _ = tokio::fs::remove_dir_all(&book_directory).await;
                return Err(error);
            }
        }
        if let Err(error) = execute_local_database_command(
            &database_path,
            &identity,
            request.recorded_at_ms,
            SyncDatabaseCommand {
                command: DocumentCommand::CreateCatalogBook {
                    value: CatalogBookValue {
                        uuid: book_uuid.clone(),
                        book_id,
                        title: title.clone(),
                        authors: authors.clone(),
                        path: book_path.clone(),
                        name: name.clone(),
                        format: format.clone(),
                        size: digest.size,
                        sha256: digest.sha256.clone(),
                        has_cover,
                        timestamp: timestamp.clone(),
                        last_modified: timestamp,
                        deleted: false,
                    },
                    recorded_at: request.recorded_at_ms,
                },
            },
        ) {
            if delivery == ImportDelivery::DeferredRemote {
                let _ = crate::services::content::ContentService::discard_pending_book_import(
                    sidecar_root,
                    &pending.book_uuid,
                    &relative_path,
                )
                .await;
            }
            let _ = tokio::fs::remove_dir_all(&book_directory).await;
            return Err(error.into());
        }
        if delivery == ImportDelivery::Local {
            crate::services::content::ContentService::finalize_verified_downloaded_file(
                sidecar_root,
                &relative_path,
                &final_path,
                digest.size,
                &digest.sha256,
            )
            .await?;
        }
        Ok(book)
    }

    pub async fn update_local_book_metadata(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        request: UpdateBookMetadataRequest,
    ) -> Result<BookEntry, CoreError> {
        if request.book_id < 1 {
            return Err(CoreError::Config("BOOK_ID_INVALID".into()));
        }
        let title = request.title.trim().to_owned();
        if title.is_empty() {
            return Err(CoreError::Config("BOOK_TITLE_REQUIRED".into()));
        }
        let authors = normalize_authors(request.authors)?;
        let last_modified = catalog_timestamp(request.recorded_at_ms)?;
        let (_, _, database_path, identity) =
            crate::services::library::LibraryService::writable_myreader_identity(
                config_path,
                library_id,
                content_root,
                sidecar_root,
                request.recorded_at_ms,
            )
            .await?;
        let current = ensure_database_document(&database_path, &identity, request.recorded_at_ms)?;
        let book = current
            .projection
            .catalog_books
            .iter()
            .find(|book| book.book_id == request.book_id && !book.deleted)
            .ok_or_else(|| CoreError::NotFound(format!("BOOK_NOT_FOUND: {}", request.book_id)))?;
        let book_uuid = book.uuid.clone();
        execute_local_database_command(
            &database_path,
            &identity,
            request.recorded_at_ms,
            SyncDatabaseCommand {
                command: DocumentCommand::UpdateCatalogBookMetadata {
                    uuid: book_uuid,
                    title,
                    authors,
                    last_modified,
                    recorded_at: request.recorded_at_ms,
                },
            },
        )?;
        CatalogRepository::open_myreader(sidecar_root, content_root)
            .await?
            .get_book_by_id(request.book_id)
            .await?
            .ok_or_else(|| CoreError::DataIntegrity("CATALOG_PROJECTION_MISSING_BOOK".into()))
    }

    pub async fn delete_local_book(
        config_path: &Path,
        library_id: &str,
        sidecar_root: &Path,
        content_root: &Path,
        book_id: i64,
        recorded_at_ms: i64,
    ) -> Result<(), CoreError> {
        if book_id < 1 {
            return Err(CoreError::Config("BOOK_ID_INVALID".into()));
        }
        let last_modified = catalog_timestamp(recorded_at_ms)?;
        let (library, _, database_path, identity) =
            crate::services::library::LibraryService::writable_myreader_identity(
                config_path,
                library_id,
                content_root,
                sidecar_root,
                recorded_at_ms,
            )
            .await?;
        let current = ensure_database_document(&database_path, &identity, recorded_at_ms)?;
        let book = current
            .projection
            .catalog_books
            .iter()
            .find(|book| book.book_id == book_id)
            .ok_or_else(|| CoreError::NotFound(format!("BOOK_NOT_FOUND: {book_id}")))?;
        let book_uuid = book.uuid.clone();
        let relative_path = myreader_book_relative_path(&book.path, &book.name, &book.format);
        execute_local_database_command(
            &database_path,
            &identity,
            recorded_at_ms,
            SyncDatabaseCommand {
                command: DocumentCommand::DeleteCatalogBook {
                    uuid: book_uuid.clone(),
                    last_modified,
                    recorded_at: recorded_at_ms,
                },
            },
        )?;

        crate::services::content::ContentService::delete_pending_book_import(
            sidecar_root,
            &book_uuid,
        )
        .await?;

        if is_remote_library_source_type(library.source_type.as_deref()) {
            crate::services::content::ContentService::mark_file_remote_delete_pending(
                sidecar_root,
                &relative_path,
            )
            .await?;
            if book.has_cover {
                crate::services::content::ContentService::mark_file_remote_delete_pending(
                    sidecar_root,
                    &myreader_cover_relative_path(&book.path),
                )
                .await?;
            }
        } else {
            crate::services::content::ContentService::delete_file_state(
                sidecar_root,
                &relative_path,
            )
            .await?;
            if book.has_cover {
                crate::services::content::ContentService::delete_file_state(
                    sidecar_root,
                    &myreader_cover_relative_path(&book.path),
                )
                .await?;
            }
        }

        let directory = content_root.join(&book.path);
        match tokio::fs::remove_dir_all(directory).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn list_books_page(
        library_root: &Path,
        offset: usize,
        limit: usize,
        sort_by: Option<&str>,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, CoreError> {
        Self::list_library_books_page(
            LibraryType::Calibre,
            library_root,
            library_root,
            offset,
            limit,
            sort_by,
            search,
        )
        .await
    }

    pub async fn list_books_page_by_last_read(
        library_root: &Path,
        sidecar_root: &Path,
        offset: usize,
        limit: usize,
        search: Option<&str>,
    ) -> Result<PaginatedBooks, CoreError> {
        Self::list_library_books_page_by_last_read(
            LibraryType::Calibre,
            sidecar_root,
            library_root,
            offset,
            limit,
            search,
        )
        .await
    }

    pub async fn get_book_detail(
        library_root: &Path,
        book_id: i64,
    ) -> Result<BookDetail, CoreError> {
        Self::get_library_book_detail(LibraryType::Calibre, library_root, library_root, book_id)
            .await
    }

    pub async fn list_series_books(
        library_root: &Path,
        series_name: &str,
        exclude_book_id: Option<i64>,
    ) -> Result<Vec<BookEntry>, CoreError> {
        Self::list_library_series_books(
            LibraryType::Calibre,
            library_root,
            library_root,
            series_name,
            exclude_book_id,
        )
        .await
    }

    pub async fn count_books(library_root: &Path) -> Result<usize, CoreError> {
        Self::count_library_books(LibraryType::Calibre, library_root, library_root).await
    }

    pub async fn get_library_uuid(library_root: &Path) -> Result<String, CoreError> {
        Self::get_library_identity(LibraryType::Calibre, library_root, library_root).await
    }

    pub async fn get_source_library_uuid(library_root: &Path) -> Result<String, CoreError> {
        if Self::validate_library(library_root) {
            Self::get_library_uuid(library_root).await
        } else {
            Ok(
                crate::services::library::LibraryService::read_myreader_marker(library_root)?
                    .library_uuid,
            )
        }
    }

    pub async fn list_book_summaries(library_root: &Path) -> Result<Vec<BookSummary>, CoreError> {
        Self::list_library_book_summaries(LibraryType::Calibre, library_root, library_root).await
    }

    pub async fn list_book_formats(
        library_root: &Path,
        book_id: i64,
    ) -> Result<Vec<BookFormat>, CoreError> {
        Self::list_library_book_formats(LibraryType::Calibre, library_root, library_root, book_id)
            .await
    }

    pub async fn get_book_format(
        library_root: &Path,
        book_id: i64,
        format: &str,
    ) -> Result<Option<BookFormat>, CoreError> {
        Self::get_library_book_format(
            LibraryType::Calibre,
            library_root,
            library_root,
            book_id,
            format,
        )
        .await
    }

    pub async fn get_book_file_path(
        library_root: &Path,
        book_id: i64,
        format: &str,
    ) -> Result<Option<PathBuf>, CoreError> {
        Ok(Self::get_book_format(library_root, book_id, format)
            .await?
            .map(|value| library_root.join(value.relative_path)))
    }

    pub async fn get_book_file_paths(
        library_root: &Path,
        requests: &[(i64, String)],
    ) -> Result<HashMap<(i64, String), PathBuf>, CoreError> {
        Self::get_library_book_file_paths(
            LibraryType::Calibre,
            library_root,
            library_root,
            requests,
        )
        .await
    }

    pub async fn get_book_cover_path(
        library_root: &Path,
        book_path: &str,
    ) -> Result<Option<PathBuf>, CoreError> {
        Self::get_library_book_cover_path(
            LibraryType::Calibre,
            library_root,
            library_root,
            book_path,
        )
        .await
    }

    pub async fn get_book_cover_bytes(
        library_root: &Path,
        book_path: &str,
    ) -> Result<Option<Vec<u8>>, CoreError> {
        Self::get_library_book_cover_bytes(
            LibraryType::Calibre,
            library_root,
            library_root,
            book_path,
        )
        .await
    }
}

fn imported_file_basename(value: &str) -> Option<&str> {
    value
        .trim()
        .rsplit(['/', '\\'])
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn imported_file_stem(file_name: &str, format: &str) -> Option<String> {
    let file_name = imported_file_basename(file_name)?;
    let expected_extension = format!(".{format}");
    let stem = if file_name
        .to_ascii_lowercase()
        .ends_with(&expected_extension.to_ascii_lowercase())
    {
        &file_name[..file_name.len() - expected_extension.len()]
    } else {
        Path::new(file_name)
            .file_stem()
            .and_then(|value| value.to_str())?
    };
    let stem = stem.trim();
    (!stem.is_empty()).then(|| stem.to_owned())
}

fn sanitize_book_storage_name(value: &str) -> String {
    let mut name = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    name = name
        .trim_matches(|character: char| character.is_whitespace() || character == '.')
        .to_owned();
    while name.len() > 180 {
        name.pop();
    }
    name = name
        .trim_end_matches(|character: char| character.is_whitespace() || character == '.')
        .to_owned();
    let upper = name.to_ascii_uppercase();
    let reserved = matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (upper.len() == 4
            && (upper.starts_with("COM") || upper.starts_with("LPT"))
            && upper.as_bytes()[3].is_ascii_digit()
            && upper.as_bytes()[3] != b'0');
    if reserved {
        name.insert(0, '_');
    }
    if name.is_empty() {
        "book".to_owned()
    } else {
        name
    }
}

fn normalize_authors(authors: Vec<String>) -> Result<Vec<String>, CoreError> {
    let mut normalized = Vec::new();
    for author in authors {
        let author = author.trim();
        if !author.is_empty() && !normalized.iter().any(|value| value == author) {
            normalized.push(author.to_owned());
        }
    }
    if normalized.is_empty() {
        return Err(CoreError::Config("BOOK_AUTHORS_REQUIRED".into()));
    }
    Ok(normalized)
}

async fn file_mtime_ms(path: &Path) -> Result<i64, CoreError> {
    let metadata = tokio::fs::metadata(path).await?;
    Ok(metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .and_then(|value| i64::try_from(value.as_millis()).ok())
        .unwrap_or(0))
}

pub(crate) fn catalog_timestamp(recorded_at_ms: i64) -> Result<String, CoreError> {
    if recorded_at_ms < 0 {
        return Err(CoreError::Config("RECORDED_AT_INVALID".into()));
    }
    Utc.timestamp_millis_opt(recorded_at_ms)
        .single()
        .map(|timestamp| timestamp.to_rfc3339_opts(SecondsFormat::Millis, true))
        .ok_or_else(|| CoreError::Config("RECORDED_AT_INVALID".into()))
}

fn new_book_id(used: &HashSet<i64>) -> i64 {
    const JS_SAFE_INTEGER_MAX: u128 = (1_u128 << 53) - 1;
    loop {
        let candidate = (Uuid::new_v4().as_u128() & JS_SAFE_INTEGER_MAX) as i64;
        if candidate > 0 && !used.contains(&candidate) {
            return candidate;
        }
    }
}

fn pending_book_path(relative_path: &str) -> Option<String> {
    relative_path
        .rsplit_once('/')
        .map(|(path, _)| path.to_owned())
        .filter(|path| !path.is_empty())
}

fn new_book_storage(
    used_uuids: &HashSet<String>,
    used_paths: &HashSet<String>,
    content_root: &Path,
    name: &str,
) -> (String, String) {
    loop {
        let candidate = Uuid::new_v4().to_string();
        let path = format!("Books/{name} ({})", &candidate[..6]);
        if !used_uuids.contains(candidate.as_str())
            && !used_paths.contains(&path)
            && !content_root.join(&path).exists()
        {
            return (candidate, path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};
    use std::path::Path;

    use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
    use sea_orm::{
        ActiveModelTrait, ConnectionTrait, Database, DatabaseConnection, EntityTrait, Schema, Set,
    };

    use crate::entities::calibre::{
        authors, books, books_authors_link, books_languages_link, books_publishers_link,
        books_ratings_link, books_series_link, books_tags_link, comments, data, identifiers,
        languages, publishers, ratings, series, tags,
    };
    use crate::models::{
        ImportBookRequest, LibraryType, LocalLibraryRequest, UpdateBookMetadataRequest,
    };

    #[test]
    fn should_replace_provider_invalid_characters_when_storage_name_is_created() {
        let stem =
            super::imported_file_stem(r#"C:\Shared\A Wizard: Earthsea?.EPUB"#, "EPUB").unwrap();

        assert_eq!(stem, "A Wizard: Earthsea?");
        assert_eq!(
            super::sanitize_book_storage_name(&stem),
            "A Wizard_ Earthsea_"
        );
    }

    fn write_epub_fixture(path: &Path) {
        let mut cover = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(RgbImage::from_pixel(8, 12, Rgb([190, 60, 30])))
            .write_to(&mut cover, ImageFormat::Png)
            .unwrap();
        let file = std::fs::File::create(path).unwrap();
        let mut archive = zip::ZipWriter::new(file);
        let stored = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        let compressed = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, bytes, options) in [
            ("mimetype", b"application/epub+zip".as_slice(), stored),
            (
                "META-INF/container.xml",
                br#"<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
                compressed,
            ),
            (
                "OEBPS/content.opf",
                br#"<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:test</dc:identifier><dc:title>The Dispossessed</dc:title><dc:creator>Ursula K. Le Guin</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-08-05T00:00:00Z</meta></metadata><manifest><item id="page" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="page"/></spine></package>"#,
                compressed,
            ),
            (
                "OEBPS/cover.xhtml",
                br#"<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="cover.png"/></body></html>"#,
                compressed,
            ),
            ("OEBPS/cover.png", cover.get_ref().as_slice(), compressed),
        ] {
            archive.start_file(name, options).unwrap();
            archive.write_all(bytes).unwrap();
        }
        archive.finish().unwrap();
    }

    async fn create_table<E>(db: &DatabaseConnection, schema: &Schema, entity: E)
    where
        E: EntityTrait,
    {
        let mut statement = schema.create_table_from_entity(entity);
        statement.if_not_exists();
        db.execute(&statement).await.expect("create Calibre table");
    }

    async fn seed_library(root: &Path) {
        let database_path = root.join("metadata.db");
        let database = Database::connect(format!(
            "sqlite://{}?mode=rwc",
            database_path.to_string_lossy()
        ))
        .await
        .expect("open fixture database");
        let schema = Schema::new(database.get_database_backend());
        create_table(&database, &schema, authors::Entity).await;
        create_table(&database, &schema, books::Entity).await;
        create_table(&database, &schema, books_authors_link::Entity).await;
        create_table(&database, &schema, books_languages_link::Entity).await;
        create_table(&database, &schema, books_publishers_link::Entity).await;
        create_table(&database, &schema, books_ratings_link::Entity).await;
        create_table(&database, &schema, books_series_link::Entity).await;
        create_table(&database, &schema, books_tags_link::Entity).await;
        create_table(&database, &schema, comments::Entity).await;
        create_table(&database, &schema, data::Entity).await;
        create_table(&database, &schema, identifiers::Entity).await;
        create_table(&database, &schema, languages::Entity).await;
        create_table(&database, &schema, publishers::Entity).await;
        create_table(&database, &schema, ratings::Entity).await;
        create_table(&database, &schema, series::Entity).await;
        create_table(&database, &schema, tags::Entity).await;
        database
            .execute_unprepared(
                "CREATE TABLE library_id (
                    id INTEGER PRIMARY KEY,
                    uuid TEXT NOT NULL UNIQUE
                );
                INSERT INTO library_id (id, uuid)
                VALUES (1, '018f2f8d-980b-40ef-b72e-c6e86cb7cc28');",
            )
            .await
            .expect("seed library identity");

        books::ActiveModel {
            id: Set(42),
            title: Set(Some("The Left Hand of Darkness".to_owned())),
            sort: Set(Some("Left Hand of Darkness, The".to_owned())),
            author_sort: Set(Some("Le Guin, Ursula K.".to_owned())),
            path: Set(Some(
                "Ursula K. Le Guin/The Left Hand of Darkness".to_owned(),
            )),
            has_cover: Set(Some(1)),
            ..Default::default()
        }
        .insert(&database)
        .await
        .expect("seed book");
        authors::ActiveModel {
            id: Set(7),
            name: Set("Ursula K. Le Guin".to_owned()),
            ..Default::default()
        }
        .insert(&database)
        .await
        .expect("seed author");
        books_authors_link::ActiveModel {
            id: Set(1),
            book: Set(42),
            author: Set(7),
        }
        .insert(&database)
        .await
        .expect("link author");
        data::ActiveModel {
            id: Set(1),
            book: Set(42),
            format: Set("EPUB".to_owned()),
            uncompressed_size: Set(1024),
            name: Set("The Left Hand of Darkness".to_owned()),
        }
        .insert(&database)
        .await
        .expect("seed format");
        identifiers::ActiveModel {
            id: Set(1),
            book: Set(42),
            r#type: Set(Some("isbn".to_owned())),
            val: Set("9780441478125".to_owned()),
        }
        .insert(&database)
        .await
        .expect("seed identifier");
        database.close().await.expect("close fixture database");
    }

    #[tokio::test]
    async fn should_return_joined_catalog_data_when_calibre_library_is_valid() {
        let library = tempfile::tempdir().expect("create library");
        seed_library(library.path()).await;

        let books = super::CatalogService::list_books(library.path())
            .await
            .expect("list books");
        let detail = super::CatalogService::get_book_detail(library.path(), 42)
            .await
            .expect("get book detail");

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].authors, vec!["Ursula K. Le Guin"]);
        assert_eq!(books[0].title_sort, "Left Hand of Darkness, The");
        assert_eq!(detail.format_sizes[0].size_bytes, 1024);
        assert_eq!(detail.identifiers[0].value, "9780441478125");
    }

    #[tokio::test]
    async fn should_return_identity_and_format_path_when_calibre_library_is_valid() {
        let library = tempfile::tempdir().expect("create library");
        seed_library(library.path()).await;

        let library_uuid = super::CatalogService::get_library_uuid(library.path())
            .await
            .expect("read library identity");
        let formats = super::CatalogService::list_book_formats(library.path(), 42)
            .await
            .expect("list book formats");
        let summaries = super::CatalogService::list_book_summaries(library.path())
            .await
            .expect("list book summaries");

        assert_eq!(library_uuid, "018f2f8d-980b-40ef-b72e-c6e86cb7cc28");
        assert_eq!(formats.len(), 1);
        assert_eq!(
            formats[0].relative_path,
            "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub"
        );
        assert_eq!(
            summaries[0].format_paths,
            vec![formats[0].relative_path.clone()]
        );
    }

    #[tokio::test]
    async fn should_resolve_single_format_when_requested_format_uses_different_case() {
        let library = tempfile::tempdir().expect("create library");
        seed_library(library.path()).await;

        let format = super::CatalogService::get_book_format(library.path(), 42, "epub")
            .await
            .expect("resolve book format");
        let missing = super::CatalogService::get_book_format(library.path(), 42, "pdf")
            .await
            .expect("resolve missing format");

        assert_eq!(
            format.as_ref().map(|value| value.format.as_str()),
            Some("EPUB")
        );
        assert_eq!(
            format.map(|value| value.relative_path),
            Some(
                "Ursula K. Le Guin/The Left Hand of Darkness/The Left Hand of Darkness.epub".into()
            )
        );
        assert!(missing.is_none());
    }

    #[tokio::test]
    async fn should_canonicalize_root_and_list_books_when_calibre_library_is_inspected() {
        let library = tempfile::tempdir().expect("create library");
        seed_library(library.path()).await;

        let (root, books) = super::CatalogService::inspect_library(&library.path().join("."))
            .await
            .expect("inspect library");

        assert_eq!(root, dunce::canonicalize(library.path()).unwrap());
        assert_eq!(books.iter().map(|book| book.id).collect::<Vec<_>>(), [42]);
    }

    #[tokio::test]
    async fn should_sort_and_filter_books_when_last_read_page_is_requested() {
        let library = tempfile::tempdir().expect("create library");
        let sidecar = tempfile::tempdir().expect("create sidecar");
        seed_library(library.path()).await;
        let database = Database::connect(format!(
            "sqlite://{}?mode=rw",
            library.path().join("metadata.db").to_string_lossy()
        ))
        .await
        .expect("open fixture database");
        books::ActiveModel {
            id: Set(43),
            title: Set(Some("A Wizard of Earthsea".to_owned())),
            sort: Set(Some("Wizard of Earthsea, A".to_owned())),
            author_sort: Set(Some("Le Guin, Ursula K.".to_owned())),
            path: Set(Some("Ursula K. Le Guin/A Wizard of Earthsea".to_owned())),
            has_cover: Set(Some(0)),
            ..Default::default()
        }
        .insert(&database)
        .await
        .expect("seed second book");
        database.close().await.expect("close fixture database");

        crate::services::reading::ReadingService::set_reading_position(
            sidecar.path(),
            library.path(),
            42,
            "EPUB",
            r#"{"href":"left-hand.xhtml","type":"application/xhtml+xml"}"#,
            Some(0.4),
            1_000,
        )
        .await
        .expect("write older position");
        crate::services::reading::ReadingService::set_reading_position(
            sidecar.path(),
            library.path(),
            43,
            "EPUB",
            r#"{"href":"earthsea.xhtml","type":"application/xhtml+xml"}"#,
            Some(0.6),
            2_000,
        )
        .await
        .expect("write newer position");

        let page = super::CatalogService::list_books_page_by_last_read(
            library.path(),
            sidecar.path(),
            0,
            10,
            None,
        )
        .await
        .expect("list recent books");
        let filtered = super::CatalogService::list_books_page_by_last_read(
            library.path(),
            sidecar.path(),
            0,
            10,
            Some("Darkness"),
        )
        .await
        .expect("filter recent books");

        assert_eq!(page.total, 2);
        assert_eq!(page.items[0].id, 43);
        assert_eq!(page.items[1].id, 42);
        assert_eq!(filtered.total, 1);
        assert_eq!(filtered.items[0].id, 42);
    }

    #[tokio::test]
    async fn should_import_edit_read_favorite_and_delete_local_myreader_book() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let library_root = directory.path().join("My Library");
        let sidecars = directory.path().join("sidecars");
        let source_file = directory.path().join("temporary-import.epub");
        write_epub_fixture(&source_file);
        let (_, library) = crate::services::library::LibraryService::create_local_myreader(
            &config_path,
            LocalLibraryRequest {
                library_root_path: library_root.to_string_lossy().into_owned(),
                path: library_root.to_string_lossy().into_owned(),
                source_path: None,
                sidecar_container_parent_path: Some(sidecars.to_string_lossy().into_owned()),
                name: None,
                metadata_uri: None,
                added_at: None,
                security_scoped_bookmark: None,
            },
            100,
        )
        .await
        .unwrap();
        assert_eq!(library.library_type, LibraryType::MyReader);
        let sidecar_root = sidecars.join(&library.id);

        let imported = super::CatalogService::import_local_book(
            &config_path,
            &library.id,
            &sidecar_root,
            &library_root,
            ImportBookRequest {
                source_file_path: source_file.to_string_lossy().into_owned(),
                source_file_name: Some("Original Download.epub".into()),
                title: None,
                authors: vec!["Unknown author".into()],
                recorded_at_ms: 200,
                consume_source_file: false,
            },
        )
        .await
        .unwrap();
        let marker =
            crate::services::library::LibraryService::read_myreader_marker(&library_root).unwrap();
        let database_path =
            crate::database::library_db_path(&sidecar_root.to_string_lossy()).unwrap();
        let identity = crate::sync::persistence::ensure_database_identity(
            database_path.to_str().unwrap(),
            &marker.library_uuid,
        )
        .unwrap();
        let imported_document = crate::sync::persistence::ensure_database_document(
            database_path.to_str().unwrap(),
            &identity,
            200,
        )
        .unwrap();
        let original = imported_document
            .projection
            .catalog_books
            .iter()
            .find(|book| book.book_id == imported.id)
            .unwrap()
            .clone();
        let installed = library_root
            .join(&imported.path)
            .join("The Dispossessed.epub");
        let cover = library_root.join(&imported.path).join("cover.jpg");
        let page = super::CatalogService::list_registered_library_books_page(
            &config_path,
            &library.id,
            &sidecar_root,
            &library_root,
            0,
            20,
            Some("title"),
            Some("Le Guin"),
        )
        .await
        .unwrap();
        let detail = super::CatalogService::get_registered_library_book_detail(
            &config_path,
            &library.id,
            &sidecar_root,
            &library_root,
            imported.id,
        )
        .await
        .unwrap();
        let paths = super::CatalogService::get_library_book_file_paths(
            LibraryType::MyReader,
            &sidecar_root,
            &library_root,
            &[(imported.id, "EPUB".into())],
        )
        .await
        .unwrap();

        assert!(imported.id > 0);
        assert!(imported.id <= 9_007_199_254_740_991);
        assert_eq!(imported.title, "The Dispossessed");
        assert_eq!(imported.authors, ["Ursula K. Le Guin"]);
        assert_eq!(imported.formats, ["EPUB"]);
        assert!(imported.has_cover);
        assert_eq!(
            imported.path,
            format!("Books/The Dispossessed ({})", &original.uuid[..6])
        );
        assert_eq!(original.path, imported.path);
        assert_eq!(original.name, "The Dispossessed");
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0], imported);
        assert_eq!(detail.book, imported);
        assert_eq!(detail.format_sizes[0].size_bytes, original.size);
        assert!(detail.identifiers.is_empty());
        assert_eq!(paths.get(&(imported.id, "EPUB".into())), Some(&installed));
        assert_eq!(
            tokio::fs::read(&installed).await.unwrap(),
            tokio::fs::read(&source_file).await.unwrap()
        );
        assert!(image::load_from_memory(&tokio::fs::read(&cover).await.unwrap()).is_ok());
        assert_eq!(
            crate::services::content::ContentService::sha256_file(&installed)
                .await
                .unwrap()
                .sha256,
            original.sha256
        );

        let updated = super::CatalogService::update_local_book_metadata(
            &config_path,
            &library.id,
            &sidecar_root,
            &library_root,
            UpdateBookMetadataRequest {
                book_id: imported.id,
                title: "The Dispossessed: An Ambiguous Utopia".into(),
                authors: vec!["Ursula Le Guin".into()],
                recorded_at_ms: 300,
            },
        )
        .await
        .unwrap();
        let updated_document = crate::sync::persistence::ensure_database_document(
            database_path.to_str().unwrap(),
            &identity,
            300,
        )
        .unwrap();
        let after_update = updated_document
            .projection
            .catalog_books
            .iter()
            .find(|book| book.book_id == imported.id)
            .unwrap();

        assert_eq!(updated.id, imported.id);
        assert_eq!(updated.path, imported.path);
        assert_eq!(after_update.uuid, original.uuid);
        assert_eq!(after_update.book_id, original.book_id);
        assert_eq!(after_update.path, original.path);
        assert_eq!(after_update.name, original.name);
        assert_eq!(after_update.format, original.format);
        assert_eq!(after_update.size, original.size);
        assert_eq!(after_update.sha256, original.sha256);
        assert_eq!(after_update.timestamp, original.timestamp);
        assert_eq!(after_update.title, "The Dispossessed: An Ambiguous Utopia");
        assert_eq!(after_update.authors, ["Ursula Le Guin"]);

        crate::services::reading::ReadingService::set_favorite_book(
            &sidecar_root,
            &library_root,
            imported.id,
            true,
            350,
        )
        .await
        .unwrap();
        super::CatalogService::delete_local_book(
            &config_path,
            &library.id,
            &sidecar_root,
            &library_root,
            imported.id,
            400,
        )
        .await
        .unwrap();

        assert!(
            super::CatalogService::list_myreader_books(&sidecar_root, &library_root)
                .await
                .unwrap()
                .is_empty()
        );
        assert!(!installed.exists());
        assert_eq!(
            crate::services::reading::ReadingService::list_favorite_book_ids(&sidecar_root)
                .await
                .unwrap(),
            [imported.id]
        );
        let deleted_document = crate::sync::persistence::ensure_database_document(
            database_path.to_str().unwrap(),
            &identity,
            400,
        )
        .unwrap();
        assert!(
            deleted_document
                .projection
                .catalog_books
                .iter()
                .find(|book| book.book_id == imported.id)
                .unwrap()
                .deleted
        );
    }

    #[tokio::test]
    async fn should_allocate_distinct_identity_and_path_when_same_book_is_imported_twice() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let library_root = directory.path().join("My Library");
        let sidecars = directory.path().join("sidecars");
        let source_file = directory.path().join("same-book.epub");
        write_epub_fixture(&source_file);
        let (_, library) = crate::services::library::LibraryService::create_local_myreader(
            &config_path,
            LocalLibraryRequest {
                library_root_path: library_root.to_string_lossy().into_owned(),
                path: library_root.to_string_lossy().into_owned(),
                source_path: None,
                sidecar_container_parent_path: Some(sidecars.to_string_lossy().into_owned()),
                name: None,
                metadata_uri: None,
                added_at: None,
                security_scoped_bookmark: None,
            },
            100,
        )
        .await
        .unwrap();
        let sidecar_root = sidecars.join(&library.id);
        let import = |recorded_at_ms| {
            super::CatalogService::import_local_book(
                &config_path,
                &library.id,
                &sidecar_root,
                &library_root,
                ImportBookRequest {
                    source_file_path: source_file.to_string_lossy().into_owned(),
                    source_file_name: Some("Same Book.epub".into()),
                    title: None,
                    authors: vec!["Unknown author".into()],
                    recorded_at_ms,
                    consume_source_file: false,
                },
            )
        };

        let first = import(200).await.unwrap();
        let second = import(201).await.unwrap();

        assert_ne!(first.id, second.id);
        assert_ne!(first.uuid, second.uuid);
        assert_ne!(first.path, second.path);
        assert!(library_root
            .join(&first.path)
            .join("The Dispossessed.epub")
            .is_file());
        assert!(library_root
            .join(&second.path)
            .join("The Dispossessed.epub")
            .is_file());
    }

    #[tokio::test]
    async fn should_read_but_reject_mutation_when_registered_library_is_calibre() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let library_root = directory.path().join("Calibre");
        let sidecars = directory.path().join("sidecars");
        let source_file = directory.path().join("book.epub");
        std::fs::create_dir_all(&library_root).unwrap();
        seed_library(&library_root).await;
        tokio::fs::write(&source_file, b"epub").await.unwrap();
        let (_, library) = crate::services::library::LibraryService::add_local(
            &config_path,
            LocalLibraryRequest {
                library_root_path: library_root.to_string_lossy().into_owned(),
                path: library_root.to_string_lossy().into_owned(),
                source_path: None,
                sidecar_container_parent_path: Some(sidecars.to_string_lossy().into_owned()),
                name: None,
                metadata_uri: None,
                added_at: None,
                security_scoped_bookmark: None,
            },
        )
        .await
        .unwrap();

        let books = super::CatalogService::list_registered_library_books(
            &config_path,
            &library.id,
            &sidecars.join(&library.id),
            &library_root,
        )
        .await
        .unwrap();

        let error = super::CatalogService::import_local_book(
            &config_path,
            &library.id,
            &sidecars.join(&library.id),
            &library_root,
            ImportBookRequest {
                source_file_path: source_file.to_string_lossy().into_owned(),
                source_file_name: None,
                title: None,
                authors: vec!["Author".into()],
                recorded_at_ms: 100,
                consume_source_file: false,
            },
        )
        .await
        .unwrap_err();

        assert_eq!(books.iter().map(|book| book.id).collect::<Vec<_>>(), [42]);
        assert!(error.to_string().contains("LIBRARY_NOT_MYREADER"));
        assert!(!library_root.join("Books").exists());
    }
}
