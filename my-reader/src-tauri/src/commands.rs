use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use tauri::{AppHandle, Manager, State};

use crate::calibre;
use crate::error::AppError;
use crate::models::{
    AppConfig, BookAnchor, BookDetail, BookEntry, BookIdentifier, FormatSize, LibraryConfig,
    LibraryInfo, PaginatedBooks, ReadingProgressDto,
};
use crate::reading_progress;

pub type AppState = Mutex<AppConfig>;

fn config_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Config(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("libraries.json"))
}

fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), AppError> {
    let path = config_path(app)?;
    let json =
        serde_json::to_string_pretty(config).map_err(|e| AppError::Serialize(e.to_string()))?;
    fs::write(path, json)?;
    Ok(())
}

#[tauri::command]
pub fn list_libraries(state: State<'_, AppState>) -> Result<Vec<LibraryInfo>, AppError> {
    let config = state.lock().unwrap();
    let infos = config
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
}

#[tauri::command]
pub fn add_library(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<LibraryInfo, AppError> {
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

    Ok(LibraryInfo {
        id,
        name: lib_name,
        path,
        book_count,
    })
}

#[tauri::command]
pub fn remove_library(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let mut config = state.lock().unwrap();
    config.libraries.retain(|lib| lib.id != id);

    if config.active_library_id.as_ref() == Some(&id) {
        config.active_library_id = config.libraries.first().map(|lib| lib.id.clone());
    }

    save_config(&app, &config)?;
    Ok(())
}

#[tauri::command]
pub fn switch_library(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let mut config = state.lock().unwrap();
    if !config.libraries.iter().any(|lib| lib.id == id) {
        return Err(AppError::NotFound(format!("书库 {} 不存在", id)));
    }
    config.active_library_id = Some(id);
    save_config(&app, &config)?;
    Ok(())
}

#[tauri::command]
pub fn get_active_library_id(state: State<'_, AppState>) -> Option<String> {
    state.lock().unwrap().active_library_id.clone()
}

#[tauri::command]
pub fn get_books(
    state: State<'_, AppState>,
    library_id: Option<String>,
) -> Result<Vec<BookEntry>, AppError> {
    let config = state.lock().unwrap();

    let lib_id = library_id
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
    let config = state.lock().unwrap();

    let lib_id = library_id
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
}

#[tauri::command]
pub fn get_book_detail(
    state: State<'_, AppState>,
    library_id: Option<String>,
    book_id: i64,
) -> Result<BookDetail, AppError> {
    let config = state.lock().unwrap();

    let lib_id = library_id
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
}

#[tauri::command]
pub fn get_series_books(
    state: State<'_, AppState>,
    library_id: Option<String>,
    series_name: String,
    exclude_book_id: Option<i64>,
) -> Result<Vec<BookEntry>, AppError> {
    let config = state.lock().unwrap();

    let lib_id = library_id
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
    let config = state.lock().unwrap();

    let lib_id = library_id
        .or_else(|| config.active_library_id.clone())
        .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;

    if !config.libraries.iter().any(|lib| lib.id == lib_id) {
        return Err(AppError::NotFound(format!("书库 {} 不存在", lib_id)));
    }

    let conn = reading_progress::open_db(&app)?;
    reading_progress::get_progress(&conn, &lib_id, book_id, &format)
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
    let config = state.lock().unwrap();

    let lib_id = library_id
        .or_else(|| config.active_library_id.clone())
        .ok_or_else(|| AppError::NotFound("没有活动的书库".into()))?;

    if !config.libraries.iter().any(|lib| lib.id == lib_id) {
        return Err(AppError::NotFound(format!("书库 {} 不存在", lib_id)));
    }

    let conn = reading_progress::open_db(&app)?;
    let now = unix_epoch_secs();
    reading_progress::set_progress(&conn, &lib_id, book_id, &format, &anchor, now)
}

#[tauri::command]
pub fn get_book_cover(
    state: State<'_, AppState>,
    library_id: String,
    book_path: String,
) -> Result<Option<String>, AppError> {
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
}
