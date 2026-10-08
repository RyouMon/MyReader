//! End-to-end command tests for TTS provider persistence, HTTP synthesis, cache, and asset scope.

use std::sync::{Arc, Mutex};

use bytes::Bytes;
use serde_json::{json, Value};
use tauri::Manager;
use warp::Filter;

use my_reader_lib::auth::test_support::{use_test_backend, MemoryBackend};

use crate::common::app::TestApp;
use crate::common::config::read_persisted_config;
use crate::common::ipc::invoke_ok;

#[derive(Debug, Clone)]
struct CapturedRequest {
    path: String,
    authorization: Option<String>,
    body: Value,
}

type TtsTestServer = (
    String,
    Arc<Mutex<Vec<CapturedRequest>>>,
    tokio::sync::oneshot::Sender<()>,
    std::thread::JoinHandle<()>,
);

fn tts_test_server() -> TtsTestServer {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = requests.clone();
    let (address_tx, address_rx) = std::sync::mpsc::sync_channel(1);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let thread = std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async move {
            let route = warp::path::full()
                .and(warp::header::optional::<String>("authorization"))
                .and(warp::body::bytes())
                .map(
                    move |path: warp::path::FullPath,
                          authorization: Option<String>,
                          body: Bytes| {
                        let path = path.as_str().to_owned();
                        let body = serde_json::from_slice(&body).unwrap_or(Value::Null);
                        captured.lock().unwrap().push(CapturedRequest {
                            path: path.clone(),
                            authorization,
                            body,
                        });

                        if path.ends_with("/services/audio/tts/customization") {
                            return warp::http::Response::builder().header("content-type", "application/json")
                                .body(Bytes::from(serde_json::to_vec(&json!({"output": {"voice_list": [
                                    {"voice": "account-voice", "target_model": "qwen3-tts-vc-2026-01-22", "language": "zh"},
                                    {"voice": "realtime-voice", "target_model": "qwen3-tts-vc-realtime"}
                                ]}})).unwrap())).unwrap();
                        }

                        warp::http::Response::builder()
                            .header("content-type", "audio/mpeg")
                            .body(Bytes::from_static(b"ID3\x04\x00\x00"))
                            .unwrap()
                    },
                );
            let (address, server) =
                warp::serve(route).bind_with_graceful_shutdown(([127, 0, 0, 1], 0), async move {
                    let _ = shutdown_rx.await;
                });
            address_tx.send(address).unwrap();
            server.await;
        });
    });
    let address = address_rx.recv().unwrap();
    (format!("http://{address}"), requests, shutdown_tx, thread)
}

#[tokio::test]
async fn qwen_commands_should_offer_three_source_presets_from_core() {
    let app = TestApp::new();
    let presets: Value = invoke_ok(&app, "list_qwen_tts_presets", json!({}));
    assert_eq!(presets.as_array().unwrap().len(), 3);
    assert_eq!(presets[0]["id"], "tokenPlan");
    assert_eq!(
        presets[0]["defaultModel"]["voices"][0]["id"],
        "longanhuan_v3.6"
    );
    assert_eq!(
        presets[1]["endpoint"],
        "https://maas.qianwenaiapi.com/api/v1"
    );
    assert_eq!(
        presets[2]["endpoint"],
        "https://dashscope.aliyuncs.com/api/v1"
    );
}

#[tokio::test]
async fn qwen_commands_should_default_to_token_plan_models_without_account_voice_discovery() {
    let app = TestApp::new();
    let models: Value = invoke_ok(&app, "list_qwen_tts_models", json!({}));
    assert_eq!(models.as_array().unwrap().len(), 1);
    assert_eq!(models[0]["id"], "qwen-audio-3.0-tts-plus");
    assert_eq!(models[0]["voiceDiscovery"], false);
    assert_eq!(models[0]["voices"][0]["id"], "longanhuan_v3.6");
    assert_eq!(models[0]["audioFormats"], json!(["mp3", "wav", "opus"]));
}

#[tokio::test]
async fn qwen_commands_should_discover_matching_account_voices_using_stored_credentials() {
    let _guard = use_test_backend(MemoryBackend::default());
    let app = TestApp::new();
    let (server, requests, shutdown, thread) = tts_test_server();
    let models: Value = invoke_ok(&app, "list_qwen_tts_models", json!({"endpoint": server}));
    assert!(models
        .as_array()
        .unwrap()
        .iter()
        .any(|model| model["id"] == "qwen3-tts-vc-2026-01-22"));
    let config: Value = invoke_ok(
        &app,
        "upsert_tts_profile",
        json!({"input": {
            "profile": {"id": "qwen-e2e", "name": "Qwen", "kind": "qwen", "endpoint": server,
                "model": "qwen3-tts-vc-2026-01-22", "options": {"kind": "qwen", "responseFormat": "wav", "instructions": null, "voices": ["account-voice"], "defaultVoice": "account-voice"}},
            "credential": "qwen-private-key", "clearCredential": false
        }}),
    );
    assert_eq!(config["profiles"][0]["hasCredential"], true);
    let voices: Value = invoke_ok(
        &app,
        "discover_qwen_tts_voices",
        json!({"input": {"endpoint": server, "model": "qwen3-tts-vc-2026-01-22", "profileId": "qwen-e2e", "credential": null}}),
    );
    assert_eq!(voices.as_array().unwrap().len(), 1);
    assert_eq!(voices[0]["id"], "account-voice");
    assert_eq!(
        requests.lock().unwrap()[0].authorization.as_deref(),
        Some("Bearer qwen-private-key")
    );
    assert!(
        !serde_json::to_string(&read_persisted_config(&app).unwrap())
            .unwrap()
            .contains("qwen-private-key")
    );
    shutdown.send(()).unwrap();
    thread.join().unwrap();
}

#[tokio::test]
async fn provider_commands_should_round_trip_openai_audio() {
    let _credential_guard = use_test_backend(MemoryBackend::default());
    let app = TestApp::new();
    let (server, requests, shutdown, server_thread) = tts_test_server();

    let config: Value = invoke_ok(
        &app,
        "upsert_tts_profile",
        json!({
            "input": {
                "profile": {
                    "id": "openai-e2e",
                    "name": "OpenAI E2E",
                    "kind": "openAiCompatible",
                    "enabled": true,
                    "endpoint": format!("{server}/openai"),
                    "model": "gpt-4o-mini-tts",
                    "options": {
                        "kind": "openAiCompatible",
                        "responseFormat": "mp3",
                        "instructions": "Read calmly",
                        "voices": ["reader-voice", "narrator-voice"],
                        "defaultVoice": "reader-voice"
                    }
                },
                "credential": "openai-test-secret",
                "clearCredential": false
            }
        }),
    );
    assert_eq!(config["profiles"][0]["hasCredential"], true);
    assert!(config["profiles"][0].get("credential").is_none());

    let openai_input = json!({
        "input": {
            "profileId": "openai-e2e",
            "text": "Hello from MyReader.",
            "language": "en",
            "voiceId": "reader-voice",
            "speed": null,
            "pitch": null,
            "acceptedMimeTypes": ["audio/mpeg"],
            "cachePolicy": "use"
        }
    });
    let openai_audio: Value = invoke_ok(&app, "synthesize_tts", openai_input.clone());
    let cached_audio: Value = invoke_ok(&app, "synthesize_tts", openai_input);
    assert_eq!(cached_audio["path"], openai_audio["path"]);
    assert_eq!(openai_audio["mimeType"], "audio/mpeg");

    let path = openai_audio["path"].as_str().unwrap();
    assert_eq!(std::fs::read(path).unwrap(), b"ID3\x04\x00\x00");
    assert!(app.app.asset_protocol_scope().is_allowed(path));
    std::fs::remove_file(path).unwrap();

    let requests = requests.lock().unwrap();
    let openai_requests = requests
        .iter()
        .filter(|request| request.path == "/openai/v1/audio/speech")
        .collect::<Vec<_>>();
    assert_eq!(
        openai_requests.len(),
        1,
        "second synthesis should use cache"
    );
    assert_eq!(
        openai_requests[0].authorization.as_deref(),
        Some("Bearer openai-test-secret")
    );
    assert_eq!(openai_requests[0].body["voice"], "reader-voice");
    assert_eq!(openai_requests[0].body["instructions"], "Read calmly");

    drop(requests);

    let persisted = serde_json::to_string(&read_persisted_config(&app).unwrap()).unwrap();
    assert!(!persisted.contains("openai-test-secret"));

    shutdown.send(()).unwrap();
    server_thread.join().unwrap();
}
