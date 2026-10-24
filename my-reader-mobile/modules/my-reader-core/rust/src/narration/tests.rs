use super::*;
use my_reader_core::models as core;

#[tokio::test]
async fn ffi_preserves_book_identity_and_voice_settings_and_exact_fallback_text() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().to_str().unwrap().to_owned();
    let mut settings = narration_get_settings(root.clone(), 7.0).await.unwrap();
    settings.characters.push(
        core::BookCharacter {
            id: "alice".into(),
            name: "Alice".into(),
            aliases: vec!["A".into()],
            identity: "A teacher".into(),
            voice: Some(core::TtsVoiceRef::Provider {
                profile_id: "p".into(),
                voice_id: "a".into(),
            }),
            instructions: "gentle".into(),
            source: Some(core::CharacterSource {
                title: "Novel".into(),
                url: "https://en.wikipedia.org/wiki/Novel".into(),
            }),
        }
        .into(),
    );
    let saved = narration_save_settings(root.clone(), settings)
        .await
        .unwrap();
    let restored = narration_get_settings(root.clone(), 7.0).await.unwrap();
    assert_eq!(restored.revision, saved.revision);
    assert_eq!(restored.characters[1].id, "alice");
    assert_eq!(restored.characters[1].aliases, ["A"]);
    assert_eq!(
        restored.characters[1].source.as_ref().unwrap().title,
        "Novel"
    );
    assert_eq!(
        restored.characters[1]
            .voice
            .as_ref()
            .unwrap()
            .profile_id
            .as_deref(),
        Some("p")
    );
    let result = narration_prepare(
        root.clone(),
        directory
            .path()
            .join("config.json")
            .to_str()
            .unwrap()
            .into(),
        core::NarrationRequest {
            book_id: 7,
            content_version: "v".into(),
            source_key: "locator".into(),
            position: 0.5,
            text: "Hi😀".into(),
            before: "".into(),
            after: "".into(),
        }
        .into(),
        NarrationVoice {
            engine: "system".into(),
            profile_id: None,
            voice_id: "system-a".into(),
        },
        None,
    )
    .await
    .unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].text, "Hi😀");
    assert_eq!(result[0].end_utf16, 4);
    assert_eq!(result[0].voice.voice_id, "system-a");
    let core_speech: core::NarrationSpeech = result[0].clone().try_into().unwrap();
    assert_eq!(core_speech.start_utf16, 0);
    narration_cancel(root.clone(), 7.0).await.unwrap();
    assert!(narration_get_settings(root, 7.5).await.is_err());
}

#[test]
fn ffi_rejects_unknown_voice_engines_and_keeps_import_provenance() {
    for (engine, profile_id) in [("unknown", None), ("provider", None)] {
        assert!(core::TtsVoiceRef::try_from(NarrationVoice {
            engine: engine.into(),
            profile_id,
            voice_id: "a".into()
        })
        .is_err());
    }
    let candidate = core::CharacterImportCandidate {
        name: "Alice".into(),
        aliases: vec!["A".into()],
        identity: "Teacher".into(),
        source: core::CharacterSource {
            title: "Cast".into(),
            url: "https://en.wikipedia.org/wiki/Cast".into(),
        },
    };
    let dto: CharacterImportCandidate = candidate.into();
    let restored: core::CharacterImportCandidate = dto.try_into().unwrap();
    assert_eq!(restored.source.url, "https://en.wikipedia.org/wiki/Cast");
    assert_eq!(restored.aliases, ["A"]);
    let request: CharacterImportRequest = core::CharacterImportRequest {
        book_id: 7,
        title: "Novel".into(),
        authors: vec!["Author".into()],
        language: "en".into(),
    }
    .into();
    let restored: core::CharacterImportRequest = request.try_into().unwrap();
    assert_eq!(restored.book_id, 7);
    assert_eq!(restored.authors, ["Author"]);
}
