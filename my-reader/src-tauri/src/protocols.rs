use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use std::path::Path;
use tauri::http::Response;
use tauri::Manager;
use tracing::{debug, error};

use crate::cache;
use crate::commands::AppState;
use crate::error::AppError;
use crate::models::{AppConfig, DataSourceConfig, LibraryConfig};
use crate::repositories::calibre_repo::{BookRepository, CalibreBookRepository};
use crate::storage::from_data_source;
use crate::utils::paths::{library_book_file_path, library_root_path};

fn build_response(status: u16, headers: Vec<(&str, &str)>, body: Vec<u8>) -> Response<Vec<u8>> {
    let mut builder = Response::builder().status(status);
    for (k, v) in headers {
        builder = builder.header(k, v);
    }
    builder
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn not_found_cover() -> Response<Vec<u8>> {
    error!("Failed to serve book cover. reason: not found");
    build_response(404, Vec::new(), Vec::new())
}

fn not_found_file() -> Response<Vec<u8>> {
    error!("Failed to serve book file. reason: not found");
    build_response(404, vec![("access-control-allow-origin", "*")], Vec::new())
}

/// Parse `bookcover://{lib_id}/{base64(book_path)}`.
fn parse_cover_uri(uri: &tauri::http::Uri) -> Option<(String, String)> {
    let raw_path = uri.path();
    let path = raw_path.trim_start_matches('/');

    let (lib_id, encoded) = path.split_once('/')?;
    let bytes = URL_SAFE_NO_PAD.decode(encoded).ok()?;
    let book_path = String::from_utf8(bytes).ok()?;

    Some((lib_id.to_string(), book_path))
}

/// Resolve the remote cover path inside the data source.
fn remote_cover_path(lib: &LibraryConfig, book_path: &str) -> String {
    if let Some(source_path) = lib.source_path.as_deref() {
        let trimmed = source_path
            .trim()
            .trim_start_matches('/')
            .trim_end_matches('/');
        if trimmed.is_empty() {
            format!("{}/cover.jpg", book_path)
        } else {
            format!("{}/{}/cover.jpg", trimmed, book_path)
        }
    } else {
        format!("{}/cover.jpg", book_path)
    }
}

async fn serve_remote_cover(
    lib: &LibraryConfig,
    app_data_dir: &Path,
    source: DataSourceConfig,
    book_path: &str,
) -> Result<Response<Vec<u8>>, AppError> {
    // Cache remote covers inside the library container so scrolling back to a
    // previously-visible book does not re-fetch from the network.
    let cache_file = library_book_file_path(lib, app_data_dir, book_path).join("cover.jpg");
    let remote_path = remote_cover_path(lib, book_path);
    let missing_marker = cache::missing_cover_marker_path(app_data_dir, &lib.id, &remote_path);

    if tokio::fs::try_exists(&cache_file).await.unwrap_or(false) {
        let data = tokio::fs::read(&cache_file)
            .await
            .map_err(|e| AppError::Config(format!("COVER_CACHE_READ_FAILED: {e}")))?;
        return Ok(build_response(
            200,
            vec![
                ("content-type", "image/jpeg"),
                ("access-control-allow-origin", "*"),
                ("cache-control", "max-age=604800, immutable"),
            ],
            data,
        ));
    }

    if tokio::fs::try_exists(&missing_marker)
        .await
        .unwrap_or(false)
    {
        debug!(
            "Skip remote cover request because missing marker exists. library id: \"{}\", book path: \"{}\", marker: \"{}\"",
            lib.id,
            book_path,
            missing_marker.display()
        );
        return Ok(not_found_cover());
    }

    let op = from_data_source(&source).await?;
    let data: Vec<u8> = match op.read(&remote_path).await {
        Ok(bytes) => bytes.to_vec(),
        Err(err) if err.kind() == opendal::ErrorKind::NotFound => {
            cache::write_missing_cover_marker(&missing_marker, &remote_path).await?;
            return Ok(not_found_cover());
        }
        Err(err) => return Err(AppError::Config(format!("REMOTE_COVER_READ_FAILED: {err}"))),
    };

    // Persist the cover for subsequent requests.
    if let Some(parent) = cache_file.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Config(format!("COVER_CACHE_DIR_FAILED: {e}")))?;
    }
    tokio::fs::write(&cache_file, &data)
        .await
        .map_err(|e| AppError::Config(format!("COVER_CACHE_WRITE_FAILED: {e}")))?;

    Ok(build_response(
        200,
        vec![
            ("content-type", "image/jpeg"),
            ("access-control-allow-origin", "*"),
            ("cache-control", "max-age=604800, immutable"),
        ],
        data,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::DataSourceDetail;
    use std::fs;

    fn local_source(root: &Path) -> DataSourceConfig {
        DataSourceConfig {
            id: "ds-local".to_string(),
            name: "Local".to_string(),
            enabled: true,
            detail: DataSourceDetail::Local {
                root_path: root.to_string_lossy().to_string(),
            },
        }
    }

    fn remote_library(id: &str) -> LibraryConfig {
        LibraryConfig {
            id: id.to_string(),
            name: "Remote".to_string(),
            path: String::new(),
            source_type: Some("webdav".to_string()),
            data_source_id: Some("ds-local".to_string()),
            source_path: Some("Remote Library".to_string()),
        }
    }

    #[tokio::test]
    async fn serve_remote_cover_should_cache_not_found_and_skip_until_marker_is_cleared() {
        let app_data = tempfile::tempdir().unwrap();
        let remote_root = tempfile::tempdir().unwrap();
        let lib = remote_library("lib-remote");
        let source = local_source(remote_root.path());
        let book_path = "Author/Missing Book";
        let local_book_dir = library_book_file_path(&lib, app_data.path(), book_path);
        let remote_path = remote_cover_path(&lib, book_path);
        let marker = cache::missing_cover_marker_path(app_data.path(), &lib.id, &remote_path);
        let local_cover = local_book_dir.join("cover.jpg");

        let missing = serve_remote_cover(&lib, app_data.path(), source.clone(), book_path)
            .await
            .unwrap();
        assert_eq!(missing.status().as_u16(), 404);
        assert!(marker.exists());
        assert!(!local_book_dir.join("cover.missing").exists());
        let marker_store = cache::library_missing_cover_markers_dir(app_data.path(), &lib.id);
        assert_eq!(marker.parent(), Some(marker_store.as_path()));

        let remote_cover = remote_root
            .path()
            .join("Remote Library")
            .join(book_path)
            .join("cover.jpg");
        fs::create_dir_all(remote_cover.parent().unwrap()).unwrap();
        fs::write(&remote_cover, b"new-cover").unwrap();

        let still_missing = serve_remote_cover(&lib, app_data.path(), source.clone(), book_path)
            .await
            .unwrap();
        assert_eq!(still_missing.status().as_u16(), 404);
        assert!(!local_cover.exists());

        cache::clear_library_missing_cover_markers(app_data.path(), &lib.id).unwrap();
        assert!(!marker.exists());

        let loaded = serve_remote_cover(&lib, app_data.path(), source, book_path)
            .await
            .unwrap();
        assert_eq!(loaded.status().as_u16(), 200);
        assert_eq!(loaded.into_body(), b"new-cover".to_vec());
        assert!(local_cover.exists());
    }

    #[tokio::test]
    async fn serve_remote_cover_should_not_cache_non_not_found_errors() {
        let app_data = tempfile::tempdir().unwrap();
        let remote_root = tempfile::tempdir().unwrap();
        let lib = remote_library("lib-remote");
        let source = local_source(remote_root.path());
        let book_path = "Author/Directory Cover";
        let remote_path = remote_cover_path(&lib, book_path);
        let marker = cache::missing_cover_marker_path(app_data.path(), &lib.id, &remote_path);
        let remote_cover_dir = remote_root
            .path()
            .join("Remote Library")
            .join(book_path)
            .join("cover.jpg");
        fs::create_dir_all(&remote_cover_dir).unwrap();

        let err = serve_remote_cover(&lib, app_data.path(), source, book_path)
            .await
            .expect_err("directory read should fail without writing a missing-cover marker");

        assert!(format!("{err}").contains("REMOTE_COVER_READ_FAILED"));
        assert!(!marker.exists());
    }
}

async fn serve_local_cover(
    lib: &LibraryConfig,
    app_data_dir: &Path,
    book_path: &str,
) -> Result<Response<Vec<u8>>, AppError> {
    let lib_root = library_root_path(lib, app_data_dir);
    let cover_file = library_book_file_path(lib, app_data_dir, book_path).join("cover.jpg");

    let cover_file = dunce::canonicalize(&cover_file)
        .map_err(|e| AppError::Config(format!("COVER_PATH_CANONICALIZE_FAILED: {e}")))?;
    let lib_root = dunce::canonicalize(&lib_root)
        .map_err(|e| AppError::Config(format!("LIB_PATH_CANONICALIZE_FAILED: {e}")))?;

    if !cover_file.starts_with(&lib_root) {
        return Err(AppError::Config("COVER_PATH_TRAVERSAL_BLOCKED".into()));
    }

    let data = tokio::fs::read(&cover_file)
        .await
        .map_err(|e| AppError::Config(format!("COVER_READ_FAILED: {e}")))?;

    debug!(
        "Success to serve book cover. library id: \"{}\", cover file: \"{}\", bytes: {}",
        lib.id,
        cover_file.display(),
        data.len()
    );

    Ok(build_response(
        200,
        vec![
            ("content-type", "image/jpeg"),
            ("access-control-allow-origin", "*"),
            ("cache-control", "max-age=604800, immutable"),
        ],
        data,
    ))
}

pub fn bookcover_handler<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    debug!("Start to serve book cover. uri: \"{}\"", request.uri());

    let app = ctx.app_handle();
    let app_data_dir = match app.path().app_data_dir() {
        Ok(p) => p,
        Err(_) => return responder.respond(not_found_cover()),
    };

    let (lib_id, book_path) = match parse_cover_uri(request.uri()) {
        Some(v) => v,
        None => return responder.respond(not_found_cover()),
    };

    let config: AppConfig = {
        let state = app.state::<AppState>();
        let guard = state.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    let Some(lib) = config.libraries.iter().find(|l| l.id == lib_id).cloned() else {
        return responder.respond(not_found_cover());
    };

    if lib.is_remote() {
        let Some(data_source_id) = lib.data_source_id.clone() else {
            return responder.respond(not_found_cover());
        };
        let Some(source) = config
            .data_sources
            .iter()
            .find(|s| s.id == data_source_id)
            .cloned()
        else {
            return responder.respond(not_found_cover());
        };

        tauri::async_runtime::spawn(async move {
            let response = serve_remote_cover(&lib, &app_data_dir, source, &book_path)
                .await
                .unwrap_or_else(|_| not_found_cover());
            responder.respond(response);
        });
        return;
    }

    tauri::async_runtime::spawn(async move {
        let response = serve_local_cover(&lib, &app_data_dir, &book_path)
            .await
            .unwrap_or_else(|_| not_found_cover());
        responder.respond(response);
    });
}

/// Parse `bookfile://{lib_id}/{book_id}/{format}`.
fn parse_bookfile_uri(uri: &tauri::http::Uri) -> Option<(String, i64, String)> {
    let raw_path = uri.path();
    let path = raw_path.trim_start_matches('/');

    let parts: Vec<&str> = path.splitn(3, '/').collect();
    if parts.len() < 3 {
        return None;
    }

    let lib_id = parts[0].to_string();
    let book_id: i64 = parts[1].parse().ok()?;
    let format = parts[2].to_string();

    Some((lib_id, book_id, format))
}

async fn serve_local_book_file(
    lib: &LibraryConfig,
    app_data_dir: &Path,
    book_id: i64,
    format: &str,
) -> Result<Response<Vec<u8>>, AppError> {
    let lib_path = library_root_path(lib, app_data_dir);
    let lib_path = dunce::canonicalize(&lib_path)
        .map_err(|e| AppError::Config(format!("LIB_PATH_CANONICALIZE_FAILED: {e}")))?;
    let lib_path_str = lib_path
        .to_str()
        .ok_or_else(|| AppError::Config("LIB_PATH_INVALID_UTF8".into()))?;

    let repo = CalibreBookRepository::open(lib_path_str).await?;
    let file_path = repo
        .get_book_file_path(lib_path_str, book_id, format)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("BOOK_FILE_NOT_FOUND: {book_id}")))?;

    let file_path = dunce::canonicalize(&file_path)
        .map_err(|e| AppError::Config(format!("BOOK_FILE_CANONICALIZE_FAILED: {e}")))?;
    if !file_path.starts_with(&lib_path) {
        return Err(AppError::Config("BOOK_FILE_PATH_TRAVERSAL_BLOCKED".into()));
    }

    let data = tokio::fs::read(&file_path)
        .await
        .map_err(|e| AppError::Config(format!("BOOK_FILE_READ_FAILED: {e}")))?;

    let content_type = match format.to_uppercase().as_str() {
        "EPUB" => "application/epub+zip",
        "CBZ" => "application/zip",
        "CBR" => "application/x-rar-compressed",
        "PDF" => "application/pdf",
        _ => "application/octet-stream",
    };

    debug!(
        "Success to serve book file. library id: \"{}\", book id: {}, format: \"{}\", file path: \"{}\", bytes: {}, content type: \"{}\"",
        lib.id,
        book_id,
        format,
        file_path.display(),
        data.len(),
        content_type
    );

    Ok(build_response(
        200,
        vec![
            ("content-type", content_type),
            ("access-control-allow-origin", "*"),
        ],
        data,
    ))
}

pub fn bookfile_handler<R: tauri::Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    debug!("Start to serve book file. uri: \"{}\"", request.uri());

    let app = ctx.app_handle();
    let app_data_dir = match app.path().app_data_dir() {
        Ok(p) => p,
        Err(_) => return responder.respond(not_found_file()),
    };

    let (lib_id, book_id, format) = match parse_bookfile_uri(request.uri()) {
        Some(v) => v,
        None => return responder.respond(not_found_file()),
    };

    let config: AppConfig = {
        let state = app.state::<AppState>();
        let guard = state.lock().unwrap_or_else(|e| e.into_inner());
        guard.clone()
    };

    let Some(lib) = config.libraries.iter().find(|l| l.id == lib_id).cloned() else {
        return responder.respond(not_found_file());
    };

    tauri::async_runtime::spawn(async move {
        let response = serve_local_book_file(&lib, &app_data_dir, book_id, &format)
            .await
            .unwrap_or_else(|_| not_found_file());
        responder.respond(response);
    });
}
