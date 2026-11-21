use super::{
    invalid,
    source::Input,
    webpub::{Package, LIMIT},
};
use crate::CoreError;
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Router,
};
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, OnceLock},
    time::Duration,
};
use tokio::sync::{oneshot, Mutex};

macro_rules! asset {
    ($name:literal) => {
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../packages/reader-formats/",
            $name
        ))
        .as_slice()
    };
}
pub(super) const MODULES: &[(&str, &[u8])] = &[
    (
        "vendor/foliate-js/fb2.js",
        asset!("vendor/foliate-js/fb2.js"),
    ),
    (
        "vendor/foliate-js/mobi.js",
        asset!("vendor/foliate-js/mobi.js"),
    ),
    (
        "vendor/foliate-js/vendor/fflate.js",
        asset!("vendor/foliate-js/vendor/fflate.js"),
    ),
    ("src/foliate/run.js", asset!("src/foliate/run.js")),
    ("src/foliate/export.js", asset!("src/foliate/export.js")),
    (
        "src/foliate/resources.js",
        asset!("src/foliate/resources.js"),
    ),
    ("src/foliate/html.js", asset!("src/foliate/html.js")),
];
const INDEX: &str = r#"<!doctype html><meta charset="utf-8"><script type="module" src="module/src/foliate/run.js"></script>"#;
pub(super) fn revision() -> &'static str {
    static DIGEST: OnceLock<String> = OnceLock::new();
    DIGEST.get_or_init(|| {
        let mut hash = Sha256::new();
        for (_, bytes) in MODULES {
            hash.update(bytes);
        }
        format!("{:x}", hash.finalize())
    })
}
struct Session {
    input: Input,
    package: Mutex<Option<Package>>,
    stop: Mutex<Option<oneshot::Sender<()>>>,
}
type Shared = State<Arc<Session>>;
type Failure = (StatusCode, String);
fn failure(error: CoreError) -> Failure {
    (StatusCode::UNPROCESSABLE_ENTITY, error.to_string())
}
async fn module(Path(name): Path<String>) -> Response {
    match MODULES.iter().find(|(path, _)| *path == name) {
        Some((_, bytes)) => ([(header::CONTENT_TYPE, "text/javascript")], *bytes).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn source(State(s): Shared, Path(name): Path<String>) -> Response {
    match s.input.files.get(&name) {
        Some(bytes) => bytes.clone().into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn add(State(s): Shared, Path(name): Path<String>, body: Bytes) -> Result<(), Failure> {
    let mut writer = s.package.lock().await;
    writer
        .as_mut()
        .ok_or_else(|| failure(invalid("SESSION_CLOSED")))?
        .add(&name, &body)
        .map_err(failure)
}
async fn close(s: &Session) {
    if let Some(tx) = s.stop.lock().await.take() {
        let _ = tx.send(());
    }
}
async fn finish(State(s): Shared, body: Bytes) -> Result<(), Failure> {
    let manifest = serde_json::from_slice(&body).map_err(|e| failure(invalid(e.to_string())))?;
    let writer = s
        .package
        .lock()
        .await
        .take()
        .ok_or_else(|| failure(invalid("SESSION_CLOSED")))?;
    let result = tokio::task::spawn_blocking(move || writer.finish(manifest))
        .await
        .map_err(|e| failure(invalid(e.to_string())))?;
    close(&s).await;
    result.map_err(failure)
}
pub(super) async fn start(input: Input, package: Package) -> Result<String, CoreError> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?;
    let port = listener.local_addr()?.port();
    let token = uuid::Uuid::new_v4();
    let (send, recv) = oneshot::channel();
    let service=Router::new()
        .route("/index.html",get(|| async {([(header::CONTENT_TYPE,"text/html"),(header::REFERRER_POLICY,"no-referrer"),(header::CONTENT_SECURITY_POLICY,"default-src 'none'; script-src 'self'; connect-src 'self' blob: data:; img-src data: blob:; base-uri 'none'; form-action 'none'")],INDEX)}))
        .route("/module/{*name}",get(module))
        .route("/description",get(|State(s):Shared|async move{s.input.description().to_string()}))
        .route("/input/{*name}",get(source)).route("/output/{name}",put(add)).route("/finish",post(finish))
        .route("/abort",post(|State(s):Shared|async move{close(&s).await}))
        .layer(DefaultBodyLimit::max(LIMIT))
        .with_state(Arc::new(Session{input,package:Mutex::new(Some(package)),stop:Mutex::new(Some(send))}));
    let router = Router::new().nest(&format!("/{token}"), service);
    tokio::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = tokio::time::timeout(Duration::from_secs(180), recv).await;
            })
            .await;
    });
    Ok(format!("http://127.0.0.1:{port}/{token}/index.html"))
}
