use super::*;
use crate::models::{BookCharacter, CharacterImportRequest, LlmProtocol, TtsVoiceRef};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

struct Fixture {
    endpoint: String,
    requests: Arc<Mutex<Vec<Value>>>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn fixture() -> Fixture {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = requests.clone();
    let origin = endpoint.clone();
    let task = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let captured = captured.clone();
            let origin = origin.clone();
            tokio::spawn(async move {
                let mut bytes = Vec::new();
                let (head, body) = loop {
                    let mut chunk = [0; 4096];
                    let count = stream.read(&mut chunk).await.unwrap();
                    if count == 0 {
                        return;
                    }
                    bytes.extend_from_slice(&chunk[..count]);
                    if let Some(end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                        let head = String::from_utf8_lossy(&bytes[..end]).to_string();
                        let length = head
                            .lines()
                            .find_map(|line| {
                                let (name, value) = line.split_once(':')?;
                                name.eq_ignore_ascii_case("content-length")
                                    .then(|| value.trim().parse::<usize>().unwrap())
                            })
                            .unwrap_or(0);
                        if bytes.len() >= end + 4 + length {
                            break (head, bytes[end + 4..end + 4 + length].to_vec());
                        }
                    }
                };
                let request: Value = serde_json::from_slice(&body)
                    .unwrap_or_else(|_| json!({"url":head.lines().next()}));
                captured.lock().unwrap().push(request.clone());
                let response = if head.contains("list=search") {
                    json!({"query":{"search":[{"pageid":1,"title":"Fixture book"}]}})
                } else if head.contains("prop=revisions") {
                    json!({"query":{"pages":[{"revisions":[{"slots":{"main":{"content":"Fixture book by Writer\n== Characters ==\n陈默, also called 老陈, a teacher."}}}]}]}})
                } else {
                    let messages = request["messages"]
                        .as_array()
                        .or_else(|| request["input"].as_array())
                        .unwrap();
                    let system = messages[0]["content"].as_str().unwrap();
                    let result = if system.starts_with("Summarize") {
                        json!({"summary":"The classroom scene continues. char-chen is 陈默, alias 老陈; never change the stable ID."})
                    } else if system.starts_with("Extract") {
                        json!({"characters":[{"name":"陈默","aliases":["老陈"],"identity":"A teacher","sourceUrl":format!("{origin}/w/index.php?curid=1")}]})
                    } else if system.starts_with("You assign") {
                        let input: Value = serde_json::from_str(
                            messages.last().unwrap()["content"].as_str().unwrap(),
                        )
                        .unwrap();
                        if input["text"].as_str().unwrap().contains("slow") {
                            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                        }
                        json!({"segments":[{"text":input["text"],"characterId":"char-chen","delivery":"calm"}]})
                    } else {
                        json!({"ok":true})
                    };
                    if request.get("input").is_some() {
                        json!({"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":result.to_string()}]}]})
                    } else {
                        json!({"choices":[{"finish_reason":"stop","message":{"content":result.to_string()}}]})
                    }
                };
                let body = response.to_string();
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
                let _ = stream.write_all(response.as_bytes()).await;
            });
        }
    });
    Fixture {
        endpoint,
        requests,
        task,
    }
}

fn profile(endpoint: String) -> LlmProviderProfile {
    LlmProviderProfile {
        id: "fixture".into(),
        name: "Fixture".into(),
        protocol: LlmProtocol::ChatCompletions,
        endpoint,
        model: "fixture".into(),
        credential_reference: None,
        context_window: 32768,
        revision: 0,
    }
}

async fn setup(root: &Path) -> BookNarrationSettings {
    let mut settings = BookNarrationSettings::new(42);
    settings.enabled = true;
    settings.characters.push(BookCharacter {
        id: "char-chen".into(),
        name: "陈默".into(),
        aliases: vec!["老陈".into()],
        identity: "A teacher".into(),
        voice: Some(TtsVoiceRef::Provider {
            profile_id: "voice-provider".into(),
            voice_id: "A".into(),
        }),
        instructions: "沉稳的男声".into(),
        source: None,
    });
    NarrationService::save_settings(root, settings)
        .await
        .unwrap()
}

#[tokio::test]
async fn replay_after_a_backtrack_keeps_uncompacted_later_positions_and_excludes_future_text() {
    let root = tempfile::tempdir().unwrap();
    let settings = setup(root.path()).await;
    let context = LibraryContext::open(root.path()).await.unwrap();
    let repository = NarrationRepository::new(context.database());
    let session = repository.session(42, "sha256:fixture").await.unwrap();
    for (position, checkpoint) in [
        (20, None),
        (10, Some((2, 0.1, "Earlier scene".into()))),
        (80, None),
    ] {
        let request = request(position);
        repository
            .commit(
                &session,
                &settings,
                &format!("key-{position}"),
                &request,
                &NarrationPlan::narrator(&request.text),
                checkpoint,
            )
            .await
            .unwrap();
    }
    let checkpoint = repository
        .checkpoint(&session, 0.4, settings.identity_revision)
        .await
        .unwrap();
    let history = repository
        .history(
            &session,
            0.4,
            checkpoint.through_seq,
            checkpoint.position,
            settings.identity_revision,
        )
        .await
        .unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].position, 0.2);
    assert_eq!(history[0].seq, 1);
    let earlier = repository
        .checkpoint(&session, 0.05, settings.identity_revision)
        .await
        .unwrap();
    assert!(earlier.summary.is_empty());
}

#[tokio::test]
async fn speech_preparation_keeps_identity_separate_from_voice_and_delivery() {
    let fixture = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(fixture.endpoint.clone())).unwrap();
    let settings = setup(root.path()).await;
    let fallback = TtsVoiceRef::System {
        voice_id: "default".into(),
    };
    let speech =
        NarrationService::prepare(root.path(), &config, request(1), fallback.clone(), None)
            .await
            .unwrap();
    assert_eq!(speech[0].text, request(1).text);
    assert_eq!(
        speech[0].voice,
        settings.characters[1].voice.clone().unwrap()
    );
    assert_eq!(speech[0].instructions, "沉稳的男声\ncalm");
    assert_eq!(
        speech[0].end_utf16 as usize,
        request(1).text.encode_utf16().count()
    );
    let mut edited = settings.clone();
    edited.characters[1].voice = Some(TtsVoiceRef::Provider {
        profile_id: "other-provider".into(),
        voice_id: "A".into(),
    });
    edited.characters[1].instructions = "温柔的女声".into();
    let edited = NarrationService::save_settings(root.path(), edited)
        .await
        .unwrap();
    let replay = NarrationService::prepare(root.path(), &config, request(1), fallback, None)
        .await
        .unwrap();
    assert_eq!(fixture.requests.lock().unwrap().len(), 1);
    assert_eq!(replay[0].voice, edited.characters[1].voice.clone().unwrap());
    assert_eq!(replay[0].instructions, "温柔的女声\ncalm");
    assert_eq!(edited.identity_revision, settings.identity_revision);
    assert!(NarrationService::save_settings(root.path(), settings)
        .await
        .is_err());
}

fn request(position: usize) -> NarrationRequest {
    NarrationRequest {
        book_id: 42,
        content_version: "sha256:fixture".into(),
        source_key: format!("chapter1:{position}"),
        position: position as f64 / 100.,
        text: format!("老陈说：你好🙂。{position}"),
        before: "A classroom".into(),
        after: String::new(),
    }
}

#[tokio::test]
async fn persistent_conversation_compacts_without_changing_character_identity_or_voice() {
    let fixture = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(fixture.endpoint.clone())).unwrap();
    let settings = setup(root.path()).await;
    for position in 1..=34 {
        let plan = NarrationService::plan(root.path(), &config, request(position), None)
            .await
            .unwrap();
        assert!(!plan.fallback);
        assert_eq!(plan.segments[0].character_id, "char-chen");
    }
    let context = LibraryContext::open(root.path()).await.unwrap();
    let repository = NarrationRepository::new(context.database());
    let session = repository.session(42, "sha256:fixture").await.unwrap();
    let checkpoint = repository
        .checkpoint(&session, 0.35, settings.identity_revision)
        .await
        .unwrap();
    assert!(checkpoint.through_seq > 0);
    assert!(checkpoint.summary.contains("char-chen"));
    let history = repository
        .history(
            &session,
            0.35,
            checkpoint.through_seq,
            checkpoint.position,
            settings.identity_revision,
        )
        .await
        .unwrap();
    assert!(history.len() < 10);
    let db_path = context.path().to_owned();
    drop(context);
    let removal = crate::database::close_database_file(Path::new(&db_path))
        .await
        .unwrap();
    drop(removal);
    assert_eq!(
        NarrationService::get_settings(root.path(), 42)
            .await
            .unwrap(),
        settings
    );
    let count = fixture.requests.lock().unwrap().len();
    let plan = NarrationService::plan(root.path(), &config, request(34), None)
        .await
        .unwrap();
    assert!(!plan.fallback);
    assert_eq!(fixture.requests.lock().unwrap().len(), count);
    NarrationService::plan(root.path(), &config, request(35), None)
        .await
        .unwrap();
    let requests = fixture.requests.lock().unwrap();
    let last = requests.last().unwrap()["messages"].as_array().unwrap();
    assert!(last[0]["content"]
        .as_str()
        .unwrap()
        .contains("classroom scene continues"));
    assert!(last.len() > 2);
    assert!(last.len() < 20);
}

#[tokio::test]
async fn encyclopedia_import_searches_reads_and_keeps_verified_provenance() {
    let fixture = fixture().await;
    let candidates = import::fixture_import(
        &fixture.endpoint,
        &CharacterImportRequest {
            book_id: 42,
            title: "Fixture book".into(),
            authors: vec!["Writer".into()],
            language: "zh".into(),
        },
        &profile(fixture.endpoint.clone()),
    )
    .await
    .unwrap();
    assert_eq!(candidates[0].aliases, vec!["老陈"]);
    assert_eq!(
        candidates[0].source.url,
        format!("{}/w/index.php?curid=1", fixture.endpoint)
    );
    let requests = fixture.requests.lock().unwrap();
    assert!(requests.iter().any(|request| request["url"]
        .as_str()
        .is_some_and(|url| url.contains("list=search"))));
    assert!(requests.iter().any(|request| request["url"]
        .as_str()
        .is_some_and(|url| url.contains("prop=revisions"))));
}

#[tokio::test]
async fn voice_edits_reuse_analysis_but_manual_identity_edits_invalidate_it() {
    let fixture = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(fixture.endpoint.clone())).unwrap();
    let mut settings = setup(root.path()).await;
    NarrationService::plan(root.path(), &config, request(1), None)
        .await
        .unwrap();
    settings.characters[1].instructions = "温柔的女声".into();
    settings = NarrationService::save_settings(root.path(), settings)
        .await
        .unwrap();
    NarrationService::plan(root.path(), &config, request(1), None)
        .await
        .unwrap();
    assert_eq!(fixture.requests.lock().unwrap().len(), 1);
    settings.characters[1].identity = "Corrected identity".into();
    NarrationService::save_settings(root.path(), settings)
        .await
        .unwrap();
    NarrationService::plan(root.path(), &config, request(1), None)
        .await
        .unwrap();
    assert_eq!(fixture.requests.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn disabled_mode_makes_no_model_requests_and_rejects_inflight_commit() {
    let fixture = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(fixture.endpoint.clone())).unwrap();
    assert!(
        NarrationService::plan(root.path(), &config, request(1), None)
            .await
            .unwrap()
            .fallback
    );
    assert!(fixture.requests.lock().unwrap().is_empty());
    let mut settings = setup(root.path()).await;
    let mut slow = request(1);
    slow.text = "slow".into();
    let pending = NarrationService::plan(root.path(), &config, slow, None);
    let disable = async {
        tokio::time::sleep(std::time::Duration::from_millis(40)).await;
        settings.enabled = false;
        NarrationService::save_settings(root.path(), settings)
            .await
            .unwrap();
    };
    let (result, _) = tokio::join!(pending, disable);
    assert!(result.unwrap_err().to_string().contains("STALE_REQUEST"));
}

#[tokio::test]
async fn backtracking_excludes_future_scene_context_and_responses_protocol_works() {
    let fixture = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let mut provider = profile(fixture.endpoint.clone());
    provider.protocol = LlmProtocol::Responses;
    LlmService::upsert_profile(&config, provider).unwrap();
    setup(root.path()).await;
    let mut future = request(90);
    future.text = "FUTURE_SECRET".into();
    NarrationService::plan(root.path(), &config, future, None)
        .await
        .unwrap();
    assert!(
        !NarrationService::plan(root.path(), &config, request(10), None)
            .await
            .unwrap()
            .fallback
    );
    let requests = fixture.requests.lock().unwrap();
    assert!(!requests
        .last()
        .unwrap()
        .to_string()
        .contains("FUTURE_SECRET"));
    assert_eq!(requests.last().unwrap()["store"], false);
}

#[test]
fn validates_exact_unicode_source_coverage_and_unknown_identity_falls_back() {
    let settings = BookNarrationSettings::new(1);
    let value = json!({"segments":[{"text":"你🙂","characterId":"unknown","delivery":"angry"},{"text":" 好","characterId":"narrator","delivery":""}]});
    let plan = validate_plan("你🙂 好", &value, &settings).unwrap();
    assert_eq!(plan.segments[0].end_utf16, 3);
    assert_eq!(plan.segments[1].start_utf16, 3);
    assert_eq!(plan.segments[0].character_id, NARRATOR_ID);
    assert!(plan.segments[0].delivery.is_empty());
    for text in ["你🙂好", "你🙂 好。", "你🙂 不好", ""] {
        assert!(validate_plan(text, &value, &settings).is_err());
    }
}
