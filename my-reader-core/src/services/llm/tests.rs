use super::*;
use crate::models::{LlmProtocol, TtsPlaybackPreferences};

fn profile() -> LlmProviderProfile {
    LlmProviderProfile {
        id: String::new(),
        name: " Local model ".into(),
        protocol: LlmProtocol::ChatCompletions,
        endpoint: "http://localhost:1234/v1/".into(),
        model: " model ".into(),
        credential_reference: Some("key-reference".into()),
        context_window: 32768,
        max_output_tokens: None,
        revision: 0,
    }
}

#[test]
fn profiles_persist_selection_and_revision_without_overwriting_other_settings() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    ConfigService::mutate_config(&path, |config| {
        config.tts.playback = TtsPlaybackPreferences {
            speed: 1.5,
            ..Default::default()
        };
        Ok(())
    })
    .unwrap();
    let first = LlmService::upsert_profile(&path, profile()).unwrap();
    let saved = &first.profiles()[0];
    assert!(!saved.id.is_empty());
    assert_eq!(saved.name, "Local model");
    assert_eq!(saved.endpoint, "http://localhost:1234/v1");
    assert_eq!(first.default_profile_id.as_ref(), Some(&saved.id));
    let mut edited = saved.clone();
    edited.model = "another".into();
    let updated = LlmService::upsert_profile(&path, edited).unwrap();
    assert_eq!(updated.profiles().len(), 1);
    assert_eq!(updated.profiles()[0].revision, 2);
    assert_eq!(LlmService::get_config(&path).unwrap(), updated);
    assert_eq!(
        ConfigService::load_or_initialize(&path, None)
            .unwrap()
            .tts
            .playback
            .speed,
        1.5
    );
    assert!(LlmService::select_profile(&path, Some("missing".into())).is_err());
    assert_eq!(LlmService::get_config(&path).unwrap(), updated);
    LlmService::select_profile(&path, None).unwrap();
    assert!(LlmService::selected_profile(&path).is_err());
    LlmService::select_profile(&path, Some(saved.id.clone())).unwrap();
    assert_eq!(
        LlmService::selected_profile(&path).unwrap().model,
        "another"
    );
    let removed = LlmService::remove_profile(&path, &saved.id).unwrap();
    assert!(removed.profiles().is_empty());
    assert!(removed.default_profile_id.is_none());
}

#[test]
fn rejects_credentials_in_urls_and_invalid_context_budgets_before_persisting() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    for endpoint in [
        "file:///private/key",
        "https://user:password@example.com/v1",
        "https://example.com/v1?key=secret",
        "https://example.com/v1#secret",
        "not a URL",
    ] {
        let mut value = profile();
        value.endpoint = endpoint.into();
        assert!(LlmService::upsert_profile(&path, value).is_err());
    }
    for context_window in [0, 8191, 2_000_001] {
        let mut value = profile();
        value.context_window = context_window;
        assert!(LlmService::upsert_profile(&path, value).is_err());
    }
    assert!(!path.exists());
}

#[test]
fn provider_models_share_connection_and_keep_stable_selection() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let mut legacy = profile();
    legacy.id = "old-model".into();
    let mut config = serde_json::to_value(crate::models::AppConfig::empty()).unwrap();
    config["llm"] = serde_json::json!({ "profiles": [legacy], "defaultProfileId": "old-model" });
    std::fs::write(&path, serde_json::to_vec(&config).unwrap()).unwrap();
    let migrated = LlmService::get_config(&path).unwrap();
    assert_eq!(migrated.providers[0].models[0].id, "old-model");
    let mut provider = migrated.providers[0].clone();
    provider.models.push(crate::models::LlmModel {
        id: "second-model".into(),
        model: "second".into(),
        context_window: 65536,
        max_output_tokens: None,

        revision: 0,
    });
    LlmService::upsert_provider(&path, provider.clone()).unwrap();
    LlmService::select_profile(&path, Some("second-model".into())).unwrap();
    let selected = LlmService::selected_profile(&path).unwrap();
    assert_eq!(selected.model, "second");
    assert_eq!(
        selected.credential_reference.as_deref(),
        Some("key-reference")
    );
    provider.endpoint = "https://updated.example/v1".into();
    let saved = LlmService::upsert_provider(&path, provider.clone()).unwrap();
    assert!(saved
        .profiles()
        .iter()
        .all(|p| p.endpoint == provider.endpoint));
    assert_eq!(saved.default_profile_id.as_deref(), Some("second-model"));
    let on_disk: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert!(on_disk["llm"].get("profiles").is_none());
    assert_eq!(on_disk["llm"]["providers"].as_array().unwrap().len(), 1);
    provider.models.pop();
    let saved = LlmService::upsert_provider(&path, provider.clone()).unwrap();
    assert_eq!(saved.default_profile_id.as_deref(), Some("old-model"));
    provider.models.push(provider.models[0].clone());
    assert!(LlmService::upsert_provider(&path, provider).is_err());
    assert_eq!(LlmService::get_config(&path).unwrap(), saved);
}

#[test]
fn legacy_model_labels_are_dropped_and_invalid_limits_do_not_overwrite_config() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let mut provider: LlmProvider = profile().into();
    let mut legacy = serde_json::to_value(&provider).unwrap();
    legacy["models"][0]["displayName"] = serde_json::json!("Fast model");
    provider = serde_json::from_value(legacy).unwrap();
    provider.models[0].max_output_tokens = Some(2048);
    let saved = LlmService::upsert_provider(&path, provider).unwrap();
    assert_eq!(saved.providers[0].models[0].model, profile().model.trim());
    assert!(
        serde_json::to_value(&saved).unwrap()["providers"][0]["models"][0]
            .get("displayName")
            .is_none()
    );
    assert_eq!(
        LlmService::selected_profile(&path)
            .unwrap()
            .max_output_tokens,
        Some(2048)
    );
    assert_eq!(LlmService::get_config(&path).unwrap(), saved);
    for limit in [0, 32769] {
        let mut invalid = saved.providers[0].clone();
        invalid.models[0].max_output_tokens = Some(limit);
        assert!(LlmService::upsert_provider(&path, invalid).is_err());
        assert_eq!(LlmService::get_config(&path).unwrap(), saved);
    }
}

#[tokio::test]
async fn caps_inference_output_using_the_configured_model_limit_for_both_protocols() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    for protocol in [LlmProtocol::ChatCompletions, LlmProtocol::Responses] {
        for (configured, requested, expected) in [
            (Some(1024), 4096, 1024),
            (Some(8192), 4096, 4096),
            (None, 4096, 4096),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let mut model = profile();
            model.endpoint = format!("http://{}", listener.local_addr().unwrap());
            model.protocol = protocol;
            model.max_output_tokens = configured;
            let server = tokio::spawn(async move {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                let body = loop {
                    let mut chunk = [0u8; 4096];
                    let count = stream.read(&mut chunk).await.unwrap();
                    assert!(count > 0);
                    bytes.extend_from_slice(&chunk[..count]);
                    if let Some(offset) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                        if let Ok(body) =
                            serde_json::from_slice::<serde_json::Value>(&bytes[offset + 4..])
                        {
                            break body;
                        }
                    }
                };
                let response = match protocol {
                    LlmProtocol::ChatCompletions => serde_json::json!({"choices":[{"finish_reason":"stop","message":{"content":"{}"}}]}),
                    LlmProtocol::Responses => serde_json::json!({"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"{}"}]}]}),
                }.to_string();
                stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", response.len(),response).as_bytes()).await.unwrap();
                body
            });
            llm::complete_with_output_limit(
                &model,
                None,
                &[],
                serde_json::json!({"type":"object"}),
                requested,
            )
            .await
            .unwrap();
            let body = server.await.unwrap();
            let field = match protocol {
                LlmProtocol::ChatCompletions => "max_completion_tokens",
                LlmProtocol::Responses => "max_output_tokens",
            };
            assert_eq!(body[field], expected);
        }
    }
}

async fn inference_server(
    responses: Vec<(u16, serde_json::Value)>,
) -> (
    LlmProviderProfile,
    tokio::task::JoinHandle<Vec<serde_json::Value>>,
) {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut model = profile();
    model.endpoint = format!("http://{}", listener.local_addr().unwrap());
    model.max_output_tokens = Some(1024);
    let server = tokio::spawn(async move {
        let mut requests = Vec::new();
        for (status, response) in responses {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            loop {
                let mut chunk = [0u8; 4096];
                let count = stream.read(&mut chunk).await.unwrap();
                assert!(count > 0);
                bytes.extend_from_slice(&chunk[..count]);
                if let Some(offset) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    if let Ok(body) =
                        serde_json::from_slice::<serde_json::Value>(&bytes[offset + 4..])
                    {
                        let headers =
                            String::from_utf8_lossy(&bytes[..offset]).to_ascii_lowercase();
                        assert!(headers.contains("authorization: bearer test-key"));
                        requests.push(body);
                        break;
                    }
                }
            }
            let response = response.to_string();
            stream.write_all(format!("HTTP/1.1 {status} Result\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}", response.len()).as_bytes()).await.unwrap();
        }
        requests
    });
    (model, server)
}

#[tokio::test]
async fn retries_unsupported_schema_as_json_without_losing_the_request_contract() {
    use serde_json::json;
    let unsupported = json!({"error":{"message":"This response_format type is unavailable now"}});
    let success =
        json!({"choices":[{"finish_reason":"stop","message":{"content":"{\"ok\":true}"}}]});
    let (model, server) = inference_server(vec![(400, unsupported), (200, success)]).await;
    let messages = [crate::models::LlmMessage {
        role: "user".into(),
        content: "Return ok=true.".into(),
    }];
    let schema = json!({"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":false});
    let result = llm::complete(&model, Some("test-key"), &messages, schema.clone())
        .await
        .unwrap();
    assert_eq!(result, json!({"ok":true}));
    let requests = server.await.unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0]["response_format"]["type"], "json_schema");
    assert_eq!(
        requests[1]["response_format"],
        json!({"type":"json_object"})
    );
    assert!(requests[1]["messages"][0]["content"]
        .as_str()
        .unwrap()
        .contains(&schema.to_string()));
    assert_eq!(requests[1]["messages"][1], json!(messages[0]));
    for request in requests {
        assert_eq!(request["model"], model.model);
        assert_eq!(request["stream"], false);
        assert_eq!(request["max_completion_tokens"], 1024);
    }
}

#[tokio::test]
async fn schema_fallback_does_not_retry_other_errors_or_hide_retry_failures() {
    use serde_json::json;
    let unsupported = json!({"error":{"message":"json_schema is not supported"}});
    let cases = [
        (
            LlmProtocol::ChatCompletions,
            vec![(400, json!({"error":{"message":"Unknown model"}}))],
            "LLM_HTTP_400",
        ),
        (
            LlmProtocol::ChatCompletions,
            vec![(401, unsupported.clone())],
            "LLM_HTTP_401",
        ),
        (
            LlmProtocol::Responses,
            vec![(400, unsupported.clone())],
            "LLM_HTTP_400",
        ),
        (
            LlmProtocol::ChatCompletions,
            vec![(400, unsupported.clone()), (400, unsupported.clone())],
            "LLM_HTTP_400",
        ),
        (
            LlmProtocol::ChatCompletions,
            vec![
                (400, unsupported.clone()),
                (
                    200,
                    json!({"choices":[{"finish_reason":"length","message":{"content":"{}"}}]}),
                ),
            ],
            "LLM_OUTPUT_LIMIT",
        ),
        (
            LlmProtocol::ChatCompletions,
            vec![
                (400, unsupported),
                (
                    200,
                    json!({"choices":[{"finish_reason":"stop","message":{"content":"not JSON"}}]}),
                ),
            ],
            "LLM_INVALID_RESPONSE",
        ),
    ];
    for (protocol, responses, expected) in cases {
        let expected_requests = responses.len();
        let (mut model, server) = inference_server(responses).await;
        model.protocol = protocol;
        let error = llm::complete(&model, Some("test-key"), &[], json!({"type":"object"}))
            .await
            .unwrap_err();
        assert!(error.to_string().contains(expected), "{error}");
        assert_eq!(server.await.unwrap().len(), expected_requests);
    }
}
