use crate::common::{
    app::TestApp,
    calibre::create_calibre_db,
    config::seed_config_file,
    ipc::{invoke_err, invoke_ok},
};
use my_reader_lib::{
    auth::test_support::{use_test_backend, MemoryBackend},
    models::{AppConfig, LibraryConfig},
};
use sea_orm::ConnectionTrait;
use serde_json::{json, Value};
use warp::Filter;

struct Server {
    endpoint: String,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    thread: Option<std::thread::JoinHandle<()>>,
}
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.stop.take().unwrap().send(());
        self.thread.take().unwrap().join().unwrap();
    }
}
fn server() -> Server {
    let (address_tx, address_rx) = std::sync::mpsc::sync_channel(1);
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let thread = std::thread::spawn(move || {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(async {
            let route = warp::path::full().and(warp::body::bytes()).map(|path: warp::path::FullPath, bytes: bytes::Bytes| {
                if path.as_str().ends_with("/models") { return warp::reply::json(&json!({"data":[{"id":"fixture"},{"id":"fixture"}]})); }
                let request: Value = serde_json::from_slice(&bytes).unwrap();
                let messages = request.get("messages").or_else(|| request.get("input")).unwrap().as_array().unwrap();
                let last = messages.last().unwrap()["content"].as_str().unwrap();
                let output = if messages[0]["content"].as_str().unwrap().starts_with("You assign") {
                    let input: Value = serde_json::from_str(last).unwrap();
                    json!({"segments":[{"text":input["text"],"characterId":"alice","delivery":"happy"}]})
                } else { json!({"ok":true}) };
                warp::reply::json(&if request.get("input").is_some() { json!({"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":output.to_string()}]}]}) } else { json!({"choices":[{"finish_reason":"stop","message":{"content":output.to_string()}}]}) })
            });
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            address_tx.send(listener.local_addr().unwrap()).unwrap();
            warp::serve(route).incoming(listener).graceful(async { let _ = stopped.await; }).run().await;
        });
    });
    Server {
        endpoint: format!("http://{}", address_rx.recv().unwrap()),
        stop: Some(stop),
        thread: Some(thread),
    }
}
fn input(endpoint: &str) -> Value {
    json!({"profile":{"id":"","name":"Fixture","protocol":"chatCompletions","endpoint":endpoint,"model":"fixture","contextWindow":32768},"credential":"fixture-secret"})
}

#[tokio::test]
async fn llm_commands_keep_keys_out_of_config_and_support_preview_and_profile_lifecycle() {
    let _keys = use_test_backend(MemoryBackend::default());
    let app = TestApp::new();
    let server = server();
    let mut draft = input(&server.endpoint);
    draft["profile"]["model"] = json!("");
    let models: Vec<String> = invoke_ok(&app, "list_llm_models", json!({"input":draft}));
    assert_eq!(models, ["fixture"]);
    draft["profile"]["model"] = json!("fixture");
    let _: () = invoke_ok(&app, "probe_llm_profile", json!({"input":draft}));
    let saved: Value = invoke_ok(&app, "upsert_llm_profile", json!({"input":draft}));
    assert_eq!(saved["profiles"][0]["hasCredential"], true);
    let id = saved["profiles"][0]["id"].as_str().unwrap();
    let bytes = std::fs::read(app.app_data_dir().join("config.json")).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("fixture-secret"));
    draft["profile"]["id"] = json!(id);
    draft["credential"] = Value::Null;
    draft["profile"]["protocol"] = json!("responses");
    let _: () = invoke_ok(&app, "probe_llm_profile", json!({"input":draft}));
    let updated: Value = invoke_ok(&app, "upsert_llm_profile", json!({"input":draft}));
    assert_eq!(updated["profiles"][0]["hasCredential"], true);
    let cleared: Value = invoke_ok(&app, "select_llm_profile", json!({"profileId":null}));
    assert!(cleared["defaultProfileId"].is_null());
    let _: Value = invoke_ok(&app, "select_llm_profile", json!({"profileId":id}));
    draft["clearCredential"] = json!(true);
    let cleared: Value = invoke_ok(&app, "upsert_llm_profile", json!({"input":draft}));
    assert_eq!(cleared["profiles"][0]["hasCredential"], false);
    let _: () = invoke_ok(&app, "probe_llm_profile", json!({"input":draft}));
    let _: Value = invoke_ok(&app, "remove_llm_profile", json!({"profileId":id}));
    let empty: Value = invoke_ok(&app, "get_llm_config", json!({}));
    assert_eq!(empty["profiles"], json!([]));
}

#[tokio::test]
async fn narration_commands_preserve_identity_and_route_exact_text_with_book_scoped_settings() {
    let _keys = use_test_backend(MemoryBackend::default());
    let root = tempfile::tempdir().unwrap();
    let db = create_calibre_db(root.path()).await;
    db.execute_unprepared("INSERT INTO books (id, title, path) VALUES (7, 'Volume 7', 'Book7'), (8, 'Volume 8', 'Book8')").await.unwrap();
    let config = AppConfig {
        libraries: vec![LibraryConfig {
            id: "library".into(),
            name: "Fixture".into(),
            path: root.path().to_str().unwrap().into(),
            source_type: Some("local".into()),
            library_type: Default::default(),
            data_source_id: None,
            source_path: None,
        }],
        active_library_id: Some("library".into()),
        ..Default::default()
    };
    let app = TestApp::with_config(config.clone());
    seed_config_file(&app, &config);
    let server = server();
    let _: Value = invoke_ok(
        &app,
        "upsert_llm_profile",
        json!({"input":input(&server.endpoint)}),
    );
    let mut settings: Value = invoke_ok(
        &app,
        "get_book_narration",
        json!({"libraryId":"library","bookId":7}),
    );
    assert_eq!(settings["enabled"], false);
    settings["enabled"] = json!(true);
    settings["characters"].as_array_mut().unwrap().push(json!({"id":"alice","name":"Alice","aliases":["A"],"identity":"teacher","voice":{"engine":"provider","profileId":"tts-a","voiceId":"A"},"instructions":"gentle","source":{"title":"Cast","url":"https://en.wikipedia.org/wiki/Novel"}}));
    let saved: Value = invoke_ok(
        &app,
        "save_book_narration",
        json!({"libraryId":"library","settings":settings}),
    );
    assert_eq!(saved["characters"][1]["id"], "alice");
    assert!(invoke_err(
        &app,
        "save_book_narration",
        json!({"libraryId":"library","settings":settings})
    )
    .message
    .contains("STALE_REQUEST"));
    let speech: Value = invoke_ok(
        &app,
        "prepare_book_narration",
        json!({"libraryId":"library","requestId":"r1","request":{"bookId":7,"contentVersion":"v","sourceKey":"locator","position":0.4,"text":"Hi😀","before":"","after":""},"defaultVoice":{"engine":"system","voiceId":""}}),
    );
    assert_eq!(speech[0]["text"], "Hi😀");
    assert_eq!(speech[0]["endUtf16"], 4);
    assert_eq!(speech[0]["voice"]["profileId"], "tts-a");
    assert_eq!(speech[0]["instructions"], "gentle\nhappy");
    let _: () = invoke_ok(
        &app,
        "cancel_book_narration",
        json!({"libraryId":"library","bookId":7}),
    );
    let other: Value = invoke_ok(
        &app,
        "get_book_narration",
        json!({"libraryId":"library","bookId":8}),
    );
    assert_eq!(other["enabled"], false);
    assert_eq!(other["characters"].as_array().unwrap().len(), 1);
    let error = invoke_err(
        &app,
        "import_book_characters",
        json!({"libraryId":"library","request":{"bookId":7,"title":"","authors":[],"language":"en"}}),
    );
    assert!(error.message.contains("REQUEST_INVALID"));

    let mut other = other;
    other["enabled"] = json!(true);
    other["characters"].as_array_mut().unwrap().push(json!({"id":"second-alice","name":"Alice","aliases":[],"identity":"teacher","voice":{"engine":"provider","profileId":"tts-b","voiceId":"B"},"instructions":"calm","source":null}));
    let _: Value = invoke_ok(
        &app,
        "save_book_narration",
        json!({"libraryId":"library","settings":other}),
    );
    db.execute_unprepared("INSERT INTO series (id, name) VALUES (1, 'Novel'); INSERT INTO books_series_link (id, book, series) VALUES (1, 7, 1), (2, 8, 1)").await.unwrap();
    let shared: Value = invoke_ok(
        &app,
        "get_book_narration",
        json!({"libraryId":"library","bookId":8}),
    );
    assert_eq!(shared["scopeName"], "Novel");
    assert_eq!(shared["mergeSources"].as_array().unwrap().len(), 1);
    let mut plan: Value = invoke_ok(
        &app,
        "preview_book_narration_merge",
        json!({"libraryId":"library","bookId":8,"automatic":false}),
    );
    plan["choices"][1]["preferIncoming"] = json!(true);
    let merged: Value = invoke_ok(
        &app,
        "merge_book_narration",
        json!({"libraryId":"library","bookId":8,"plan":plan}),
    );
    assert!(merged["mergeSources"].as_array().unwrap().is_empty());
    assert_eq!(merged["characters"][1]["id"], "alice");
    assert_eq!(merged["characters"][1]["voice"]["profileId"], "tts-b");
    let first: Value = invoke_ok(
        &app,
        "get_book_narration",
        json!({"libraryId":"library","bookId":7}),
    );
    assert_eq!(first["characters"], merged["characters"]);
}
