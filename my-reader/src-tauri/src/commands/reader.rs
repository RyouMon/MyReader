use super::*;

#[tauri::command]
#[specta::specta]
pub fn write_epub_readium_manifest(
    dir_path: String,
    manifest: JsonAny,
) -> Result<(), AppError> {
    ensure_reader_cache_dirs()?;
    let root = reader_cache_extracted_root();
    let desired = PathBuf::from(&dir_path);
    let root_canon = root
        .canonicalize()
        .map_err(|e| AppError::Config(format!("INVALID_READER_CACHE_ROOT: {}", e)))?;
    let dir_canon = desired
        .canonicalize()
        .map_err(|e| AppError::Config(format!("INVALID_EXTRACT_DIR: {}", e)))?;
    if !dir_canon.starts_with(&root_canon) {
        return Err(AppError::Config(
            "PATH_TRAVERSAL_BLOCKED: path is outside reader cache directory".into(),
        ));
    }
    let out = dir_canon.join("manifest.json");
    let file = fs::File::create(&out)?;
    serde_json::to_writer_pretty(file, &manifest.0)
        .map_err(|e| AppError::Serialize(e.to_string()))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
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
            .ok_or_else(|| AppError::NotFound("NO_ACTIVE_LIBRARY".into()))?;
        let lib = config
            .libraries
            .iter()
            .find(|lib| lib.id == lib_id)
            .ok_or_else(|| AppError::NotFound(format!("LIBRARY_NOT_FOUND: {}", lib_id)))?;
        let conn =
            calibre::open_calibre_db(&lib.path).map_err(|e| AppError::Database(e.to_string()))?;
        let file_path = calibre::get_book_file_path(&lib.path, &conn, book_id, &format)
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::NotFound(format!("BOOK_FORMAT_NOT_FOUND: book={}, format={}", book_id, format)))?;
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
                streamer_url: None,
            });
        }
        Ok(PreparedBookSource {
            format: format_upper,
            file_path: file_path.to_string_lossy().to_string(),
            extracted_dir_path: None,
            extracted_entries: Vec::new(),
            streamer_url: None,
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
#[specta::specta]
pub async fn close_book_streamer(
    streamer_state: State<'_, StreamerState>,
    library_id: String,
    book_id: i64,
) -> Result<(), AppError> {
    let session_key = format!("{}-{}", sanitize_key_part(&library_id), book_id);
    let mut streamers = streamer_state.write().await;
    if let Some(mut streamer) = streamers.remove(&session_key) {
        streamer.shutdown();
        info!("Closed EPUB streamer for library: {}, book: {}", library_id, book_id);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
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
#[specta::specta]
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
