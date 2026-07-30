use crate::cache;
use crate::commands::PreparedBookSource;
use crate::error::AppError;
use crate::models::AppConfig;
use crate::reader_ui_prefs::ReaderUiPreferences;
use crate::utils::paths::compute_book_relative_path;

use std::path::Path;

pub struct ReaderService;

impl ReaderService {
    pub fn write_epub_readium_manifest(
        dir_path: &str,
        manifest: &serde_json::Value,
    ) -> Result<(), AppError> {
        cache::ensure_reader_cache_dirs()?;
        let root = cache::reader_cache_extracted_root();
        let desired = std::path::PathBuf::from(dir_path);
        let root_canon = dunce::canonicalize(&root)
            .map_err(|e| AppError::Config(format!("INVALID_READER_CACHE_ROOT: {}", e)))?;
        let dir_canon = dunce::canonicalize(&desired)
            .map_err(|e| AppError::Config(format!("INVALID_EXTRACT_DIR: {}", e)))?;
        if !dir_canon.starts_with(&root_canon) {
            return Err(AppError::Config(
                "PATH_TRAVERSAL_BLOCKED: path is outside reader cache directory".into(),
            ));
        }
        let out = dir_canon.join("manifest.json");
        let file = std::fs::File::create(&out)?;
        serde_json::to_writer_pretty(file, manifest)?;
        Ok(())
    }

    pub async fn prepare_book_source(
        lib_id: &str,
        lib_path: &str,
        sidecar_root: Option<&Path>,
        is_remote: bool,
        book_id: i64,
        format: &str,
    ) -> Result<PreparedBookSource, AppError> {
        cache::ensure_reader_cache_dirs()?;
        let file_path = my_reader_core::api::catalog::CatalogService::get_book_file_path(
            Path::new(lib_path),
            book_id,
            format,
        )
        .await?
        .ok_or_else(|| {
            AppError::NotFound(format!(
                "BOOK_FORMAT_NOT_FOUND: book={book_id}, format={format}"
            ))
        })?;

        if is_remote {
            let relative_path = compute_book_relative_path(&file_path, Path::new(lib_path))?;
            if !Self::remote_book_file_available(&file_path, sidecar_root, &relative_path).await? {
                return Err(AppError::NotFound(format!(
                    "BOOK_FORMAT_NOT_DOWNLOADED: book={book_id}, format={format}"
                )));
            }
        }

        let format_upper = format.to_uppercase();
        if format_upper == "EPUB" || format_upper == "CBZ" {
            let cache_key = cache::build_archive_cache_key(lib_id, book_id, &format_upper);
            let extracted_dir = cache::reader_cache_extracted_root().join(&cache_key);

            if extracted_dir.exists() {
                std::fs::remove_dir_all(&extracted_dir)?;
            }
            std::fs::create_dir_all(&extracted_dir)?;
            let entries = cache::extract_zip_to_dir(&file_path, &extracted_dir)?;

            Ok(PreparedBookSource {
                format: format_upper,
                file_path: file_path.to_string_lossy().to_string(),
                extracted_dir_path: Some(extracted_dir.to_string_lossy().to_string()),
                extracted_entries: entries,
                streamer_url: None,
            })
        } else {
            Ok(PreparedBookSource {
                format: format_upper,
                file_path: file_path.to_string_lossy().to_string(),
                extracted_dir_path: None,
                extracted_entries: Vec::new(),
                streamer_url: None,
            })
        }
    }

    async fn remote_book_file_available(
        file_path: &Path,
        sidecar_root: Option<&Path>,
        relative_path: &str,
    ) -> Result<bool, AppError> {
        if !tokio::fs::try_exists(file_path).await.unwrap_or(false) {
            return Ok(false);
        }

        let Some(sidecar_root) = sidecar_root else {
            return Ok(true);
        };

        let row = my_reader_core::api::content::ContentService::get_file_state(
            sidecar_root,
            relative_path,
        )
        .await?;
        Ok(row.is_some_and(|r| r.is_locally_available()))
    }

    pub fn get_reader_ui_preferences(config: &AppConfig) -> ReaderUiPreferences {
        config.reader_ui.clone()
    }

    pub fn set_reader_ui_preferences(config: &mut AppConfig, prefs: ReaderUiPreferences) {
        config.reader_ui = prefs;
    }

    pub async fn close_streamer(
        streamer_state: &crate::streamer::StreamerState,
        library_id: &str,
        book_id: i64,
    ) {
        let session_key = format!("{}-{}", cache::sanitize_key_part(library_id), book_id);
        let mut streamers = streamer_state.write().await;
        if let Some(mut streamer) = streamers.remove(&session_key) {
            streamer.shutdown();
        }
    }
}

#[cfg(test)]
mod tests {
    use my_reader_core::models::FileStateUpdate;

    use super::ReaderService;

    #[tokio::test]
    async fn should_report_remote_book_available_when_file_and_local_state_are_available() {
        let book_dir = tempfile::tempdir().unwrap();
        let file_path = book_dir.path().join("It.epub");
        tokio::fs::write(&file_path, b"partial").await.unwrap();
        let sidecar_root = tempfile::tempdir().unwrap();

        assert!(!ReaderService::remote_book_file_available(
            &file_path,
            Some(sidecar_root.path()),
            "It.epub",
        )
        .await
        .expect("state check should succeed"));

        my_reader_core::api::content::ContentService::upsert_file_state(
            sidecar_root.path(),
            "It.epub",
            FileStateUpdate {
                local_state: "remote_only".into(),
                local_blake3: None,
                local_size: None,
                local_mtime: None,
            },
        )
        .await
        .expect("upsert remote_only state");
        assert!(!ReaderService::remote_book_file_available(
            &file_path,
            Some(sidecar_root.path()),
            "It.epub",
        )
        .await
        .expect("state check should succeed"));

        my_reader_core::api::content::ContentService::upsert_file_state(
            sidecar_root.path(),
            "It.epub",
            FileStateUpdate {
                local_state: "local_only".into(),
                local_blake3: None,
                local_size: Some(7),
                local_mtime: None,
            },
        )
        .await
        .expect("upsert local_only state");
        assert!(ReaderService::remote_book_file_available(
            &file_path,
            Some(sidecar_root.path()),
            "It.epub",
        )
        .await
        .expect("state check should succeed"));
    }
}
