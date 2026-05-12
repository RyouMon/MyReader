use crate::error::AppError;
use crate::models::{AppConfig, LibraryConfig, LibraryInfo};
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};
use crate::cache;
use crate::db;

pub struct LibraryService;

impl LibraryService {
    pub fn list_libraries(config: &AppConfig) -> Result<Vec<LibraryInfo>, AppError> {
        let mut infos = Vec::new();
        for lib in &config.libraries {
            let book_count = CalibreBookRepository::open(&lib.path)
                .and_then(|repo| repo.get_book_count())
                .unwrap_or(0);
            infos.push(LibraryInfo {
                id: lib.id.clone(),
                name: lib.name.clone(),
                path: lib.path.clone(),
                book_count,
            });
        }
        Ok(infos)
    }

    pub fn add_library(
        path: &str,
        name: Option<&str>,
        config: &mut AppConfig,
    ) -> Result<LibraryInfo, AppError> {
        let canon_path = dunce::canonicalize(path)
            .map_err(|e| AppError::Config(format!("INVALID_LIBRARY_PATH: {e}")))?;
        let canon_str = canon_path.to_string_lossy().to_string();

        if !CalibreBookRepository::validate_library(&canon_str) {
            return Err(AppError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                canon_str
            )));
        }

        let lib_name = name.map(|n| n.to_string()).unwrap_or_else(|| {
            canon_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unnamed Library")
                .to_string()
        });

        if config.libraries.iter().any(|l| l.path == canon_str) {
            return Err(AppError::Config("LIBRARY_ALREADY_EXISTS".into()));
        }

        let id = uuid::Uuid::new_v4().to_string();

        db::ensure_library_data_dir(&canon_str)?;

        let book_count = CalibreBookRepository::open(&canon_str)
            .and_then(|repo| repo.get_book_count())
            .unwrap_or(0);

        config.libraries.push(LibraryConfig {
            id: id.clone(),
            name: lib_name.clone(),
            path: canon_str.clone(),
        });
        if config.active_library_id.is_none() {
            config.active_library_id = Some(id.clone());
        }

        Ok(LibraryInfo {
            id,
            name: lib_name,
            path: canon_str,
            book_count,
        })
    }

    pub fn refresh_library(id: &str, config: &AppConfig) -> Result<LibraryInfo, AppError> {
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", id)))?;
        let lib_path = lib.path.clone();

        let lib_path_canon = dunce::canonicalize(&lib_path)
            .map_err(|e| AppError::Config(format!("INVALID_LIBRARY_PATH: {e}")))?;
        let lib_path_str = lib_path_canon.to_string_lossy().to_string();

        if !CalibreBookRepository::validate_library(&lib_path_str) {
            return Err(AppError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                lib_path_str
            )));
        }

        let repo = CalibreBookRepository::open(&lib_path_str)?;
        let books = repo.get_all_books()?;
        let book_count = books.len();
        let book_ids: Vec<i64> = books.iter().map(|book| book.id).collect();

        cache::clear_orphaned_library_cache_files(id, &book_ids)?;

        let lib_name = lib_path_canon
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unnamed Library")
            .to_string();

        Ok(LibraryInfo {
            id: id.to_string(),
            name: lib_name,
            path: lib_path_str,
            book_count,
        })
    }

    pub fn remove_library(id: &str, config: &mut AppConfig) -> Result<(), AppError> {
        config.libraries.retain(|lib| lib.id != id);
        cache::clear_library_cache_files(id)?;

        if config.active_library_id.as_ref() == Some(&id.to_string()) {
            config.active_library_id = config.libraries.first().map(|lib| lib.id.clone());
        }

        Ok(())
    }

    pub fn switch_library(id: &str, config: &mut AppConfig) -> Result<(), AppError> {
        if !config.libraries.iter().any(|lib| lib.id == id) {
            return Err(AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", id)));
        }
        config.active_library_id = Some(id.to_string());
        Ok(())
    }

    pub fn resolve_library_path(
        library_id: Option<&str>,
        config: &AppConfig,
    ) -> Result<(String, String), AppError> {
        let lib_id = library_id
            .map(|s| s.to_string())
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("NO_ACTIVE_LIBRARY".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", lib_id)))?;

        Ok((lib_id, lib.path.clone()))
    }
}
