use crate::commands::PreparedBookSource;
use crate::error::AppError;
use crate::models::AppConfig;
use crate::reader_ui_prefs::ReaderUiPreferences;
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};
use crate::cache;

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

    pub fn prepare_book_source(
        lib_id: &str,
        lib_path: &str,
        book_id: i64,
        format: &str,
    ) -> Result<PreparedBookSource, AppError> {
        cache::ensure_reader_cache_dirs()?;
        let repo = CalibreBookRepository::open(lib_path)?;
        let file_path = repo
            .get_book_file_path(lib_path, book_id, format)?
            .ok_or_else(|| {
                AppError::NotFound(format!(
                    "BOOK_FORMAT_NOT_FOUND: book={book_id}, format={format}"
                ))
            })?;

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

    pub fn get_reader_ui_preferences(config: &AppConfig) -> ReaderUiPreferences {
        config.reader_ui.clone()
    }

    pub fn set_reader_ui_preferences(config: &mut AppConfig, prefs: ReaderUiPreferences) {
        config.reader_ui = prefs;
    }
}
