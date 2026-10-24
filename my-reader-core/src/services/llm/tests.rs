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
    let saved = &first.profiles[0];
    assert!(!saved.id.is_empty());
    assert_eq!(saved.name, "Local model");
    assert_eq!(saved.endpoint, "http://localhost:1234/v1");
    assert_eq!(first.default_profile_id.as_ref(), Some(&saved.id));
    let mut edited = saved.clone();
    edited.model = "another".into();
    let updated = LlmService::upsert_profile(&path, edited).unwrap();
    assert_eq!(updated.profiles.len(), 1);
    assert_eq!(updated.profiles[0].revision, 2);
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
    assert!(removed.profiles.is_empty());
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
