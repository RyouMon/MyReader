use super::*;
use crate::{
    models::{BookNarrationSettings, Library},
    services::narration::NarrationService,
};

async fn fixture(kind: TtsProviderKind) -> (tempfile::TempDir, std::path::PathBuf, TtsProvider) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("config.json");
    let mut provider = super::provider_tests::provider(kind);
    provider.models[0].voices = vec!["voice-a".into(), "voice-b".into()];
    provider.models[0].default_voice = Some("voice-a".into());
    let mut other = provider.models[0].clone();
    other.id = "model-b".into();
    other.model = if kind == TtsProviderKind::Qwen {
        "qwen3-tts-instruct-flash"
    } else {
        "tts-b"
    }
    .into();
    provider.models.push(other);
    TtsService::save_provider(&path, provider.clone())
        .await
        .unwrap();
    for id in ["first", "second"] {
        let library: Library = serde_json::from_value(serde_json::json!({
            "id": id, "name": id, "path": directory.path().join(id),
        }))
        .unwrap();
        ConfigService::add_library(&path, library).unwrap();
        let root = directory.path().join("libraries").join(id);
        let mut settings = BookNarrationSettings::new(1);
        let mut character = settings.characters[0].clone();
        character.id = "alice".into();
        character.name = "Alice".into();
        character.instructions = "gentle".into();
        character.voice = Some(voice("model-a", "voice-a"));
        settings.characters.push(character.clone());
        character.id = "bob".into();
        character.name = "Bob".into();
        character.voice = Some(voice("model-b", "voice-a"));
        settings.characters.push(character);
        NarrationService::save_settings(&root, settings)
            .await
            .unwrap();
    }
    TtsService::set_default_engine(
        &path,
        TtsEngineSelection::Provider {
            profile_id: "model-a".into(),
        },
    )
    .unwrap();
    TtsService::set_voice_for_language(&path, "zh", Some(voice("model-a", "voice-a"))).unwrap();
    (directory, path, provider)
}

fn voice(model: &str, voice: &str) -> TtsVoiceRef {
    TtsVoiceRef::Provider {
        profile_id: model.into(),
        voice_id: voice.into(),
    }
}

#[tokio::test]
async fn preview_is_read_only_and_model_deletion_resets_only_affected_bindings() {
    let (directory, path, mut provider) = fixture(TtsProviderKind::OpenAiCompatible).await;
    let root = directory.path().join("libraries/first");
    let before = NarrationService::get_settings(&root, 1).await.unwrap();
    provider.models.remove(0);
    let usages = TtsService::change_usage(
        &path,
        &provider.id,
        &usage::model_voices(&provider.profiles()),
    )
    .await
    .unwrap();
    assert_eq!(
        usages
            .iter()
            .filter(|u| u.character_name.as_deref() == Some("Alice"))
            .count(),
        2
    );
    assert!(usages.iter().any(|u| u.library_name.is_none()));
    assert!(!usages
        .iter()
        .any(|u| u.character_name.as_deref() == Some("Bob")));
    assert_eq!(
        NarrationService::get_settings(&root, 1).await.unwrap(),
        before
    );
    assert_eq!(
        TtsService::get_config(&path).unwrap().providers[0]
            .models
            .len(),
        2
    );

    let config = TtsService::save_provider(&path, provider).await.unwrap();
    assert_eq!(config.default_engine, TtsEngineSelection::System);
    assert!(config.voice_by_language.is_empty());
    for id in ["first", "second"] {
        let after = NarrationService::get_settings(&directory.path().join("libraries").join(id), 1)
            .await
            .unwrap();
        assert_eq!(after.characters[1].voice, None);
        assert_eq!(after.characters[1].instructions, "gentle");
        assert_eq!(after.characters[2].voice, Some(voice("model-b", "voice-a")));
        assert_eq!(after.identity_revision, before.identity_revision);
        assert_eq!(after.revision, before.revision + 1);
    }
}

#[tokio::test]
async fn voice_deletion_respects_model_scope_and_qwen_custom_ids() {
    let (directory, path, mut provider) = fixture(TtsProviderKind::Qwen).await;
    provider.models[0].voices = vec!["voice-b".into()];
    provider.models[0].default_voice = Some("voice-b".into());
    let usages = TtsService::change_usage(
        &path,
        &provider.id,
        &usage::model_voices(&provider.profiles()),
    )
    .await
    .unwrap();
    assert!(usages.iter().all(|u| u.profile_id == "model-a"));
    let config = TtsService::save_provider(&path, provider.clone())
        .await
        .unwrap();
    assert_eq!(config.default_engine, TtsEngineSelection::System);
    assert!(config.voice_by_language.is_empty());
    let root = directory.path().join("libraries/first");
    let mut settings = NarrationService::get_settings(&root, 1).await.unwrap();
    assert_eq!(settings.characters[1].voice, None);
    assert_eq!(
        settings.characters[2].voice,
        Some(voice("model-b", "voice-a"))
    );
    // An unknown ID remains the provider's responsibility, not a deletion.
    settings.characters[1].voice = Some(voice("model-a", "account-custom-voice"));
    NarrationService::save_settings(&root, settings)
        .await
        .unwrap();
    TtsService::save_provider(&path, provider).await.unwrap();
    assert_eq!(
        NarrationService::get_settings(&root, 1)
            .await
            .unwrap()
            .characters[1]
            .voice,
        Some(voice("model-a", "account-custom-voice"))
    );
}

#[tokio::test]
async fn shared_voice_and_provider_deletion_include_every_model() {
    let (directory, path, mut provider) = fixture(TtsProviderKind::OpenAiCompatible).await;
    provider.voices = vec!["voice-b".into()];
    for model in &mut provider.models {
        model.default_voice = Some("voice-b".into());
    }
    let usages = TtsService::change_usage(
        &path,
        &provider.id,
        &usage::model_voices(&provider.profiles()),
    )
    .await
    .unwrap();
    assert_eq!(
        usages.iter().filter(|u| u.character_name.is_some()).count(),
        4
    );
    TtsService::save_provider(&path, provider.clone())
        .await
        .unwrap();
    let root = directory.path().join("libraries/first");
    let mut settings = NarrationService::get_settings(&root, 1).await.unwrap();
    assert!(settings.characters.iter().all(|c| c.voice.is_none()));
    settings.characters[1].voice = Some(voice("model-b", "voice-b"));
    NarrationService::save_settings(&root, settings)
        .await
        .unwrap();
    assert_eq!(
        TtsService::change_usage(&path, &provider.id, &[])
            .await
            .unwrap()
            .len(),
        1
    );
    TtsService::delete_provider(&path, &provider.id)
        .await
        .unwrap();
    assert!(TtsService::get_config(&path).unwrap().providers.is_empty());
    assert!(NarrationService::get_settings(&root, 1)
        .await
        .unwrap()
        .characters
        .iter()
        .all(|c| c.voice.is_none()));
}
