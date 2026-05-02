mod asset_scope;
mod calibre;
pub mod commands;
mod error;
pub mod models;
mod reader_ui_prefs;
pub mod reading_progress;
mod storage_paths;
pub mod sync;

use std::sync::Mutex;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use log::{debug, error, info, LevelFilter};
use tauri::Manager;
use time::{macros::format_description, OffsetDateTime};

use commands::AppState;

/// 本地日期时间 + 毫秒（无法解析本地时区时回退 UTC）。勿使用错误嵌套的 `[[[year]…]]`。
const LOG_LINE_TIMESTAMP: &[time::format_description::FormatItem<'static>] =
    format_description!("[year]-[month]-[day] [hour]:[minute]:[second].[subsecond digits:3]");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let base = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    LevelFilter::Debug
                } else {
                    LevelFilter::Info
                })
                .format(|out, message, record| {
                    let ts = OffsetDateTime::now_local()
                        .unwrap_or_else(|_| OffsetDateTime::now_utc())
                        .format(LOG_LINE_TIMESTAMP)
                        .unwrap_or_else(|_| "?".into());
                    out.finish(format_args!(
                        "{} [{}] [{}] {}",
                        ts,
                        record.target(),
                        record.level(),
                        message
                    ))
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(debug_assertions)]
    let builder = base.plugin(tauri_plugin_mcp_bridge::init());
    #[cfg(not(debug_assertions))]
    let builder = base;

    builder
        .manage(Mutex::new(models::AppConfig::default()))
        .setup(|app| {
            info!("Start to initialize application.");
            let config_path = app.path().app_data_dir()?.join("config.json");
            let config = if config_path.exists() {
                std::fs::read_to_string(&config_path)
                    .ok()
                    .and_then(|json| serde_json::from_str::<models::AppConfig>(&json).ok())
                    .unwrap_or_default()
            } else {
                models::AppConfig::default()
            };
            info!(
                "Loaded config from disk. path: \"{}\", library count: {}, active library id: {:?}",
                config_path.display(),
                config.libraries.len(),
                config.active_library_id
            );
            *app.state::<AppState>().lock().unwrap() = config;
            if let Err(e) = asset_scope::sync_for_reader_libraries(&app.handle()) {
                error!(
                    "Failed to extend asset protocol scope for reader file access. error: {}",
                    e
                );
            }
            info!("Success to initialize application.");
            Ok(())
        })
        .register_uri_scheme_protocol("bookcover", |ctx, request| {
            debug!("Start to serve book cover. uri: \"{}\"", request.uri());
            let not_found = || -> tauri::http::Response<Vec<u8>> {
                error!("Failed to serve book cover. reason: not found");
                tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap()
            };

            let raw_path = request.uri().path();
            let path = raw_path.trim_start_matches('/');

            let Some((lib_id, encoded)) = path.split_once('/') else {
                return not_found();
            };

            let Ok(bytes) = URL_SAFE_NO_PAD.decode(encoded) else {
                return not_found();
            };
            let Ok(book_path) = String::from_utf8(bytes) else {
                return not_found();
            };

            let app = ctx.app_handle();
            let state = app.state::<AppState>();
            let config = state.lock().unwrap();

            let Some(lib) = config.libraries.iter().find(|l| l.id == lib_id) else {
                return not_found();
            };

            let cover_file = std::path::Path::new(&lib.path)
                .join(&book_path)
                .join("cover.jpg");

            match std::fs::read(&cover_file) {
                Ok(data) => {
                    debug!(
                        "Success to serve book cover. library id: \"{}\", cover file: \"{}\", bytes: {}",
                        lib_id,
                        cover_file.display(),
                        data.len()
                    );
                    tauri::http::Response::builder()
                        .status(200)
                        .header("content-type", "image/jpeg")
                        .header("access-control-allow-origin", "*")
                        .header("cache-control", "max-age=604800, immutable")
                        .body(data)
                        .unwrap()
                }
                Err(_) => not_found(),
            }
        })
        .register_uri_scheme_protocol("bookfile", |ctx, request| {
            debug!("Start to serve book file. uri: \"{}\"", request.uri());
            let not_found = || -> tauri::http::Response<Vec<u8>> {
                error!("Failed to serve book file. reason: not found");
                tauri::http::Response::builder()
                    .status(404)
                    .header("access-control-allow-origin", "*")
                    .body(Vec::new())
                    .unwrap()
            };

            let raw_path = request.uri().path();
            let path = raw_path.trim_start_matches('/');

            // URL: bookfile://localhost/{libraryId}/{bookId}/{FORMAT}
            let parts: Vec<&str> = path.splitn(3, '/').collect();
            if parts.len() < 3 {
                return not_found();
            }

            let lib_id = parts[0];
            let book_id: i64 = match parts[1].parse() {
                Ok(id) => id,
                Err(_) => return not_found(),
            };
            let format = parts[2];

            let app = ctx.app_handle();
            let state = app.state::<AppState>();
            let config = state.lock().unwrap();

            let Some(lib) = config.libraries.iter().find(|l| l.id == lib_id) else {
                return not_found();
            };

            let conn = match calibre::open_calibre_db(&lib.path) {
                Ok(c) => c,
                Err(_) => return not_found(),
            };

            let file_path =
                match calibre::get_book_file_path(&lib.path, &conn, book_id, format) {
                    Ok(Some(p)) => p,
                    _ => return not_found(),
                };

            match std::fs::read(&file_path) {
                Ok(data) => {
                    let content_type = match format.to_uppercase().as_str() {
                        "EPUB" => "application/epub+zip",
                        "CBZ" | "CBR" => "application/zip",
                        "PDF" => "application/pdf",
                        _ => "application/octet-stream",
                    };
                    debug!(
                        "Success to serve book file. library id: \"{}\", book id: {}, format: \"{}\", file path: \"{}\", bytes: {}, content type: \"{}\"",
                        lib_id,
                        book_id,
                        format,
                        file_path.display(),
                        data.len(),
                        content_type
                    );
                    tauri::http::Response::builder()
                        .status(200)
                        .header("content-type", content_type)
                        .header("access-control-allow-origin", "*")
                        .body(data)
                        .unwrap()
                }
                Err(_) => not_found(),
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_libraries,
            commands::list_data_sources,
            commands::test_webdav_connection,
            commands::add_library,
            commands::refresh_library,
            commands::add_local_data_source,
            commands::add_webdav_data_source,
            commands::remove_library,
            commands::remove_data_source,
            commands::switch_library,
            commands::get_active_library_id,
            commands::get_books,
            commands::get_books_page,
            commands::get_book_detail,
            commands::get_series_books,
            commands::get_reading_progress,
            commands::set_reading_progress,
            commands::get_book_cover,
            commands::get_reader_ui_preferences,
            commands::set_reader_ui_preferences,
            commands::prepare_book_source,
            commands::get_cache_usage,
            commands::clear_cache,
            commands::enforce_cache_limit,
            sync::commands::sync_list_backends,
            sync::commands::sync_test_backend,
            sync::commands::sync_list_file_states,
            sync::commands::sync_download_file,
            sync::commands::sync_evict_local_file,
            sync::commands::sync_delete_file_everywhere,
            sync::commands::sync_db_now,
            sync::commands::sync_db_for_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
