use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use log::{debug, error};
use tauri::http::Response;
use tauri::Manager;

use crate::commands::AppState;
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};

pub fn bookcover_handler<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    debug!("Start to serve book cover. uri: \"{}\"", request.uri());
    let not_found = || -> Response<Vec<u8>> {
        error!("Failed to serve book cover. reason: not found");
        Response::builder()
            .status(404)
            .body(Vec::new())
            .expect("infallible hardcoded response")
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
    let config = state.lock().unwrap_or_else(|e| e.into_inner());

    let Some(lib) = config.libraries.iter().find(|l| l.id == lib_id) else {
        return not_found();
    };

    let lib_path = match dunce::canonicalize(&lib.path) {
        Ok(p) => p,
        Err(_) => return not_found(),
    };
    let cover_file = lib_path.join(&book_path).join("cover.jpg");
    let cover_file = match dunce::canonicalize(&cover_file) {
        Ok(p) => p,
        Err(_) => return not_found(),
    };
    if !cover_file.starts_with(&lib_path) {
        return not_found();
    }

    match std::fs::read(&cover_file) {
        Ok(data) => {
            debug!(
                "Success to serve book cover. library id: \"{}\", cover file: \"{}\", bytes: {}",
                lib_id,
                cover_file.display(),
                data.len()
            );
            Response::builder()
                .status(200)
                .header("content-type", "image/jpeg")
                .header("access-control-allow-origin", "*")
                .header("cache-control", "max-age=604800, immutable")
                .body(data)
                .expect("infallible hardcoded response")
        }
        Err(_) => not_found(),
    }
}

pub fn bookfile_handler<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    debug!("Start to serve book file. uri: \"{}\"", request.uri());
    let not_found = || -> Response<Vec<u8>> {
        error!("Failed to serve book file. reason: not found");
        Response::builder()
            .status(404)
            .header("access-control-allow-origin", "*")
            .body(Vec::new())
            .expect("infallible hardcoded response")
    };

    let raw_path = request.uri().path();
    let path = raw_path.trim_start_matches('/');

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
    let config = state.lock().unwrap_or_else(|e| e.into_inner());

    let Some(lib) = config.libraries.iter().find(|l| l.id == lib_id) else {
        return not_found();
    };

    let lib_path = match dunce::canonicalize(&lib.path) {
        Ok(p) => p,
        Err(_) => return not_found(),
    };

    let lib_path_str = match lib_path.to_str() {
        Some(s) => s,
        None => return not_found(),
    };

    let repo = match CalibreBookRepository::open(lib_path_str) {
        Ok(r) => r,
        Err(_) => return not_found(),
    };

    let file_path = match repo.get_book_file_path(lib_path_str, book_id, format) {
        Ok(Some(p)) => p,
        _ => return not_found(),
    };
    let file_path = match dunce::canonicalize(&file_path) {
        Ok(p) => p,
        Err(_) => return not_found(),
    };
    if !file_path.starts_with(&lib_path) {
        return not_found();
    }

    match std::fs::read(&file_path) {
        Ok(data) => {
            let content_type = match format.to_uppercase().as_str() {
                "EPUB" => "application/epub+zip",
                "CBZ" => "application/zip",
                "CBR" => "application/x-rar-compressed",
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
            Response::builder()
                .status(200)
                .header("content-type", content_type)
                .header("access-control-allow-origin", "*")
                .body(data)
                .expect("infallible hardcoded response")
        }
        Err(_) => not_found(),
    }
}
