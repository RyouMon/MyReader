use super::*;

#[tauri::command]
#[specta::specta]
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

/// 新建本地目录数据源时的入参。
#[tauri::command]
#[specta::specta]
pub fn add_library(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: Option<String>,
) -> Result<LibraryInfo, AppError> {
    info!("Start to add library. path: \"{path}\", requested name: {name:?}");
    let result = (|| {
        let canon_path = dunce::canonicalize(&path)
            .map_err(|e| AppError::Config(format!("INVALID_LIBRARY_PATH: {e}")))?;
        let canon_str = canon_path.to_string_lossy().to_string();
        let path_for_result = canon_str.clone();

        if !calibre::validate_calibre_library(&canon_str) {
            return Err(AppError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                canon_str
            )));
        }

        let lib_name = name.unwrap_or_else(|| {
            canon_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unnamed Library")
                .to_string()
        });

        let id = uuid::Uuid::new_v4().to_string();

        reading_progress::ensure_library_data_dir(&canon_str)?;

        let book_count = calibre::open_calibre_db(&canon_str)
            .and_then(|conn| calibre::get_book_count(&conn))
            .unwrap_or(0);

        let lib_config = LibraryConfig {
            id: id.clone(),
            name: lib_name.clone(),
            path: canon_str.clone(),
        };

        let mut config = state.lock().unwrap();

        if config.libraries.iter().any(|l| l.path == canon_str) {
            return Err(AppError::Config("LIBRARY_ALREADY_EXISTS".into()));
        }

        config.libraries.push(lib_config);
        if config.active_library_id.is_none() {
            config.active_library_id = Some(id.clone());
        }
        save_config(&app, &config)?;

        // Avoid deadlock: scope sync also reads AppState and must run after releasing this lock.
        drop(config);
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
#[specta::specta]
pub fn refresh_library(
    state: State<'_, AppState>,
    id: String,
) -> Result<LibraryInfo, AppError> {
    info!("Start to refresh library. id: \"{id}\"");
    let result = (|| {
        let config = state.lock().unwrap();
        let lib = config
            .libraries
            .iter()
            .find(|l| l.id == id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {id}")))?;
        let lib_path = lib.path.clone();
        drop(config);

        let lib_path_canon = dunce::canonicalize(&lib_path)
            .map_err(|e| AppError::Config(format!("INVALID_LIBRARY_PATH: {e}")))?;
        let lib_path_str = lib_path_canon.to_string_lossy().to_string();

        if !calibre::validate_calibre_library(&lib_path_str) {
            return Err(AppError::NotFound(format!(
                "METADATA_DB_NOT_FOUND: {}",
                lib_path_str
            )));
        }

        let conn = calibre::open_calibre_db(&lib_path_str)
            .map_err(|e| AppError::Database(e.to_string()))?;
        let books = calibre::get_all_books(&conn).map_err(|e| AppError::Database(e.to_string()))?;
        let book_count = books.len();
        let book_ids: Vec<i64> = books.iter().map(|book| book.id).collect();

        clear_orphaned_library_cache_files(&id, &book_ids)?;

        let lib_name = lib_path_canon
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unnamed Library")
            .to_string();

        Ok(LibraryInfo {
            id: id.clone(),
            name: lib_name,
            path: lib_path_str,
            book_count,
        })
    })();

    match &result {
        Ok(info_item) => info!(
            "Success to refresh library. id: \"{}\", name: \"{}\", book count: {}",
            info_item.id, info_item.name, info_item.book_count
        ),
        Err(err) => error!("Failed to refresh library. id: \"{id}\", error: {err}"),
    }

    result
}

#[tauri::command]
#[specta::specta]
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
#[specta::specta]
pub fn switch_library(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    info!("Start to switch active library. id: \"{id}\"");
    let result = (|| {
        let mut config = state.lock().unwrap();
        if !config.libraries.iter().any(|lib| lib.id == id) {
            return Err(AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", id)));
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
#[specta::specta]
pub fn get_active_library_id(state: State<'_, AppState>) -> Option<String> {
    info!("Start to get active library id.");
    let result = state.lock().unwrap().active_library_id.clone();
    info!("Success to get active library id. active library id: {result:?}");
    result
}

