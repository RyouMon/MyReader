use super::*;
use crate::models::{
    CharacterDraftInput, CharacterDraftRequest, CharacterPassage, CharacterSource,
};

fn draft_request(input: CharacterDraftInput) -> CharacterDraftRequest {
    CharacterDraftRequest {
        book: CharacterImportRequest {
            book_id: 42,
            title: "Fixture book".into(),
            authors: vec!["Writer".into()],
            language: "zh".into(),
        },
        input,
    }
}

#[tokio::test]
async fn book_passages_are_context_only_and_do_not_change_the_saved_roster() {
    let server = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let original = setup(root.path()).await;
    let request = draft_request(CharacterDraftInput::Book {
        passages: vec![CharacterPassage {
            title: "人物介绍".into(),
            text: "陈默（老陈）：老师。".into(),
        }],
    });
    let events = std::sync::Mutex::new(Vec::new());
    let progress = |event| events.lock().unwrap().push(event);
    let candidates = NarrationService::draft_characters_with_progress(
        root.path(),
        &config,
        request,
        None,
        Some(&progress),
    )
    .await
    .unwrap();
    {
        let events = events.lock().unwrap();
        assert_eq!(events[0], crate::models::LlmStreamEvent::Started);
        assert!(
            matches!(&events[1], crate::models::LlmStreamEvent::Text(text) if text.contains("陈默"))
        );
    }
    assert_eq!(candidates[0].name, "陈默");
    assert_eq!(candidates[0].id, "char-chen");
    assert!(candidates[0].source.is_none());
    assert_eq!(
        NarrationService::get_settings(root.path(), 42)
            .await
            .unwrap(),
        original
    );
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    let input: Value =
        serde_json::from_str(requests[0]["messages"][1]["content"].as_str().unwrap()).unwrap();
    assert_eq!(input["sources"][0]["content"], "陈默（老陈）：老师。");
}

#[tokio::test]
async fn duplicate_detection_uses_only_the_name_and_ignores_nicknames() {
    let server = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let mut settings = setup(root.path()).await;
    for name in ["老陈", "陈末"] {
        settings.characters[1].name = name.into();
        settings.characters[1].nicknames = vec!["陈默".into()];
        settings = NarrationService::save_settings(root.path(), settings)
            .await
            .unwrap();
        let candidates = NarrationService::draft_characters(
            root.path(),
            &config,
            draft_request(CharacterDraftInput::Prompt {
                prompt: "陈默（老陈）：老师。".into(),
            }),
            None,
        )
        .await
        .unwrap();
        assert_eq!(candidates[0].name, "陈默");
        assert!(candidates[0].id.is_empty());
        assert_eq!(
            NarrationService::get_settings(root.path(), 42)
                .await
                .unwrap(),
            settings
        );
    }
}

#[tokio::test]
async fn normalized_and_exact_names_use_the_same_replacement_without_saving() {
    let server = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let mut settings = setup(root.path()).await;
    for name in ["陈默", "陳默", "陳　默"] {
        settings.characters[1].name = name.into();
        settings = NarrationService::save_settings(root.path(), settings)
            .await
            .unwrap();
        let candidates = NarrationService::draft_characters(
            root.path(),
            &config,
            draft_request(CharacterDraftInput::Prompt {
                prompt: "陈默：老师。".into(),
            }),
            None,
        )
        .await
        .unwrap();
        assert_eq!(candidates[0].id, "char-chen");
        assert_eq!(candidates[0].name, "陈默");
        assert_eq!(
            NarrationService::get_settings(root.path(), 42)
                .await
                .unwrap(),
            settings
        );
    }
}

#[tokio::test]
async fn exact_spelling_takes_precedence_when_old_roster_has_both_scripts() {
    let server = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let mut settings = setup(root.path()).await;
    let mut exact = settings.characters[1].clone();
    exact.id = "char-exact".into();
    settings.characters[1].name = "陳默".into();
    settings.characters.push(exact);
    let original = NarrationService::save_settings(root.path(), settings)
        .await
        .unwrap();
    let candidates = NarrationService::draft_characters(
        root.path(),
        &config,
        draft_request(CharacterDraftInput::Prompt {
            prompt: "陈默：老师。".into(),
        }),
        None,
    )
    .await
    .unwrap();
    assert_eq!(candidates[0].id, "char-exact");
    assert_eq!(
        NarrationService::get_settings(root.path(), 42)
            .await
            .unwrap(),
        original
    );
}

#[tokio::test]
async fn duplicate_variants_within_and_across_batches_keep_one_original_name() {
    let server = fixture().await;
    let mut provider = profile(server.endpoint.clone());
    provider.model = "name-variants".into();
    let sources = ["first character", "second character"]
        .map(|content| json!({"title":"Cast","url":"prompt","content":content}));
    let request = draft_request(CharacterDraftInput::Prompt {
        prompt: String::new(),
    });
    let candidates = import::extract_sources(&sources, &request.book, &provider, None, None, None)
        .await
        .unwrap();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].name, "陳默");
    assert_eq!(candidates[0].nicknames, ["老陈", "老师"]);
}

#[tokio::test]
async fn extraction_batches_merge_only_identical_names() {
    let server = fixture().await;
    let mut provider = profile(server.endpoint.clone());
    provider.model = "shared-nickname".into();
    let sources = ["first character", "second character", "first character"]
        .map(|content| json!({"title":"Cast","url":"prompt","content":content}));
    let request = draft_request(CharacterDraftInput::Prompt {
        prompt: String::new(),
    });
    let candidates = import::extract_sources(&sources, &request.book, &provider, None, None, None)
        .await
        .unwrap();
    assert_eq!(
        candidates
            .iter()
            .map(|candidate| candidate.name.as_str())
            .collect::<Vec<_>>(),
        ["陈默", "老陈"]
    );
}

#[tokio::test]
async fn draft_rejects_duplicate_targets_when_the_saved_roster_changes() {
    let server = fixture().await;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let mut provider = profile(server.endpoint.clone());
    provider.model = "slow-draft".into();
    LlmService::upsert_profile(&config, provider).unwrap();
    let mut settings = setup(root.path()).await;
    let pending = NarrationService::draft_characters(
        root.path(),
        &config,
        draft_request(CharacterDraftInput::Prompt {
            prompt: "陈默：老师。".into(),
        }),
        None,
    );
    let rename = async {
        server.slow_request.notified().await;
        settings.characters[1].name = "New name".into();
        NarrationService::save_settings(root.path(), settings)
            .await
            .unwrap();
        server.release_slow.notify_one();
    };
    let (result, _) = tokio::join!(pending, rename);
    assert!(result.unwrap_err().to_string().contains("STALE_REQUEST"));
    assert_eq!(
        NarrationService::get_settings(root.path(), 42)
            .await
            .unwrap()
            .characters[1]
            .name,
        "New name"
    );
}

#[tokio::test]
async fn empty_or_unreliable_introductions_report_not_found() {
    let server = fixture().await;
    let mut provider = profile(server.endpoint.clone());
    let empty = draft_request(CharacterDraftInput::Book { passages: vec![] });
    assert!(
        draft::draft(&server.endpoint, &empty, &provider, None, None)
            .await
            .unwrap_err()
            .to_string()
            .contains("CHARACTERS_NOT_FOUND")
    );
    assert!(server.requests.lock().unwrap().is_empty());
    provider.model = "no-characters".into();
    let unreadable = draft_request(CharacterDraftInput::Book {
        passages: vec![CharacterPassage {
            title: "人物介绍".into(),
            text: "人物介绍见插图。".into(),
        }],
    });
    assert!(
        draft::draft(&server.endpoint, &unreadable, &provider, None, None)
            .await
            .unwrap_err()
            .to_string()
            .contains("CHARACTERS_NOT_FOUND")
    );
}

#[tokio::test]
async fn encyclopedia_search_waits_for_source_selection_before_reading_or_using_llm() {
    let server = fixture().await;
    let mut request = draft_request(CharacterDraftInput::Prompt {
        prompt: String::new(),
    });
    let choices =
        crate::infrastructure::encyclopedia::search_sources(&server.endpoint, &request.book)
            .await
            .unwrap();
    assert_eq!(choices.len(), 1);
    assert!(server.requests.lock().unwrap().iter().all(|r| r["url"]
        .as_str()
        .is_some_and(|url| url.contains("list=search"))));
    server.requests.lock().unwrap().clear();
    request.input = CharacterDraftInput::Encyclopedia {
        source: choices[0].clone(),
    };
    let candidates = draft::draft(
        &server.endpoint,
        &request,
        &profile(server.endpoint.clone()),
        None,
        None,
    )
    .await
    .unwrap();
    assert_eq!(candidates.len(), 31);
    assert_eq!(candidates[0].source.as_ref(), Some(&choices[0]));
    assert!(!server.requests.lock().unwrap().iter().any(|r| r["url"]
        .as_str()
        .is_some_and(|url| url.contains("list=search"))));
}

#[tokio::test]
async fn encyclopedia_connection_failures_keep_the_network_error_category() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let request = draft_request(CharacterDraftInput::Prompt {
        prompt: String::new(),
    });
    let source = CharacterSource {
        title: "Cast".into(),
        url: format!("{origin}/w/index.php?curid=1"),
    };
    for result in [
        crate::infrastructure::encyclopedia::search_sources(&origin, &request.book).await,
        crate::infrastructure::encyclopedia::read_cast(&origin, &source)
            .await
            .map(|_| Vec::new()),
    ] {
        assert!(matches!(result, Err(CoreError::Request(error)) if error.is_connect()));
    }
}

#[tokio::test]
async fn custom_input_keeps_user_facts_without_fabricating_a_web_source() {
    let server = fixture().await;
    let request = draft_request(CharacterDraftInput::Prompt {
        prompt: "陈默是老师，别名老陈，请整理成简短的人物身份。".into(),
    });
    let mut provider = profile(server.endpoint.clone());
    let values = draft::draft(&server.endpoint, &request, &provider, None, None)
        .await
        .unwrap();
    assert!(values[0].source.is_none());
    assert_eq!(values[0].nicknames, ["老陈"]);
    provider.model = "invalid-source".into();
    assert!(
        draft::draft(&server.endpoint, &request, &provider, None, None)
            .await
            .unwrap_err()
            .to_string()
            .contains("SOURCE_INVALID")
    );
}

#[tokio::test]
async fn invalid_encyclopedia_sources_are_rejected_before_network_access() {
    let server = fixture().await;
    for url in [
        "https://unverified.invalid/w/index.php?curid=1".to_string(),
        format!("{}/other?curid=1", server.endpoint),
        format!("{}/w/index.php?curid=0", server.endpoint),
    ] {
        let request = draft_request(CharacterDraftInput::Encyclopedia {
            source: CharacterSource {
                title: "Untrusted".into(),
                url,
            },
        });
        assert!(draft::draft(
            &server.endpoint,
            &request,
            &profile(server.endpoint.clone()),
            None,
            None
        )
        .await
        .unwrap_err()
        .to_string()
        .contains("SOURCE_INVALID"));
    }
    assert!(server.requests.lock().unwrap().is_empty());
}
