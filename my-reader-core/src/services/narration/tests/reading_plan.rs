use super::*;

fn voice() -> TtsVoiceRef {
    TtsVoiceRef::System {
        voice_id: "system".into(),
    }
}

#[tokio::test]
async fn analysis_reports_model_output_and_cached_plans_do_not_generate_again() {
    use crate::models::LlmStreamEvent;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let server = fixture().await;
    setup(root.path()).await;
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let events = std::sync::Mutex::new(Vec::new());
    let progress = |event| events.lock().unwrap().push(event);
    let requests = vec![request(1), request(2)];
    NarrationService::analyze_batch_with_progress(
        root.path(),
        &config,
        requests.clone(),
        None,
        Some(&progress),
    )
    .await
    .unwrap();
    {
        let mut events = events.lock().unwrap();
        assert!(matches!(events.first(), Some(LlmStreamEvent::Started)));
        assert!(events
            .iter()
            .any(|event| matches!(event, LlmStreamEvent::Text(text) if text.contains("segments"))));
        events.clear();
    }
    NarrationService::analyze_batch_with_progress(
        root.path(),
        &config,
        requests,
        None,
        Some(&progress),
    )
    .await
    .unwrap();
    assert!(events.lock().unwrap().is_empty());
    assert_eq!(server.requests.lock().unwrap().len(), 1);
    assert_eq!(
        NarrationService::reading_plan(root.path(), &config, 42, "sha256:fixture", voice())
            .await
            .unwrap()
            .len(),
        2
    );
}

#[tokio::test]
async fn saving_analysis_waits_for_another_library_writer() {
    use std::time::Duration;
    let root = tempfile::tempdir().unwrap();
    let settings = setup(root.path()).await;
    let context = LibraryContext::open(root.path()).await.unwrap();
    let repository = NarrationRepository::new(context.database());
    let source = request(1);
    let session = repository
        .session(42, &source.content_version)
        .await
        .unwrap();
    let writer = rusqlite::Connection::open(context.path()).unwrap();
    writer.execute_batch("BEGIN IMMEDIATE").unwrap();
    let plan = NarrationPlan {
        fallback: false,
        ..NarrationPlan::narrator(&source.text)
    };
    let mut save =
        Box::pin(repository.commit(&session, &settings, "concurrent", &source, &plan, None));
    assert!(tokio::time::timeout(Duration::from_millis(100), &mut save)
        .await
        .is_err());
    writer.execute_batch("ROLLBACK").unwrap();
    save.await.unwrap();
    assert_eq!(
        repository.cached(&session, "concurrent").await.unwrap(),
        Some(plan)
    );
}

#[tokio::test]
async fn chapter_analysis_is_reused_by_playback_and_voice_changes() {
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let server = fixture().await;
    let mut settings = setup(root.path()).await;
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let requests = (1..=8).map(request).collect::<Vec<_>>();
    NarrationService::analyze_batch(root.path(), &config, requests.clone(), None)
        .await
        .unwrap();
    assert_eq!(server.requests.lock().unwrap().len(), 1);
    let entries =
        NarrationService::reading_plan(root.path(), &config, 42, "sha256:fixture", voice())
            .await
            .unwrap();
    assert_eq!(entries.len(), 8);
    for (source, entry) in requests.iter().zip(&entries) {
        let jobs = NarrationService::prepare(root.path(), &config, source.clone(), voice(), None)
            .await
            .unwrap();
        assert_eq!(jobs, vec![entry.speech.clone()]);
        assert_eq!(entry.source_key, source.source_key);
    }
    settings.characters[1].instructions = "温柔".into();
    settings.characters[1].voice = Some(voice());
    NarrationService::save_settings(root.path(), settings)
        .await
        .unwrap();
    let changed =
        NarrationService::reading_plan(root.path(), &config, 42, "sha256:fixture", voice())
            .await
            .unwrap();
    assert_eq!(changed[0].id, entries[0].id);
    assert_eq!(changed[0].speech.instructions, "温柔\ncalm");
    assert_eq!(changed[0].speech.voice, voice());
    NarrationService::analyze_batch(root.path(), &config, requests, None)
        .await
        .unwrap();
    assert_eq!(server.requests.lock().unwrap().len(), 1);
    assert!(
        NarrationService::reading_plan(root.path(), &config, 42, "different-edition", voice())
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn legacy_missing_models_reset_bindings_without_erasing_annotations() {
    use crate::services::tts::TtsService;
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let server = fixture().await;
    let mut settings = setup(root.path()).await;
    add_tts_profile(&config, "voice-provider");
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    NarrationService::analyze_batch(root.path(), &config, vec![request(1)], None)
        .await
        .unwrap();
    let original =
        NarrationService::reading_plan(root.path(), &config, 42, "sha256:fixture", voice())
            .await
            .unwrap();
    assert_eq!(
        original[0].speech.voice,
        settings.characters[1].voice.clone().unwrap()
    );

    TtsService::remove_provider(&config, "voice-provider").unwrap();
    let context = LibraryContext::open(root.path()).await.unwrap();
    let repository = NarrationRepository::new(context.database());
    let restored = voices::reconcile(&repository, &config, settings.clone())
        .await
        .unwrap();
    assert_eq!(restored.characters[1].voice, None);
    assert_eq!(restored.characters[1].id, settings.characters[1].id);
    assert_eq!(
        restored.characters[1].instructions,
        settings.characters[1].instructions
    );
    assert_eq!(restored.identity_revision, settings.identity_revision);
    assert_eq!(restored.revision, settings.revision + 1);
    assert_eq!(
        voices::reconcile(&repository, &config, restored.clone())
            .await
            .unwrap(),
        restored
    );
    settings = restored;
    let fallback =
        NarrationService::reading_plan(root.path(), &config, 42, "sha256:fixture", voice())
            .await
            .unwrap();
    assert_eq!(fallback[0].speech.voice, voice());
    assert_eq!(fallback[0].id, original[0].id);
    assert_eq!(
        NarrationService::get_settings(root.path(), 42)
            .await
            .unwrap()
            .characters[1]
            .voice,
        settings.characters[1].voice
    );

    add_tts_profile(&config, "current-model");
    settings.characters[1].voice = Some(TtsVoiceRef::Provider {
        profile_id: "current-model".into(),
        voice_id: "new-voice".into(),
    });
    settings.characters[1].instructions = "温柔".into();
    NarrationService::save_settings(root.path(), settings.clone())
        .await
        .unwrap();
    let saved = repository.settings(42).await.unwrap();
    assert_eq!(
        voices::reconcile(&repository, &config, saved.clone())
            .await
            .unwrap(),
        saved
    );
    let current =
        NarrationService::reading_plan(root.path(), &config, 42, "sha256:fixture", voice())
            .await
            .unwrap();
    assert_eq!(current[0].id, original[0].id);
    assert_eq!(
        current[0].speech.voice,
        settings.characters[1].voice.clone().unwrap()
    );
    assert_eq!(current[0].speech.instructions, "温柔\ncalm");
    assert_eq!(
        NarrationService::prepare(root.path(), &config, request(1), voice(), None)
            .await
            .unwrap(),
        vec![current[0].speech.clone()]
    );
    // An unlisted voice still reaches the provider; only a missing model inherits the reader voice.
    assert_eq!(server.requests.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn clearing_a_synthesis_chunk_preserves_others_and_never_skips_source_text() {
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let server = fixture().await;
    setup(root.path()).await;
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let mut source = request(1);
    source.text = format!("{}🙂END", "abc ".repeat(1200));
    NarrationService::analyze_batch(root.path(), &config, vec![source.clone()], None)
        .await
        .unwrap();
    let entries =
        NarrationService::reading_plan(root.path(), &config, 42, &source.content_version, voice())
            .await
            .unwrap();
    assert!(entries.len() >= 2);
    assert_eq!(
        entries
            .iter()
            .map(|e| e.speech.text.as_str())
            .collect::<String>(),
        source.text
    );
    NarrationService::clear_reading_plan(
        root.path(),
        42,
        &source.content_version,
        vec![entries[0].id.clone()],
    )
    .await
    .unwrap();
    let retained =
        NarrationService::reading_plan(root.path(), &config, 42, &source.content_version, voice())
            .await
            .unwrap();
    assert_eq!(retained, entries[1..]);
    let playback = NarrationService::prepare(root.path(), &config, source.clone(), voice(), None)
        .await
        .unwrap();
    assert_eq!(
        playback.iter().map(|e| e.text.as_str()).collect::<String>(),
        source.text
    );
    assert_eq!(server.requests.lock().unwrap().len(), 2);
    NarrationService::clear_reading_plan(root.path(), 42, &source.content_version, Vec::new())
        .await
        .unwrap();
    assert!(NarrationService::reading_plan(
        root.path(),
        &config,
        42,
        &source.content_version,
        voice()
    )
    .await
    .unwrap()
    .is_empty());
    assert_eq!(
        NarrationService::get_settings(root.path(), 42)
            .await
            .unwrap()
            .characters
            .len(),
        2
    );
}

#[tokio::test]
async fn clearing_rejects_a_late_batch_commit() {
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let server = fixture().await;
    setup(root.path()).await;
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let mut source = request(1);
    source.text = "slow passage".into();
    let path = root.path().to_owned();
    let config_copy = config.clone();
    let work = tokio::spawn(async move {
        NarrationService::analyze_batch(&path, &config_copy, vec![source], None).await
    });
    server.slow_request.notified().await;
    NarrationService::clear_reading_plan(root.path(), 42, "sha256:fixture", Vec::new())
        .await
        .unwrap();
    server.release_slow.notify_one();
    assert!(work
        .await
        .unwrap()
        .unwrap_err()
        .to_string()
        .contains("STALE_REQUEST"));
    assert!(
        NarrationService::reading_plan(root.path(), &config, 42, "sha256:fixture", voice())
            .await
            .unwrap()
            .is_empty()
    );
}

#[test]
fn compact_output_validates_coverage_anchors_and_unicode() {
    let settings = BookNarrationSettings::new(42);
    let mut source = request(1);
    source.text = "你🙂 好".into();
    let input = vec![source.clone(), request(2)];
    let value = json!({"segments":[
        {"from":"u0","through":"u0","characterId":"narrator","delivery":"","parts":[{"start":"","characterId":"unknown","delivery":"angry"},{"start":" 好","characterId":"narrator","delivery":""}]},
        {"from":"u1","through":"u1","characterId":"narrator","delivery":"","parts":[]}
    ]});
    let plans = compact::decode(&input, &value, &settings).unwrap();
    assert_eq!(plans[0].segments[0].end_utf16, 3);
    assert_eq!(plans[0].segments[1].start_utf16, 3);
    assert_eq!(plans[0].segments[0].character_id, NARRATOR_ID);
    assert!(plans[0].segments[0].delivery.is_empty());
    for (field, invalid) in [("from", "u0"), ("through", "u2")] {
        let mut invalid_value = value.clone();
        invalid_value["segments"][1][field] = json!(invalid);
        assert!(compact::decode(&input, &invalid_value, &settings).is_err());
    }
    let mut missing = value.clone();
    missing["segments"].as_array_mut().unwrap().pop();
    assert!(compact::decode(&input, &missing, &settings).is_err());
    source.text = "你🙂 好 好".into();
    assert!(compact::decode(&[source, request(2)], &value, &settings).is_err());
}

#[tokio::test]
async fn analysis_adapts_to_small_context_and_does_not_mix_books() {
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let server = fixture().await;
    setup(root.path()).await;
    let mut small = profile(server.endpoint.clone());
    small.context_window = 8192;
    small.max_output_tokens = Some(1024);
    LlmService::upsert_profile(&config, small).unwrap();
    let units = (1..=25).map(request).collect::<Vec<_>>();
    NarrationService::analyze_batch(root.path(), &config, units.clone(), None)
        .await
        .unwrap();
    assert!(server.requests.lock().unwrap().len() >= 3);
    assert_eq!(
        NarrationService::reading_plan(root.path(), &config, 42, "sha256:fixture", voice())
            .await
            .unwrap()
            .len(),
        25
    );
    let mut other = request(26);
    other.book_id = 43;
    assert!(NarrationService::analyze_batch(
        root.path(),
        &config,
        vec![units[0].clone(), other],
        None
    )
    .await
    .is_err());
}

#[tokio::test]
async fn oversized_scene_history_is_compressed_in_bounded_batches() {
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    let server = fixture().await;
    let settings = setup(root.path()).await;
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let context = LibraryContext::open(root.path()).await.unwrap();
    let repository = NarrationRepository::new(context.database());
    let session = repository.session(42, "sha256:fixture").await.unwrap();
    for index in 1..=64 {
        let mut source = request(index);
        source.text = "场景描述。".repeat(150);
        let plan = NarrationPlan {
            fallback: false,
            ..NarrationPlan::narrator(&source.text)
        };
        repository
            .commit(
                &session,
                &settings,
                &format!("old-{index}"),
                &source,
                &plan,
                None,
            )
            .await
            .unwrap();
    }
    NarrationService::analyze_batch(root.path(), &config, vec![request(65)], None)
        .await
        .unwrap();
    let calls = server.requests.lock().unwrap();
    let summaries = calls
        .iter()
        .filter(|call| {
            call["messages"][0]["content"]
                .as_str()
                .unwrap()
                .starts_with("Summarize")
        })
        .count();
    assert!(summaries > 1);
    for call in calls.iter() {
        let bytes = call["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["content"].as_str().unwrap().len() + 32)
            .sum::<usize>();
        assert!(bytes + call["max_completion_tokens"].as_u64().unwrap() as usize <= 32768);
    }
}

#[test]
fn adjacent_delivery_runs_merge_without_crossing_characters_or_instructions() {
    let mut source = request(1);
    source.text = "第一句。第二句。第三句。第四句。".into();
    let mut settings = BookNarrationSettings::new(42);
    let mut other = settings.characters[0].clone();
    other.id = "other".into();
    other.name = "Other".into();
    settings.characters.push(other);
    let mut plan = NarrationPlan::narrator(&source.text);
    let base = plan.segments[0].clone();
    plan.segments = (0..4)
        .map(|i| {
            let mut segment = base.clone();
            segment.start_utf16 = i * 4;
            segment.end_utf16 = (i + 1) * 4;
            if i == 2 {
                segment.character_id = "other".into();
            }
            if i == 3 {
                segment.delivery = "angry".into();
            }
            segment
        })
        .collect();
    let entries =
        super::super::reading_plan::resolve(&[], &source, &plan, &settings, &voice(), "key")
            .unwrap();
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0].speech.text, "第一句。第二句。");
    assert_eq!(entries[0].speech.end_utf16, 8);
    assert_eq!(entries[1].character_id, "other");
    assert_eq!(entries[2].speech.instructions, "angry");
    assert_eq!(
        entries
            .iter()
            .map(|e| e.speech.text.as_str())
            .collect::<String>(),
        source.text
    );
}
