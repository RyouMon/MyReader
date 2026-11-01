use super::*;

pub(super) fn provider(kind: TtsProviderKind) -> TtsProvider {
    TtsProvider {
        id: "provider".into(),
        name: "Provider".into(),
        kind,
        endpoint: "https://dashscope.aliyuncs.com/api/v1".into(),
        credential_reference: Some("shared-reference".into()),
        model_scoped_voices: kind == TtsProviderKind::Qwen,
        voices: if kind == TtsProviderKind::OpenAiCompatible {
            vec!["voice-a".into(), "voice-b".into()]
        } else {
            vec![]
        },
        models: vec![crate::models::TtsModel {
            id: "model-a".into(),
            model: if kind == TtsProviderKind::Qwen {
                "qwen3-tts-flash"
            } else {
                "tts-a"
            }
            .into(),
            response_format: crate::models::TtsAudioFormat::Wav,
            instructions: None,
            default_voice: Some(
                if kind == TtsProviderKind::Qwen {
                    "Cherry"
                } else {
                    "voice-a"
                }
                .into(),
            ),
            voices: vec![],
            revision: 1,
        }],
    }
}

#[test]
fn legacy_migration_keeps_engine_voice_references_and_writes_only_providers() {
    let mut legacy = provider(TtsProviderKind::OpenAiCompatible)
        .profiles()
        .remove(0);
    legacy.revision = 9;
    let config: TtsConfig = serde_json::from_value(serde_json::json!({
        "schemaVersion":1, "profiles":[legacy],
        "defaultEngine":{"kind":"provider","profileId":"model-a"},
        "voiceByLanguage":{"zh":{"engine":"provider","profileId":"model-a","voiceId":"voice-b"}},
        "playback":{"speed":1.5}
    }))
    .unwrap();
    assert_eq!(config.schema_version, 2);
    assert_eq!(config.providers[0].models[0].id, "model-a");
    assert_eq!(config.profiles()[0], legacy);
    assert!(!config.providers[0].model_scoped_voices);
    assert_eq!(config.playback.speed, 1.5);
    let json = serde_json::to_value(&config).unwrap();
    assert!(json.get("profiles").is_none());
    assert_eq!(serde_json::from_value::<TtsConfig>(json).unwrap(), config);
}

#[test]
fn openai_models_share_voices_credentials_and_cleanup_only_deleted_models() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let mut provider = provider(TtsProviderKind::OpenAiCompatible);
    let mut second = provider.models[0].clone();
    second.id = "model-b".into();
    second.model = "tts-b".into();
    second.default_voice = Some("voice-b".into());
    provider.models.push(second);
    let first = TtsService::upsert_provider(&path, provider.clone()).unwrap();
    assert!(first
        .profiles()
        .iter()
        .all(|p| p.options.voices() == provider.voices
            && p.credential_reference == provider.credential_reference));
    TtsService::set_default_engine(
        &path,
        TtsEngineSelection::Provider {
            profile_id: "model-b".into(),
        },
    )
    .unwrap();
    TtsService::set_voice_for_language(
        &path,
        "zh",
        Some(TtsVoiceRef::Provider {
            profile_id: "model-a".into(),
            voice_id: "voice-b".into(),
        }),
    )
    .unwrap();
    provider.endpoint = "https://changed.example/v1".into();
    let changed = TtsService::upsert_provider(&path, provider.clone()).unwrap();
    assert!(changed.profiles().iter().all(|p| p.revision == 2));
    provider.models.pop();
    let removed = TtsService::upsert_provider(&path, provider.clone()).unwrap();
    assert_eq!(removed.default_engine, TtsEngineSelection::System);
    assert!(removed.voice_by_language.contains_key("zh"));
    provider.models.clear();
    assert!(TtsService::upsert_provider(&path, provider).is_err());
    assert_eq!(TtsService::get_config(&path).unwrap(), removed);
}

#[test]
fn qwen_keeps_model_voice_catalogs_separate_and_rejects_foreign_model_ids() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let mut provider = provider(TtsProviderKind::Qwen);
    provider.model_scoped_voices = false;
    provider.models[0].voices = vec!["future-a".into()];
    provider.models[0].default_voice = Some("future-a".into());
    let mut second = provider.models[0].clone();
    second.id = "model-b".into();
    second.model = "qwen3-tts-instruct-flash".into();
    second.instructions = Some("Speak softly".into());
    second.voices = vec!["future-b".into()];
    second.default_voice = Some("future-b".into());
    provider.models.push(second);
    let saved = TtsService::upsert_provider(&path, provider.clone()).unwrap();
    assert!(saved.profiles()[0]
        .options
        .voices()
        .contains(&"future-a".into()));
    assert!(!saved.profiles()[1]
        .options
        .voices()
        .contains(&"future-a".into()));
    assert!(saved.providers[0].voices.is_empty());
    assert!(saved.providers[0].model_scoped_voices);
    let mut other = provider.clone();
    other.id = "other".into();
    assert!(TtsService::upsert_provider(&path, other).is_err());
    assert_eq!(TtsService::get_config(&path).unwrap(), saved);
}

#[test]
fn openai_can_scope_voices_to_models_and_switch_back_without_changing_model_ids() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let mut provider = provider(TtsProviderKind::OpenAiCompatible);
    provider.model_scoped_voices = true;
    provider.voices.clear();
    provider.models[0].voices = vec!["voice-a".into()];
    let mut second = provider.models[0].clone();
    second.id = "model-b".into();
    second.model = "tts-b".into();
    second.voices = vec!["voice-b".into()];
    second.default_voice = Some("voice-b".into());
    provider.models.push(second);
    let saved = TtsService::upsert_provider(&path, provider.clone()).unwrap();
    assert!(saved.providers[0].voices.is_empty());
    assert_eq!(
        saved.profiles()[0].options.voices(),
        &["voice-a".to_string()]
    );
    assert_eq!(
        saved.profiles()[1].options.voices(),
        &["voice-b".to_string()]
    );
    assert_eq!(TtsService::get_config(&path).unwrap(), saved);
    TtsService::set_default_engine(
        &path,
        TtsEngineSelection::Provider {
            profile_id: "model-b".into(),
        },
    )
    .unwrap();
    provider.model_scoped_voices = false;
    provider.voices = vec!["voice-a".into(), "voice-b".into()];
    let shared = TtsService::upsert_provider(&path, provider.clone()).unwrap();
    assert!(shared.providers[0]
        .models
        .iter()
        .all(|model| model.voices.is_empty()));
    assert!(shared
        .profiles()
        .iter()
        .all(|profile| profile.options.voices() == provider.voices));
    assert_eq!(
        shared.default_engine,
        TtsEngineSelection::Provider {
            profile_id: "model-b".into()
        }
    );
}

#[tokio::test]
async fn legacy_labels_are_dropped_without_changing_voice_ids_or_synthesis_revision() {
    for scoped in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let mut provider = provider(TtsProviderKind::OpenAiCompatible);
        provider.model_scoped_voices = scoped;
        provider.models[0].voices = provider.voices.clone();
        let original = TtsService::upsert_provider(&path, provider.clone()).unwrap();
        let mut legacy = serde_json::to_value(provider).unwrap();
        legacy["models"][0]["displayName"] = serde_json::json!("Narrator model");
        legacy["models"][0]["voiceNames"] = serde_json::json!({"voice-a":"Narrator"});
        legacy["voiceNames"] = serde_json::json!({"voice-a":"Narrator"});
        let saved =
            TtsService::upsert_provider(&path, serde_json::from_value(legacy).unwrap()).unwrap();
        assert_eq!(saved, original);
        assert_eq!(TtsService::get_config(&path).unwrap(), saved);
        let voices = TtsService::list_voices(&path, "model-a", None)
            .await
            .unwrap();
        assert!(voices.iter().any(|voice| voice.id == "voice-a"));
        let on_disk = std::fs::read_to_string(&path).unwrap();
        assert!(!on_disk.contains("displayName"));
        assert!(!on_disk.contains("voiceNames"));
    }
}
