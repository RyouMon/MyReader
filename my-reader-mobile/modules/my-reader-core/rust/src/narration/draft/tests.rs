use super::*;
use my_reader_core::api::llm::LlmService;
use serde_json::json;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct Progress(Arc<Mutex<Vec<(String, String)>>>);
impl NarrationDraftProgress for Progress {
    fn on_progress(&self, kind: String, delta: String) {
        self.0.lock().unwrap().push((kind, delta));
    }
}

fn book() -> CharacterImportRequest {
    CharacterImportRequest {
        book_id: 7.0,
        title: "Novel".into(),
        authors: vec![],
        language: "zh".into(),
    }
}

#[tokio::test]
async fn disabled_books_cannot_search_or_draft_from_the_mobile_adapter() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().to_str().unwrap().to_owned();
    let events = Arc::new(Mutex::new(Vec::new()));
    assert!(narration_search_sources(root.clone(), book())
        .await
        .unwrap_err()
        .to_string()
        .contains("DISABLED"));
    let error = narration_draft_characters(
        root,
        directory
            .path()
            .join("config.json")
            .to_str()
            .unwrap()
            .into(),
        book(),
        CharacterDraftInput::Prompt {
            prompt: "Alice".into(),
        },
        None,
        Box::new(Progress(events.clone())),
    )
    .await
    .unwrap_err();
    assert!(error.to_string().contains("DISABLED"));
    assert!(events.lock().unwrap().is_empty());
}

#[tokio::test]
async fn streaming_draft_preserves_duplicate_identity_without_saving_and_emits_progress() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut bytes = Vec::new();
        let source_url = loop {
            let mut chunk = [0; 4096];
            let count = stream.read(&mut chunk).await.unwrap();
            assert_ne!(count, 0);
            bytes.extend_from_slice(&chunk[..count]);
            if let Some(end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                if let Ok(request) = serde_json::from_slice::<serde_json::Value>(&bytes[end + 4..])
                {
                    assert_eq!(request["stream"], true);
                    assert!(request["messages"][1]["content"]
                        .as_str()
                        .unwrap()
                        .contains("陈默：老师"));
                    let input: serde_json::Value =
                        serde_json::from_str(request["messages"][1]["content"].as_str().unwrap())
                            .unwrap();
                    break input["sources"][0]["url"].as_str().unwrap().to_owned();
                }
            }
        };
        let content =
            json!({"characters":[{"name":"陈默","nicknames":["老陈"],"description":"老师","sourceUrl":source_url}]})
                .to_string();
        let reasoning = json!({"choices":[{"index":0,"delta":{"reasoning_content":"识别人物"}}]});
        let text =
            json!({"choices":[{"index":0,"delta":{"content":content},"finish_reason":"stop"}]});
        let body = format!("data: {reasoning}\n\ndata: {text}\n\ndata: [DONE]\n\n");
        stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
    });
    let directory = tempfile::tempdir().unwrap();
    let config = directory.path().join("config.json");
    LlmService::upsert_profile(
        &config,
        core::LlmProviderProfile {
            id: "test".into(),
            name: "Test".into(),
            protocol: core::LlmProtocol::ChatCompletions,
            endpoint,
            model: "fixture".into(),
            credential_reference: None,
            context_window: 32768,
            max_output_tokens: None,
            revision: 0,
        },
    )
    .unwrap();
    let mut settings = NarrationService::get_settings(directory.path(), 7)
        .await
        .unwrap();
    settings.enabled = true;
    settings.characters.push(core::BookCharacter {
        id: "stable".into(),
        name: "陳默".into(),
        nicknames: vec![],
        description: "Original".into(),
        voice: None,
        instructions: "gentle".into(),
        source: None,
    });
    let original = NarrationService::save_settings(directory.path(), settings)
        .await
        .unwrap();
    let events = Arc::new(Mutex::new(Vec::new()));
    let candidates = narration_draft_characters(
        directory.path().to_str().unwrap().into(),
        config.to_str().unwrap().into(),
        book(),
        CharacterDraftInput::Book {
            passages: vec![CharacterPassage {
                title: "人物介绍".into(),
                text: "陈默：老师".into(),
            }],
        },
        None,
        Box::new(Progress(events.clone())),
    )
    .await
    .unwrap();
    server.await.unwrap();
    assert_eq!(candidates[0].id, "stable");
    assert_eq!(candidates[0].name, "陈默");
    assert_eq!(
        NarrationService::get_settings(directory.path(), 7)
            .await
            .unwrap(),
        original
    );
    let events = events.lock().unwrap();
    assert_eq!(events[0], ("started".into(), String::new()));
    assert!(events
        .iter()
        .any(|(kind, text)| kind == "reasoning" && text == "识别人物"));
    assert!(events
        .iter()
        .any(|(kind, text)| kind == "text" && text.contains("陈默")));
}
