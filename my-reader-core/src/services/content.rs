use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use opendal::Operator;

use crate::database;
use crate::models::{
    BookCoverThumbnailCache, BookCoverThumbnailCachePatch, DownloadedFile, FileDigest, FileState,
    FileStateUpdate, LibraryType, ReadingFormatPolicy,
};
use crate::repositories::content::{ContentRepository, PendingBookImport};
use crate::sync::document::CatalogBookValue;
use crate::CoreError;

pub struct ContentService;

impl ContentService {
    pub async fn sha256_file(path: &Path) -> Result<FileDigest, CoreError> {
        crate::infrastructure::file::sha256_file(path).await
    }

    pub async fn list_reading_formats(
        sidecar_root: &Path,
        library_root: &Path,
    ) -> Result<BTreeMap<String, String>, CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        let rows = ContentRepository::new(&db).list_reading_formats().await?;
        let library_type =
            if crate::services::catalog::CatalogService::validate_library(library_root) {
                LibraryType::Calibre
            } else {
                LibraryType::MyReader
            };
        let books = crate::services::catalog::CatalogService::list_library_book_summaries(
            library_type,
            sidecar_root,
            library_root,
        )
        .await?;
        let formats_by_book = books
            .into_iter()
            .map(|book| {
                (
                    book.id,
                    ReadingFormatPolicy::from_formats(&book.formats).readable_formats,
                )
            })
            .collect::<BTreeMap<_, _>>();

        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let readable = formats_by_book.get(&row.book_id)?;
                let format = row.reading_format.to_uppercase();
                (readable.len() > 1 && readable.contains(&format))
                    .then(|| (row.book_id.to_string(), format))
            })
            .collect())
    }

    pub async fn set_reading_format(
        sidecar_root: &Path,
        library_root: &Path,
        book_id: i64,
        format: Option<&str>,
    ) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        let repository = ContentRepository::new(&db);
        let Some(format) = format else {
            return repository.clear_reading_format(book_id).await;
        };

        let library_type =
            if crate::services::catalog::CatalogService::validate_library(library_root) {
                LibraryType::Calibre
            } else {
                LibraryType::MyReader
            };
        let book = crate::services::catalog::CatalogService::list_library_book_summaries(
            library_type,
            sidecar_root,
            library_root,
        )
        .await?
        .into_iter()
        .find(|book| book.id == book_id)
        .ok_or_else(|| CoreError::NotFound(format!("BOOK_NOT_FOUND: {book_id}")))?;
        let readable = ReadingFormatPolicy::from_formats(&book.formats).readable_formats;
        if readable.len() <= 1 {
            return repository.clear_reading_format(book_id).await;
        }

        let format = format.to_uppercase();
        if !readable.contains(&format) {
            return Err(CoreError::Config(format!(
                "BOOK_READING_FORMAT_NOT_READABLE: {format}"
            )));
        }
        repository.set_reading_format(book_id, &format).await
    }

    pub async fn get_file_state(
        sidecar_root: &Path,
        path: &str,
    ) -> Result<Option<FileState>, CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db).get_file_state(path).await
    }

    pub async fn get_file_states(
        sidecar_root: &Path,
        paths: &[String],
    ) -> Result<HashMap<String, FileState>, CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        Ok(ContentRepository::new(&db)
            .get_file_states(paths)
            .await?
            .into_iter()
            .collect())
    }

    pub async fn list_file_states(sidecar_root: &Path) -> Result<Vec<FileState>, CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db).list_file_states().await
    }

    pub async fn upsert_file_state(
        sidecar_root: &Path,
        path: &str,
        update: FileStateUpdate,
    ) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .upsert_file_state(path, update)
            .await
    }

    pub async fn delete_file_state(sidecar_root: &Path, path: &str) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db).delete_file_state(path).await
    }

    pub(crate) async fn list_pending_book_imports(
        sidecar_root: &Path,
    ) -> Result<Vec<PendingBookImport>, CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .list_pending_book_imports()
            .await
    }

    #[cfg(test)]
    pub(crate) async fn has_pending_book_imports(sidecar_root: &Path) -> Result<bool, CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db).has_pending_book_imports().await
    }

    pub(crate) async fn stage_pending_book_import(
        sidecar_root: &Path,
        pending: &PendingBookImport,
        local_mtime: i64,
    ) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .stage_pending_book_import(pending, local_mtime)
            .await
    }

    pub(crate) async fn discard_pending_book_import(
        sidecar_root: &Path,
        book_uuid: &str,
        relative_path: &str,
    ) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .discard_pending_book_import(book_uuid, relative_path)
            .await
    }

    pub(crate) async fn record_pending_book_import_failure(
        sidecar_root: &Path,
        book_uuid: &str,
        error: &str,
    ) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .record_pending_book_import_failure(book_uuid, error)
            .await
    }

    pub(crate) async fn delete_pending_book_import(
        sidecar_root: &Path,
        book_uuid: &str,
    ) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .delete_pending_book_import(book_uuid)
            .await
    }

    pub(crate) async fn pending_book_import_exists(
        sidecar_root: &Path,
        book_uuid: &str,
    ) -> Result<bool, CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .pending_book_import_exists(book_uuid)
            .await
    }

    pub async fn finalize_downloaded_file(
        sidecar_root: &Path,
        relative_path: &str,
        local_path: &Path,
    ) -> Result<DownloadedFile, CoreError> {
        let digest = Self::sha256_file(local_path)
            .await
            .map_err(|error| CoreError::Storage(format!("DOWNLOADED_FILE_NOT_FOUND: {error}")))?;
        Self::finalize_downloaded_file_with_digest(
            sidecar_root,
            relative_path,
            local_path,
            digest,
            false,
        )
        .await
        .map_err(Self::downloaded_file_error)
    }

    pub async fn finalize_verified_downloaded_file(
        sidecar_root: &Path,
        relative_path: &str,
        local_path: &Path,
        expected_size: i64,
        expected_sha256: &str,
    ) -> Result<DownloadedFile, CoreError> {
        let digest = Self::verified_file_digest(local_path, expected_size, expected_sha256).await?;
        Self::finalize_downloaded_file_with_digest(
            sidecar_root,
            relative_path,
            local_path,
            digest,
            false,
        )
        .await
        .map_err(Self::downloaded_file_error)
    }

    pub(crate) async fn finalize_imported_file(
        sidecar_root: &Path,
        relative_path: &str,
        local_path: &Path,
        digest: FileDigest,
    ) -> Result<DownloadedFile, CoreError> {
        Self::finalize_downloaded_file_with_digest(
            sidecar_root,
            relative_path,
            local_path,
            digest,
            false,
        )
        .await
        .map_err(Self::downloaded_file_error)
    }

    pub async fn install_verified_downloaded_file(
        sidecar_root: &Path,
        relative_path: &str,
        partial_path: &Path,
        final_path: &Path,
        expected_size: i64,
        expected_sha256: &str,
    ) -> Result<DownloadedFile, CoreError> {
        if partial_path == final_path {
            return Err(CoreError::Config(
                "BOOK_FILE_PARTIAL_PATH_MUST_DIFFER".into(),
            ));
        }
        let digest =
            Self::verified_file_digest(partial_path, expected_size, expected_sha256).await?;
        if tokio::fs::try_exists(final_path).await? {
            tokio::fs::remove_file(final_path).await?;
        }
        tokio::fs::rename(partial_path, final_path).await?;
        match Self::finalize_downloaded_file_with_digest(
            sidecar_root,
            relative_path,
            final_path,
            digest,
            false,
        )
        .await
        {
            Ok(downloaded) => Ok(downloaded),
            Err(error) => {
                let _ = tokio::fs::rename(final_path, partial_path).await;
                Err(Self::downloaded_file_error(error))
            }
        }
    }

    async fn verified_file_digest(
        local_path: &Path,
        expected_size: i64,
        expected_sha256: &str,
    ) -> Result<FileDigest, CoreError> {
        if expected_size < 1 {
            return Err(CoreError::DataIntegrity(
                "BOOK_FILE_EXPECTED_SIZE_INVALID".into(),
            ));
        }
        if !is_sha256(expected_sha256) {
            return Err(CoreError::DataIntegrity(
                "BOOK_FILE_EXPECTED_SHA256_INVALID".into(),
            ));
        }
        let digest = Self::sha256_file(local_path)
            .await
            .map_err(|error| CoreError::Storage(format!("DOWNLOADED_FILE_NOT_FOUND: {error}")))?;
        if digest.size != expected_size {
            return Err(CoreError::DataIntegrity(format!(
                "BOOK_FILE_SIZE_MISMATCH: expected={expected_size}, actual={}",
                digest.size
            )));
        }
        if digest.sha256 != expected_sha256 {
            return Err(CoreError::DataIntegrity("BOOK_FILE_SHA256_MISMATCH".into()));
        }
        Ok(digest)
    }

    async fn finalize_downloaded_file_with_digest(
        sidecar_root: &Path,
        relative_path: &str,
        local_path: &Path,
        digest: FileDigest,
        preserve_pending_remote_state: bool,
    ) -> Result<DownloadedFile, CoreError> {
        let relative_path = crate::infrastructure::storage::normalize_remote_path(relative_path)?;
        if relative_path.is_empty() {
            return Err(CoreError::Config("BOOK_FILE_PATH_REQUIRED".into()));
        }
        let metadata = tokio::fs::metadata(local_path).await?;
        if !metadata.is_file() || metadata.len() == 0 {
            return Err(CoreError::Storage("DOWNLOADED_FILE_EMPTY".into()));
        }
        let size = i64::try_from(metadata.len())
            .map_err(|error| CoreError::Storage(format!("DOWNLOADED_FILE_TOO_LARGE: {error}")))?;
        if size != digest.size {
            return Err(CoreError::DataIntegrity(
                "DOWNLOADED_FILE_CHANGED_DURING_VALIDATION".into(),
            ));
        }
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .and_then(|value| i64::try_from(value.as_millis()).ok())
            .unwrap_or(0);
        let update = FileStateUpdate {
            local_state: "present".into(),
            local_sha256: Some(digest.sha256.clone()),
            local_size: Some(size),
            local_mtime: Some(mtime_ms),
        };
        if preserve_pending_remote_state {
            let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
            ContentRepository::new(&db)
                .upsert_reconciled_file_state(&relative_path, update)
                .await?;
        } else {
            Self::upsert_file_state(sidecar_root, &relative_path, update).await?;
        }
        Ok(DownloadedFile {
            size,
            sha256: digest.sha256,
            mtime_ms,
        })
    }

    fn downloaded_file_error(error: CoreError) -> CoreError {
        match error {
            CoreError::Io(error) => {
                CoreError::Storage(format!("DOWNLOADED_FILE_NOT_FOUND: {error}"))
            }
            error => error,
        }
    }

    pub async fn mark_file_remote_only(
        sidecar_root: &Path,
        relative_path: &str,
    ) -> Result<(), CoreError> {
        let relative_path = crate::infrastructure::storage::normalize_remote_path(relative_path)?;
        if relative_path.is_empty() {
            return Err(CoreError::Config("BOOK_FILE_PATH_REQUIRED".into()));
        }
        Self::upsert_file_state(
            sidecar_root,
            &relative_path,
            FileStateUpdate {
                local_state: "remote_only".into(),
                local_sha256: None,
                local_size: None,
                local_mtime: None,
            },
        )
        .await
    }

    pub async fn mark_file_source_missing(
        sidecar_root: &Path,
        relative_path: &str,
    ) -> Result<(), CoreError> {
        Self::upsert_remote_state(sidecar_root, relative_path, "source_missing").await
    }

    pub(crate) async fn mark_file_remote_delete_pending(
        sidecar_root: &Path,
        relative_path: &str,
    ) -> Result<(), CoreError> {
        Self::upsert_remote_state(sidecar_root, relative_path, "remote_delete_pending").await
    }

    async fn upsert_remote_state(
        sidecar_root: &Path,
        relative_path: &str,
        state: &str,
    ) -> Result<(), CoreError> {
        let relative_path = crate::infrastructure::storage::normalize_remote_path(relative_path)?;
        if relative_path.is_empty() {
            return Err(CoreError::Config("BOOK_FILE_PATH_REQUIRED".into()));
        }
        Self::upsert_file_state(
            sidecar_root,
            &relative_path,
            FileStateUpdate {
                local_state: state.into(),
                local_sha256: None,
                local_size: None,
                local_mtime: None,
            },
        )
        .await
    }

    pub(crate) async fn retry_remote_deletes(
        sidecar_root: &Path,
        operator: &Operator,
    ) -> Result<(), CoreError> {
        for state in Self::list_file_states(sidecar_root)
            .await?
            .into_iter()
            .filter(|state| state.local_state == "remote_delete_pending")
        {
            operator
                .delete(&state.path)
                .await
                .map_err(crate::infrastructure::storage::storage_error)?;
            Self::delete_file_state(sidecar_root, &state.path).await?;
        }
        Ok(())
    }

    pub(crate) async fn reconcile_myreader_catalog(
        sidecar_root: &Path,
        content_root: &Path,
        books: &[CatalogBookValue],
    ) -> Result<(), CoreError> {
        let existing = Self::get_file_states(
            sidecar_root,
            &books
                .iter()
                .map(catalog_book_relative_path)
                .collect::<Vec<_>>(),
        )
        .await?;
        for book in books {
            let relative_path = catalog_book_relative_path(book);
            let local_path = content_root.join(&relative_path);
            let current_state = existing
                .get(&relative_path)
                .map(|state| state.local_state.as_str());
            if book.deleted {
                match tokio::fs::remove_dir_all(content_root.join(&book.path)).await {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error.into()),
                }
                Self::delete_file_state(sidecar_root, &relative_path).await?;
                continue;
            }

            if current_state == Some("remote_delete_pending") {
                continue;
            }
            if !local_path.is_file() {
                Self::reconcile_missing_catalog_file(sidecar_root, &relative_path).await?;
                continue;
            }

            if current_state == Some("dirty_push") {
                continue;
            }
            let digest = match Self::sha256_file(&local_path).await {
                Ok(digest) => digest,
                Err(CoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                    Self::reconcile_missing_catalog_file(sidecar_root, &relative_path).await?;
                    continue;
                }
                Err(error) => return Err(error),
            };
            if digest.size != book.size || digest.sha256 != book.sha256 {
                match tokio::fs::remove_file(&local_path).await {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error.into()),
                }
                Self::reconcile_missing_catalog_file(sidecar_root, &relative_path).await?;
                continue;
            }

            let latest_state = Self::get_file_state(sidecar_root, &relative_path).await?;
            if latest_state.as_ref().is_some_and(|state| {
                matches!(
                    state.local_state.as_str(),
                    "dirty_push" | "remote_delete_pending"
                )
            }) {
                continue;
            }
            match Self::finalize_downloaded_file_with_digest(
                sidecar_root,
                &relative_path,
                &local_path,
                digest,
                true,
            )
            .await
            {
                Ok(_) => {}
                Err(CoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                    Self::reconcile_missing_catalog_file(sidecar_root, &relative_path).await?;
                }
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }

    async fn reconcile_missing_catalog_file(
        sidecar_root: &Path,
        relative_path: &str,
    ) -> Result<(), CoreError> {
        match Self::get_file_state(sidecar_root, relative_path)
            .await?
            .as_ref()
            .map(|state| state.local_state.as_str())
        {
            Some("source_missing" | "remote_delete_pending") => Ok(()),
            Some("dirty_push") => Self::mark_file_source_missing(sidecar_root, relative_path).await,
            _ => Self::mark_file_remote_only(sidecar_root, relative_path).await,
        }
    }

    pub fn resolve_remote_file_path(
        source_path: Option<&str>,
        relative_path: &str,
    ) -> Result<String, CoreError> {
        crate::infrastructure::storage::join_remote_path(
            source_path.unwrap_or_default(),
            relative_path,
        )
    }

    pub async fn list_cover_thumbnail_cache(
        sidecar_root: &Path,
        thumbnail_version: &str,
        width_px: i64,
        height_px: i64,
    ) -> Result<Vec<BookCoverThumbnailCache>, CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .list_cover_thumbnail_cache(thumbnail_version, width_px, height_px)
            .await
    }

    pub async fn upsert_cover_thumbnail_cache(
        sidecar_root: &Path,
        patch: BookCoverThumbnailCachePatch,
    ) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .upsert_cover_thumbnail_cache(patch)
            .await
    }

    pub async fn delete_cover_thumbnail_cache(
        sidecar_root: &Path,
        book_id: i64,
        thumbnail_version: &str,
        width_px: i64,
        height_px: i64,
    ) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .delete_cover_thumbnail_cache(book_id, thumbnail_version, width_px, height_px)
            .await
    }

    pub async fn clear_cover_thumbnail_cache(sidecar_root: &Path) -> Result<(), CoreError> {
        let db = database::open_db(&sidecar_root.to_string_lossy()).await?;
        ContentRepository::new(&db)
            .clear_cover_thumbnail_cache()
            .await
    }
}

fn catalog_book_relative_path(book: &CatalogBookValue) -> String {
    crate::models::catalog::myreader_book_relative_path(&book.path, &book.name, &book.format)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::Path;

    use sea_orm::{ActiveModelTrait, ConnectionTrait, Database, Schema, Set};

    use crate::entities::calibre::{books, data};
    use crate::models::{BookCoverThumbnailCachePatch, FileStateUpdate};
    use crate::sync::document::CatalogBookValue;

    async fn seed_catalog(root: &Path) {
        let db = Database::connect(format!(
            "sqlite://{}?mode=rwc",
            root.join("metadata.db").display()
        ))
        .await
        .unwrap();
        let schema = Schema::new(db.get_database_backend());
        for statement in [
            schema.create_table_from_entity(books::Entity),
            schema.create_table_from_entity(data::Entity),
        ] {
            db.execute(&statement).await.unwrap();
        }
        books::ActiveModel {
            id: Set(42),
            title: Set(Some("The Dispossessed".into())),
            path: Set(Some("Ursula K. Le Guin/The Dispossessed".into())),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();
        for (id, format) in [(1, "EPUB"), (2, "PDF")] {
            data::ActiveModel {
                id: Set(id),
                book: Set(42),
                format: Set(format.into()),
                uncompressed_size: Set(100),
                name: Set("The Dispossessed".into()),
            }
            .insert(&db)
            .await
            .unwrap();
        }
    }

    #[tokio::test]
    async fn should_validate_and_list_reading_format_when_book_has_multiple_formats() {
        let sidecar = tempfile::tempdir().unwrap();
        let library = tempfile::tempdir().unwrap();
        seed_catalog(library.path()).await;

        super::ContentService::set_reading_format(sidecar.path(), library.path(), 42, Some("pdf"))
            .await
            .unwrap();

        assert_eq!(
            super::ContentService::list_reading_formats(sidecar.path(), library.path())
                .await
                .unwrap(),
            BTreeMap::from([("42".into(), "PDF".into())])
        );
    }

    #[tokio::test]
    async fn should_round_trip_file_state_when_download_state_changes() {
        let sidecar = tempfile::tempdir().unwrap();
        let path = "Ursula K. Le Guin/The Dispossessed/The Dispossessed.epub";

        super::ContentService::upsert_file_state(
            sidecar.path(),
            path,
            FileStateUpdate {
                local_state: "present".into(),
                local_sha256: Some("ab".repeat(32)),
                local_size: Some(1024),
                local_mtime: Some(1000),
            },
        )
        .await
        .unwrap();

        let state = super::ContentService::get_file_state(sidecar.path(), path)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(state.local_state, "present");
        assert_eq!(state.local_size, Some(1024));

        super::ContentService::delete_file_state(sidecar.path(), path)
            .await
            .unwrap();
        assert!(super::ContentService::get_file_state(sidecar.path(), path)
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn should_commit_present_state_when_downloaded_file_is_finalized() {
        let sidecar = tempfile::tempdir().unwrap();
        let files = tempfile::tempdir().unwrap();
        let local_path = files.path().join("book.epub");
        tokio::fs::write(&local_path, b"epub").await.unwrap();

        let downloaded = super::ContentService::finalize_downloaded_file(
            sidecar.path(),
            "/Author/Book/book.epub",
            &local_path,
        )
        .await
        .unwrap();

        assert_eq!(downloaded.size, 4);
        assert_eq!(downloaded.sha256.len(), 64);
        let state = super::ContentService::get_file_state(sidecar.path(), "Author/Book/book.epub")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(state.local_state, "present");
        assert_eq!(state.local_size, Some(4));
        assert_eq!(state.local_sha256, Some(downloaded.sha256));
    }

    #[tokio::test]
    async fn should_reject_downloaded_file_when_catalog_sha256_does_not_match() {
        let sidecar = tempfile::tempdir().unwrap();
        let files = tempfile::tempdir().unwrap();
        let local_path = files.path().join("book.epub");
        tokio::fs::write(&local_path, b"epub").await.unwrap();

        let error = super::ContentService::finalize_verified_downloaded_file(
            sidecar.path(),
            "Books/book/book.epub",
            &local_path,
            4,
            &"ab".repeat(32),
        )
        .await
        .unwrap_err();

        assert!(error.to_string().contains("BOOK_FILE_SHA256_MISMATCH"));
        assert!(
            super::ContentService::get_file_state(sidecar.path(), "Books/book/book.epub")
                .await
                .unwrap()
                .is_none()
        );
    }

    #[tokio::test]
    async fn should_install_download_only_after_catalog_digest_matches() {
        let sidecar = tempfile::tempdir().unwrap();
        let files = tempfile::tempdir().unwrap();
        let partial_path = files.path().join("book.epub.part");
        let final_path = files.path().join("book.epub");
        tokio::fs::write(&partial_path, b"epub").await.unwrap();
        tokio::fs::write(&final_path, b"old").await.unwrap();

        let mismatch = super::ContentService::install_verified_downloaded_file(
            sidecar.path(),
            "Books/book/book.epub",
            &partial_path,
            &final_path,
            4,
            &"ab".repeat(32),
        )
        .await
        .unwrap_err();

        assert!(mismatch.to_string().contains("BOOK_FILE_SHA256_MISMATCH"));
        assert_eq!(tokio::fs::read(&final_path).await.unwrap(), b"old");

        let digest = super::ContentService::sha256_file(&partial_path)
            .await
            .unwrap();
        let downloaded = super::ContentService::install_verified_downloaded_file(
            sidecar.path(),
            "Books/book/book.epub",
            &partial_path,
            &final_path,
            digest.size,
            &digest.sha256,
        )
        .await
        .unwrap();

        assert_eq!(downloaded.sha256, digest.sha256);
        assert!(!partial_path.exists());
        assert_eq!(tokio::fs::read(&final_path).await.unwrap(), b"epub");
        assert_eq!(
            super::ContentService::get_file_state(sidecar.path(), "Books/book/book.epub")
                .await
                .unwrap()
                .unwrap()
                .local_state,
            "present"
        );
    }

    #[tokio::test]
    async fn should_commit_remote_only_state_when_local_file_is_removed() {
        let sidecar = tempfile::tempdir().unwrap();
        super::ContentService::mark_file_remote_only(sidecar.path(), "Author/Book/book.epub")
            .await
            .unwrap();

        let state = super::ContentService::get_file_state(sidecar.path(), "Author/Book/book.epub")
            .await
            .unwrap()
            .unwrap();

        assert_eq!(state.local_state, "remote_only");
        assert_eq!(state.local_size, None);
    }

    #[tokio::test]
    async fn should_preserve_remote_delete_when_stale_catalog_still_contains_book() {
        let library = tempfile::tempdir().unwrap();
        let book_uuid = "22222222-3333-4444-8555-666666666666";
        let relative_path = format!("Books/{book_uuid}/The Dispossessed.epub");
        let local_path = library.path().join(&relative_path);
        tokio::fs::create_dir_all(local_path.parent().unwrap())
            .await
            .unwrap();
        tokio::fs::write(&local_path, b"epub").await.unwrap();
        let digest = super::ContentService::sha256_file(&local_path)
            .await
            .unwrap();
        super::ContentService::mark_file_remote_delete_pending(library.path(), &relative_path)
            .await
            .unwrap();

        super::ContentService::reconcile_myreader_catalog(
            library.path(),
            library.path(),
            &[CatalogBookValue {
                uuid: book_uuid.into(),
                book_id: 42,
                title: "The Dispossessed".into(),
                authors: vec!["Ursula K. Le Guin".into()],
                path: format!("Books/{book_uuid}"),
                name: "The Dispossessed".into(),
                format: "EPUB".into(),
                size: digest.size,
                sha256: digest.sha256.clone(),
                has_cover: false,
                timestamp: "2026-08-05T00:00:00Z".into(),
                last_modified: "2026-08-05T00:00:00Z".into(),
                deleted: false,
            }],
        )
        .await
        .unwrap();

        let state = super::ContentService::get_file_state(library.path(), &relative_path)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(state.local_state, "remote_delete_pending");

        super::ContentService::finalize_downloaded_file_with_digest(
            library.path(),
            &relative_path,
            &local_path,
            digest,
            true,
        )
        .await
        .unwrap();
        let state = super::ContentService::get_file_state(library.path(), &relative_path)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(state.local_state, "remote_delete_pending");
    }

    #[tokio::test]
    async fn should_replace_cover_manifest_values_when_cache_key_matches() {
        let sidecar = tempfile::tempdir().unwrap();
        let patch = BookCoverThumbnailCachePatch {
            book_id: 42,
            cover_identity: "cover-v1".into(),
            thumbnail_version: "v3".into(),
            width_px: 180,
            height_px: 270,
            file_name: "old.jpg".into(),
            file_size_bytes: 1024,
        };

        super::ContentService::upsert_cover_thumbnail_cache(sidecar.path(), patch)
            .await
            .unwrap();
        super::ContentService::upsert_cover_thumbnail_cache(
            sidecar.path(),
            BookCoverThumbnailCachePatch {
                book_id: 42,
                cover_identity: "cover-v2".into(),
                thumbnail_version: "v3".into(),
                width_px: 180,
                height_px: 270,
                file_name: "new.jpg".into(),
                file_size_bytes: 2048,
            },
        )
        .await
        .unwrap();

        let rows =
            super::ContentService::list_cover_thumbnail_cache(sidecar.path(), "v3", 180, 270)
                .await
                .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].cover_identity, "cover-v2");
        assert_eq!(rows[0].file_name, "new.jpg");
        assert_eq!(rows[0].file_size_bytes, 2048);
    }

    #[tokio::test]
    async fn should_remove_only_selected_cover_manifest_when_cache_entry_is_deleted() {
        let sidecar = tempfile::tempdir().unwrap();
        for book_id in [42, 43] {
            super::ContentService::upsert_cover_thumbnail_cache(
                sidecar.path(),
                BookCoverThumbnailCachePatch {
                    book_id,
                    cover_identity: format!("cover-{book_id}"),
                    thumbnail_version: "v3".into(),
                    width_px: 180,
                    height_px: 270,
                    file_name: format!("{book_id}.jpg"),
                    file_size_bytes: 1024,
                },
            )
            .await
            .unwrap();
        }

        super::ContentService::delete_cover_thumbnail_cache(sidecar.path(), 42, "v3", 180, 270)
            .await
            .unwrap();

        let rows =
            super::ContentService::list_cover_thumbnail_cache(sidecar.path(), "v3", 180, 270)
                .await
                .unwrap();
        assert_eq!(
            rows.into_iter().map(|row| row.book_id).collect::<Vec<_>>(),
            vec![43]
        );
    }
}
