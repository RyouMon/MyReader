use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use log::{error, info};
use tauri::{AppHandle, Manager, State};
use zip::ZipArchive;

use crate::calibre;
use crate::error::AppError;
use crate::models::{
    AppConfig, BookAnchor, BookDetail, BookEntry, BookIdentifier, FormatSize, LibraryConfig,
    LibraryInfo, PaginatedBooks, ReadingProgressDto,
};
use crate::reader_ui_prefs::ReaderUiPreferences;
use crate::reading_progress;

pub type AppState = Mutex<AppConfig>;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedBookSource {
    pub format: String,
    pub file_path: String,
    pub extracted_dir_path: Option<String>,
    pub extracted_entries: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheUsageDto {
    pub total_bytes: u64,
    pub max_bytes: u64,
}

fn sanitize_key_part(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn reader_cache_root() -> PathBuf {
    std::env::temp_dir().join("myreader")
}

fn reader_cache_extracted_root() -> PathBuf {
    reader_cache_root().join("extracted")
}

fn ensure_reader_cache_dirs() -> Result<(), AppError> {
    fs::create_dir_all(reader_cache_extracted_root())?;
    Ok(())
}

fn build_archive_cache_key(library_id: &str, book_id: i64, format: &str) -> String {
    format!(
        "{}-{}-{}",
        sanitize_key_part(library_id),
        book_id,
        sanitize_key_part(&format.to_lowercase())
    )
}

fn extract_zip_to_dir(zip_path: &PathBuf, output_dir: &PathBuf) -> Result<Vec<String>, AppError> {
    let file = fs::File::open(zip_path)?;
    let mut archive = ZipArchive::new(file).map_err(|e| AppError::Config(e.to_string()))?;
    let mut extracted_entries: Vec<String> = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| AppError::Config(e.to_string()))?;
        let Some(enclosed) = entry.enclosed_name() else {
            continue;
        };
        let rel_path = enclosed.to_string_lossy().replace('\\', "/");
        let out_path = output_dir.join(enclosed);
        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out_file = fs::File::create(&out_path)?;
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|e| AppError::Config(e.to_string()))?;
        out_file.write_all(&bytes)?;
        extracted_entries.push(rel_path);
    }

    Ok(extracted_entries)
}

fn clear_library_cache_files(library_id: &str) -> Result<(), AppError> {
    let root = reader_cache_extracted_root();
    if !root.exists() {
        return Ok(());
    }
    let prefix = format!("{}-", sanitize_key_part(library_id));
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|x| x.to_str()) else {
            continue;
        };
        if !name.starts_with(&prefix) {
            continue;
        }
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        } else {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

fn collect_cache_files_sorted_oldest() -> Result<Vec<(PathBuf, u64, u128)>, AppError> {
    let mut out: Vec<(PathBuf, u64, u128)> = Vec::new();
    let root = reader_cache_root();
    if !root.exists() {
        return Ok(out);
    }
    let mut stack = vec![root];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            let meta = entry.metadata()?;
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis())
                .unwrap_or(0);
            out.push((path, meta.len(), modified));
        }
    }
    out.sort_by_key(|(_, _, modified)| *modified);
    Ok(out)
}

fn config_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    info!("Start to resolve config file path.");
    let result = (|| {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Config(e.to_string()))?;
        fs::create_dir_all(&dir)?;
        Ok(dir.join("config.json"))
    })();

    match &result {
        Ok(path) => info!(
            "Success to resolve config file path. path: \"{}\"",
            path.display()
        ),
        Err(err) => error!("Failed to resolve config file path. error: {err}"),
    }

    result
}

fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), AppError> {
    info!(
        "Start to save application config. library count: {}, active library id: {:?}",
        config.libraries.len(),
        config.active_library_id
    );
    let result = (|| {
        let path = config_path(app)?;
        let json =
            serde_json::to_string_pretty(config).map_err(|e| AppError::Serialize(e.to_string()))?;
        fs::write(&path, json)?;
        Ok(path)
    })();

    match &result {
        Ok(path) => info!(
            "Success to save application config. path: \"{}\"",
            path.display()
        ),
        Err(err) => error!("Failed to save application config. error: {err}"),
    }

    result.map(|_| ())
}

#[tauri::command]
pub fn list_libraries(state: State<'_, AppState>) -> Result<Vec<LibraryInfo>, AppError> {
    info!("Start to list libraries.");
    let result = (|| {
        let config = state.lock().unwrap();
        let infos: Vec<LibraryInfo> = config
            .libraries
            .iter()
            .map(|lib| {
                let book_count = calibre::open_calibre_db(&lib.path)
                    .and_then(|conn| calibre::get_book_count(&conn))
                    .unwrap_or(0);
                LibraryInfo {
                    id: lib.id.clone(),
                    name: lib.name.clone(),
                    path: lib.path.clone(),
                    book_count,
                }
            })
            .collect();
        Ok(infos)
    })();

    match &result {
        Ok(infos) => info!("Success to list libraries. count: {}", infos.len()),
        Err(err) => error!("Failed to list libraries. error: {err}"),
    }

    result
}

#[tauri::command]
pub fn add_library(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<LibraryInfo, AppError> {
    info!("Start to add library. path: \"{path}\", requested name: {name:?}");
    let result = (|| {
        let path_for_result = path.clone();
        if !calibre::validate_calibre_library(&path) {
            return Err(AppError::NotFound(format!(
                "未在 {} 找到 Calibre 数据库 (metadata.db)",
                path
            )));
        }

        let lib_name = name.unwrap_or_else(|| {
            std::path::Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("未命名书库")
                .to_string()
        });

        let id = uuid::Uuid::new_v4().to_string();

        reading_progress::ensure_library_data_dir(&path)?;

        let book_count = calibre::open_calibre_db(&path)
            .and_then(|conn| calibre::get_book_count(&conn))
            .unwrap_or(0);

        let lib_config = LibraryConfig {
            id: id.clone(),
            name: lib_name.clone(),
            path: path.clone(),
        };

        let mut config = state.lock().unwrap();

        if config.libraries.iter().any(|l| l.path == path) {
            return Err(AppError::Config("该路径已添加过书库".into()));
        }

        config.libraries.push(lib_config);
        if config.active_library_id.is_none() {
            config.active_library_id = Some(id.clone());
        }
        save_config(&app, &config)?;

        if let Err(e) = crate::asset_scope::sync_for_reader_libraries(&app) {
            error!(
                "Failed to extend asset protocol scope after adding library. error: {}",
                e
            );
        }

        Ok(LibraryInfo {
            id,
            name: lib_name,
            path: path_for_result,
            book_count,
        })
    })();

    match &result {
        Ok(info_item) => info!(
            "Success to add library. id: \"{}\", name: \"{}\", book count: {}",
            info_item.id, info_item.name, info_item.book_count
        ),
        Err(err) => error!("Failed to add library. path: \"{path}\", error: {err}"),
    }

    result
}

#[tauri::command]
pub fn remove_library(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to remove library. id: \"{id}\"");
    let result = (|| {
        let mut config = state.lock().unwrap();
        let before_count = config.libraries.len();
        config.libraries.retain(|lib| lib.id != id);
        clear_library_cache_files(&id)?;

        if config.active_library_id.as_ref() == Some(&id) {
            config.active_library_id = config.libraries.first().map(|lib| lib.id.clone());
        }

        save_config(&app, &config)?;
        Ok(before_count.saturating_sub(config.libraries.len()))
    })();

    match &result {
        Ok(removed_count) => {
            info!("Success to remove library. id: \"{id}\", removed count: {removed_count}")
        }
        Err(err) => error!("Failed to remove library. id: \"{id}\", error: {err}"),
    }

    result.map(|_| ())
}

#[tauri::command]
pub fn prepare_book_source(
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<PreparedBookSource, AppError> {
    info!(
        "Start to prepare book source. library id: {:?}, book id: {}, format: \"{}\"",
        library_id, book_id, format
    );
    let result = (|| {
        ensure_reader_cache_dirs()?;
        let config = state.lock().unwrap();
        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;
        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("书库 {} 不存在", lib_id)))?;
        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;
        let file_path = calibre::get_book_file_path(&lib.path, &conn, book_id, &format)
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("书籍 {} 未找到格式 {}", book_id, format)))?;
        let format_upper = format.to_uppercase();
        if format_upper == "EPUB" || format_upper == "CBZ" {
            let cache_key = build_archive_cache_key(&lib.id, book_id, &format_upper);
            let extracted_dir = reader_cache_extracted_root().join(cache_key);
            if extracted_dir.exists() {
                fs::remove_dir_all(&extracted_dir)?;
            }
            fs::create_dir_all(&extracted_dir)?;
            let entries = extract_zip_to_dir(&file_path, &extracted_dir)?;
            return Ok(PreparedBookSource {
                format: format_upper,
                file_path: file_path.to_string_lossy().to_string(),
                extracted_dir_path: Some(extracted_dir.to_string_lossy().to_string()),
                extracted_entries: entries,
            });
        }
        Ok(PreparedBookSource {
            format: format_upper,
            file_path: file_path.to_string_lossy().to_string(),
            extracted_dir_path: None,
            extracted_entries: Vec::new(),
        })
    })();
    match &result {
        Ok(source) => info!(
            "Success to prepare book source. format: \"{}\", has extracted dir: {}, entries: {}",
            source.format,
            source.extracted_dir_path.is_some(),
            source.extracted_entries.len()
        ),
        Err(err) => error!(
            "Failed to prepare book source. library id: {:?}, book id: {}, format: \"{}\", error: {err}",
            library_id, book_id, format
        ),
    }
    result
}

#[tauri::command]
pub fn get_cache_usage(state: State<'_, AppState>) -> Result<CacheUsageDto, AppError> {
    let max_mb = {
        let config = state.lock().unwrap();
        config.reader_ui.cache.max_cache_size_mb
    };
    let files = collect_cache_files_sorted_oldest()?;
    let total_bytes = files.iter().map(|(_, size, _)| *size).sum::<u64>();
    Ok(CacheUsageDto {
        total_bytes,
        max_bytes: (max_mb.max(0) as u64) * 1024 * 1024,
    })
}

#[tauri::command]
pub fn clear_cache() -> Result<(), AppError> {
    let root = reader_cache_root();
    if root.exists() {
        fs::remove_dir_all(&root)?;
    }
    ensure_reader_cache_dirs()?;
    Ok(())
}

#[tauri::command]
pub fn enforce_cache_limit(state: State<'_, AppState>) -> Result<(), AppError> {
    let max_bytes = {
        let config = state.lock().unwrap();
        (config.reader_ui.cache.max_cache_size_mb.max(0) as u64) * 1024 * 1024
    };
    if max_bytes == 0 {
        return clear_cache();
    }
    let files = collect_cache_files_sorted_oldest()?;
    let mut total_bytes = files.iter().map(|(_, size, _)| *size).sum::<u64>();
    if total_bytes <= max_bytes {
        return Ok(());
    }
    for (path, size, _) in files {
        if total_bytes <= max_bytes {
            break;
        }
        if path.exists() {
            fs::remove_file(&path)?;
            total_bytes = total_bytes.saturating_sub(size);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn switch_library(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to switch active library. id: \"{id}\"");
    let result = (|| {
        let mut config = state.lock().unwrap();
        if !config.libraries.iter().any(|lib| lib.id == id) {
            return Err(AppError::NotFound(format!("书库 {} 不存在", id)));
        }
        config.active_library_id = Some(id.clone());
        save_config(&app, &config)?;
        Ok(())
    })();

    match &result {
        Ok(()) => info!("Success to switch active library. id: \"{id}\""),
        Err(err) => error!("Failed to switch active library. id: \"{id}\", error: {err}"),
    }

    result
}

#[tauri::command]
pub fn get_active_library_id(state: State<'_, AppState>) -> Option<String> {
    info!("Start to get active library id.");
    let result = state.lock().unwrap().active_library_id.clone();
    info!("Success to get active library id. active library id: {result:?}");
    result
}

#[tauri::command]
pub fn get_books(
    state: State<'_, AppState>,
    library_id: Option<String>,
) -> Result<Vec<BookEntry>, AppError> {
    info!("Start to get books. library id: {library_id:?}");
    let result = (|| {
        let config = state.lock().unwrap();

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("书库 {} 不存在", lib_id)))?;

        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;

        calibre::get_all_books(&conn).map_err(|e| AppError::Database(e.to_string()))
    })();

    match &result {
        Ok(books) => info!("Success to get books. count: {}", books.len()),
        Err(err) => {
            error!("Failed to get books. requested library id: {library_id:?}, error: {err}")
        }
    }

    result
}

#[tauri::command]
pub fn get_books_page(
    state: State<'_, AppState>,
    library_id: Option<String>,
    offset: usize,
    limit: usize,
    sort_by: Option<String>,
    search: Option<String>,
) -> Result<PaginatedBooks, AppError> {
    info!(
        "Start to get books page. library id: {library_id:?}, offset: {offset}, limit: {limit}, sort by: {sort_by:?}, search: {search:?}"
    );
    let result = (|| {
        let config = state.lock().unwrap();

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("书库 {} 不存在", lib_id)))?;

        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;

        let sort = sort_by.as_deref().unwrap_or("title");
        let limit = limit.clamp(1, 200);
        let (items, total) = calibre::get_books_page(&conn, offset, limit, sort, search.as_deref())
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(PaginatedBooks { items, total })
    })();

    match &result {
        Ok(page) => info!(
            "Success to get books page. returned count: {}, total: {}",
            page.items.len(),
            page.total
        ),
        Err(err) => {
            error!("Failed to get books page. requested library id: {library_id:?}, error: {err}")
        }
    }

    result
}

#[tauri::command]
pub fn get_book_detail(
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
) -> Result<BookDetail, AppError> {
    info!("Start to get book detail. library id: {library_id:?}, book id: {book_id}");
    let result = (|| {
        let config = state.lock().unwrap();

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("书库 {} 不存在", lib_id)))?;

        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;

        let book = calibre::get_book_by_id(&conn, book_id)
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("书籍 {} 不存在", book_id)))?;

        let format_sizes = calibre::get_book_format_sizes(&conn, book_id)
            .map_err(|e| AppError::Database(e.to_string()))?
            .into_iter()
            .map(|(format, size_bytes)| FormatSize { format, size_bytes })
            .collect();

        let identifiers = calibre::get_book_identifiers(&conn, book_id)
            .map_err(|e| AppError::Database(e.to_string()))?
            .into_iter()
            .map(|(id_type, value)| BookIdentifier { id_type, value })
            .collect();

        Ok(BookDetail {
            book,
            format_sizes,
            identifiers,
        })
    })();

    match &result {
        Ok(detail) => info!(
            "Success to get book detail. book id: {}, title: \"{}\", format count: {}, identifier count: {}",
            detail.book.id,
            detail.book.title,
            detail.format_sizes.len(),
            detail.identifiers.len()
        ),
        Err(err) => error!(
            "Failed to get book detail. requested library id: {library_id:?}, book id: {book_id}, error: {err}"
        ),
    }

    result
}

#[tauri::command]
pub fn get_series_books(
    state: State<'_, AppState>,
    library_id: Option<String>,
    series_name: String,
    exclude_book_id: Option<i64>,
) -> Result<Vec<BookEntry>, AppError> {
    info!(
        "Start to get series books. library id: {library_id:?}, series name: \"{}\", exclude book id: {exclude_book_id:?}",
        series_name
    );
    let result = (|| {
        let config = state.lock().unwrap();

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("书库 {} 不存在", lib_id)))?;

        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;

        calibre::get_books_by_series(&conn, &series_name, exclude_book_id)
            .map_err(|e| AppError::Database(e.to_string()))
    })();

    match &result {
        Ok(books) => info!(
            "Success to get series books. series name: \"{}\", count: {}",
            series_name,
            books.len()
        ),
        Err(err) => error!(
            "Failed to get series books. requested library id: {library_id:?}, series name: \"{}\", error: {err}",
            series_name
        ),
    }

    result
}

fn unix_epoch_secs() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

#[tauri::command]
pub fn get_reading_progress(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
) -> Result<Option<ReadingProgressDto>, AppError> {
    info!("Start to get reading progress. library id: {library_id:?}, book id: {book_id}, format: \"{format}\"");
    let result = (|| {
        let config = state.lock().unwrap();

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("书库 {} 不存在", lib_id)))?;

        let conn = reading_progress::open_db(&app, &lib.path, &lib.id)?;
        reading_progress::get_progress(&conn, &lib_id, book_id, &format)
    })();

    match &result {
        Ok(progress) => info!(
            "Success to get reading progress. found: {}, book id: {}, format: \"{}\"",
            progress.is_some(),
            book_id,
            format
        ),
        Err(err) => error!(
            "Failed to get reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    result
}

#[tauri::command]
pub fn set_reading_progress(
    app: AppHandle,
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
    format: String,
    anchor: BookAnchor,
) -> Result<(), AppError> {
    info!(
        "Start to set reading progress. library id: {library_id:?}, book id: {book_id}, format: \"{}\", chapter index: {}, char offset: {:?}",
        format,
        anchor.chapter_index,
        anchor.char_offset
    );
    let result = (|| {
        let config = state.lock().unwrap();

        let lib_id = library_id
            .clone()
            .or_else(|| config.active_library_id.clone())
            .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;

        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("书库 {} 不存在", lib_id)))?;

        let conn = reading_progress::open_db(&app, &lib.path, &lib.id)?;
        let now = unix_epoch_secs();
        reading_progress::set_progress(&conn, &lib_id, book_id, &format, &anchor, now)
    })();

    match &result {
        Ok(()) => info!("Success to set reading progress. book id: {book_id}, format: \"{format}\""),
        Err(err) => error!(
            "Failed to set reading progress. requested library id: {library_id:?}, book id: {book_id}, format: \"{}\", error: {err}",
            format
        ),
    }

    result
}

#[tauri::command]
pub fn get_book_cover(
    state: State<'_, AppState>,
    library_id: String,
    book_path: String,
) -> Result<Option<String>, AppError> {
    info!(
        "Start to get book cover. library id: \"{}\", book path: \"{}\"",
        library_id, book_path
    );
    let result = (|| {
        let config = state.lock().unwrap();
        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == library_id)
            .ok_or_else(|| AppError::NotFound(format!("书库 {} 不存在", library_id)))?;

        match calibre::get_book_cover_path(&lib.path, &book_path) {
            Some(cover_path) => {
                let data = fs::read(&cover_path)?;
                let encoded = BASE64.encode(&data);
                Ok(Some(format!("data:image/jpeg;base64,{}", encoded)))
            }
            None => Ok(None),
        }
    })();

    match &result {
        Ok(data) => info!(
            "Success to get book cover. found: {}, library id: \"{}\", book path: \"{}\"",
            data.is_some(),
            library_id,
            book_path
        ),
        Err(err) => error!(
            "Failed to get book cover. library id: \"{}\", book path: \"{}\", error: {err}",
            library_id, book_path
        ),
    }

    result
}

#[tauri::command]
pub fn get_reader_ui_preferences(
    state: State<'_, AppState>,
) -> Result<ReaderUiPreferences, AppError> {
    info!("Start to get reader UI preferences.");
    let result = Ok(state.lock().unwrap().reader_ui.clone());
    match &result {
        Ok(prefs) => info!(
            "Success to get reader UI preferences. version: {}",
            prefs.version
        ),
        Err(err) => error!("Failed to get reader UI preferences. error: {err}"),
    }
    result
}

#[tauri::command]
pub fn set_reader_ui_preferences(
    app: AppHandle,
    state: State<'_, AppState>,
    prefs: ReaderUiPreferences,
) -> Result<(), AppError> {
    info!(
        "Start to set reader UI preferences. version: {}, theme: \"{}\", font size: {}, fixed layout mode: \"{}\"",
        prefs.version,
        prefs.reflowable.settings.theme,
        prefs.reflowable.settings.font_size,
        prefs.fixed_layout.display_mode
    );
    let result = (|| {
        let mut config = state.lock().unwrap();
        config.reader_ui = prefs;
        save_config(&app, &config)?;
        Ok(())
    })();

    match &result {
        Ok(()) => info!("Success to set reader UI preferences."),
        Err(err) => error!("Failed to set reader UI preferences. error: {err}"),
    }

    result
}
