mod calibre;
mod commands;
mod error;
mod models;
use std::sync::Mutex;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use tauri::Manager;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(Mutex::new(models::AppConfig::default()))
        .setup(|app| {
            let config_dir = app.path().app_data_dir()?;
            let config_path = config_dir.join("libraries.json");
            if config_path.exists() {
                if let Ok(json) = std::fs::read_to_string(&config_path) {
                    if let Ok(config) = serde_json::from_str::<models::AppConfig>(&json) {
                        let state = app.state::<AppState>();
                        *state.lock().unwrap() = config;
                    }
                }
            }
            Ok(())
        })
        .register_uri_scheme_protocol("bookcover", |ctx, request| {
            let not_found = || -> tauri::http::Response<Vec<u8>> {
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
                Ok(data) => tauri::http::Response::builder()
                    .status(200)
                    .header("content-type", "image/jpeg")
                    .header("access-control-allow-origin", "*")
                    .header("cache-control", "max-age=604800, immutable")
                    .body(data)
                    .unwrap(),
                Err(_) => not_found(),
            }
        })
        .register_uri_scheme_protocol("bookfile", |ctx, request| {
            let not_found = || -> tauri::http::Response<Vec<u8>> {
                tauri::http::Response::builder()
                    .status(404)
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
            commands::add_library,
            commands::remove_library,
            commands::switch_library,
            commands::get_active_library_id,
            commands::get_books,
            commands::get_books_page,
            commands::get_book_detail,
            commands::get_series_books,
            commands::get_book_cover,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
