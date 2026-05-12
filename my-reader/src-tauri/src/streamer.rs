use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::RwLock;
use warp::Filter;

/// Active EPUB streamers keyed by a session identifier.
pub type StreamerState = Arc<RwLock<HashMap<String, EpubStreamer>>>;

/// A lightweight HTTP server for serving extracted EPUB directories.
/// This allows Readium navigator iframe to access resources without CORS issues.
pub struct EpubStreamer {
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    addr: SocketAddr,
}

impl EpubStreamer {
    /// Start serving the given directory over HTTP on a random available port.
    /// Returns the streamer instance and the base URL (e.g., "http://127.0.0.1:12345").
    pub async fn serve_dir(dir: PathBuf) -> Result<(Self, String), String> {
        let port = portpicker::pick_unused_port().ok_or("No available port")?;
        let addr: SocketAddr = ([127, 0, 0, 1], port).into();
        let base_url = format!("http://127.0.0.1:{}", port);

        let dir = Arc::new(RwLock::new(dir));

        let route = warp::path::tail()
            .and(warp::get())
            .and(warp::any().map(move || dir.clone()))
            .and_then(
                |tail: warp::path::Tail, dir: Arc<RwLock<PathBuf>>| async move {
                    let path = tail.as_str();
                    let dir = dir.read().await;
                    let file_path = dir.join(path);

                    // Security: prevent directory traversal
                    let canonical_dir = dunce::canonicalize(&*dir).ok();
                    let canonical_file = dunce::canonicalize(&file_path).ok();

                    if let (Some(d), Some(f)) = (canonical_dir, canonical_file) {
                        if !f.starts_with(d) {
                            let response = warp::http::Response::builder()
                                .status(warp::http::StatusCode::FORBIDDEN)
                                .body(Vec::new())
                                .map_err(|_| warp::reject())?;
                            return Ok::<_, warp::Rejection>(response);
                        }
                    }

                    if file_path.is_file() {
                        let content = match tokio::fs::read(&file_path).await {
                            Ok(c) => c,
                            Err(_) => {
                                let response = warp::http::Response::builder()
                                    .status(warp::http::StatusCode::NOT_FOUND)
                                    .body(Vec::new())
                                    .map_err(|_| warp::reject())?;
                                return Ok::<_, warp::Rejection>(response);
                            }
                        };

                        let content_type = guess_mime_type(&file_path);
                        let response = warp::http::Response::builder()
                            .status(200)
                            .header("content-type", content_type)
                            .header("access-control-allow-origin", "*")
                            .body(content)
                            .map_err(|_| warp::reject())?;

                        Ok::<_, warp::Rejection>(response)
                    } else {
                        let response = warp::http::Response::builder()
                            .status(warp::http::StatusCode::NOT_FOUND)
                            .body(Vec::new())
                            .map_err(|_| warp::reject())?;
                        Ok::<_, warp::Rejection>(response)
                    }
                },
            );

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

        let (_, server) = warp::serve(route)
            .bind_with_graceful_shutdown(addr, async move {
                let _ = shutdown_rx.await;
            });

        tokio::spawn(server);

        Ok((
            Self {
                shutdown_tx: Some(shutdown_tx),
                addr,
            },
            base_url,
        ))
    }

    /// Get the server address.
    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    /// Shut down the server.
    pub fn shutdown(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

fn guess_mime_type(path: &std::path::Path) -> &'static str {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name.eq_ignore_ascii_case("manifest.json") {
        return "application/webpub+json";
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") | Some("htm") | Some("xhtml") => "application/xhtml+xml",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("xml") => "application/xml",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ncx") => "application/x-dtbncx+xml",
        Some("opf") => "application/oebps-package+xml",
        _ => "application/octet-stream",
    }
}
