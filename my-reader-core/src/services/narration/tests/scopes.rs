use super::*;
use crate::models::BookEntry;

fn book(id: i64, series: Option<&str>) -> BookEntry {
    BookEntry {
        id,
        title: format!("Volume {id}"),
        title_sort: String::new(),
        author_sort: String::new(),
        authors: vec!["Writer".into()],
        tags: vec![],
        series: series.map(str::to_owned),
        series_index: Some(id as f64),
        formats: vec!["EPUB".into()],
        has_cover: false,
        path: format!("book-{id}"),
        timestamp: None,
        pubdate: None,
        last_modified: None,
        comment: None,
        publisher: None,
        languages: vec!["en".into()],
        rating: None,
        uuid: None,
    }
}

async fn resolve(
    root: &Path,
    id: i64,
    series: Option<&str>,
    members: &[i64],
) -> BookNarrationSettings {
    let context = LibraryContext::open(root).await.unwrap();
    NarrationRepository::new(context.database())
        .resolve_scope(
            &book(id, series),
            &members
                .iter()
                .map(|id| book(*id, series))
                .collect::<Vec<_>>(),
        )
        .await
        .unwrap()
}

async fn second_config(root: &Path) -> BookNarrationSettings {
    let first = setup(root).await;
    let mut second = BookNarrationSettings::new(43);
    second.enabled = true;
    let mut character = first.characters[1].clone();
    character.id = "other-chen".into();
    character.instructions = "温柔的女声".into();
    second.characters.push(character);
    second.characters.push(BookCharacter {
        id: "lin".into(),
        name: "林岚".into(),
        aliases: vec![],
        identity: "Traveler".into(),
        voice: None,
        instructions: "calm".into(),
        source: None,
    });
    NarrationService::save_settings(root, second).await.unwrap()
}

#[tokio::test]
async fn series_shares_settings_but_unrelated_books_and_detached_volumes_remain_independent() {
    let root = tempfile::tempdir().unwrap();
    let original = setup(root.path()).await;
    let first = resolve(root.path(), 42, Some("Series"), &[42, 43]).await;
    let mut second = resolve(root.path(), 43, Some("Series"), &[42, 43]).await;
    assert_eq!(first.scope_id, second.scope_id);
    assert_eq!(original.characters, second.characters);
    assert!(second.enabled);
    assert_eq!(second.book_id, 43);
    second.characters[1].instructions = "Shared instruction".into();
    let saved = NarrationService::save_settings(root.path(), second)
        .await
        .unwrap();
    let reopened = NarrationService::get_settings(root.path(), 42)
        .await
        .unwrap();
    assert_eq!(reopened.characters, saved.characters);
    assert!(NarrationService::save_settings(root.path(), first)
        .await
        .unwrap_err()
        .to_string()
        .contains("STALE_REQUEST"));
    let unrelated = resolve(root.path(), 44, None, &[]).await;
    assert!(!unrelated.enabled);
    assert_eq!(unrelated.characters.len(), 1);
    let mut detached = resolve(root.path(), 43, None, &[]).await;
    assert_ne!(detached.scope_id, saved.scope_id);
    assert_eq!(detached.characters, saved.characters);
    detached.characters[1].instructions = "Independent again".into();
    NarrationService::save_settings(root.path(), detached)
        .await
        .unwrap();
    assert_eq!(
        NarrationService::get_settings(root.path(), 42)
            .await
            .unwrap()
            .characters[1]
            .instructions,
        "Shared instruction"
    );
}

#[tokio::test]
async fn independently_configured_books_merge_only_after_joining_a_series_and_keep_manual_choices()
{
    let root = tempfile::tempdir().unwrap();
    let second = second_config(root.path()).await;
    assert!(resolve(root.path(), 43, None, &[])
        .await
        .merge_sources
        .is_empty());
    let grouped = resolve(root.path(), 43, Some("Series"), &[42, 43]).await;
    assert_eq!(grouped.merge_sources.len(), 1);
    assert_eq!(grouped.merge_sources[0].characters, second.characters);
    assert_eq!(grouped.merge_sources[0].title, "Volume 43");
    let again = resolve(root.path(), 42, Some("Series"), &[42, 43]).await;
    assert_eq!(again.revision, grouped.revision);
    let config = root.path().join("no-provider.json");
    let mut plan = NarrationService::preview_merge(root.path(), &config, 43, false, None)
        .await
        .unwrap();
    let matched = plan
        .choices
        .iter_mut()
        .find(|choice| choice.character_id == "other-chen")
        .unwrap();
    assert_eq!(matched.target_character_id.as_deref(), Some("char-chen"));
    matched.prefer_incoming = true;
    assert!(
        NarrationService::plan(root.path(), &config, request(1), None)
            .await
            .unwrap_err()
            .to_string()
            .contains("MERGE_REQUIRED")
    );
    let stale = plan.clone();
    let merged = NarrationService::merge_settings(root.path(), 43, plan)
        .await
        .unwrap();
    assert!(merged.merge_sources.is_empty());
    assert_eq!(merged.characters.len(), 3);
    assert_eq!(merged.characters[1].id, "char-chen");
    assert_eq!(merged.characters[1].instructions, "温柔的女声");
    assert_eq!(merged.characters[2].id, "lin");
    assert_eq!(
        NarrationService::get_settings(root.path(), 42)
            .await
            .unwrap()
            .characters,
        merged.characters
    );
    assert!(NarrationService::merge_settings(root.path(), 43, stale)
        .await
        .unwrap_err()
        .to_string()
        .contains("STALE_REQUEST"));
}

#[tokio::test]
async fn model_merge_only_matches_identities_and_cannot_rewrite_voice_settings() {
    let root = tempfile::tempdir().unwrap();
    second_config(root.path()).await;
    resolve(root.path(), 43, Some("Series"), &[42, 43]).await;
    let server = fixture().await;
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    let plan = NarrationService::preview_merge(root.path(), &config, 43, true, None)
        .await
        .unwrap();
    let captured = server.requests.lock().unwrap()[0].to_string();
    assert!(!captured.contains("voice-provider"));
    assert!(!captured.contains("温柔的女声"));
    assert_eq!(server.requests.lock().unwrap().len(), 1);
    let mut invalid = plan.clone();
    invalid.choices[1].target_character_id = Some("invented".into());
    assert!(NarrationService::merge_settings(root.path(), 43, invalid)
        .await
        .unwrap_err()
        .to_string()
        .contains("PLAN_INVALID"));
    let merged = NarrationService::merge_settings(root.path(), 43, plan)
        .await
        .unwrap();
    assert_eq!(merged.characters[1].instructions, "沉稳的男声");
}

#[tokio::test]
async fn editing_shared_settings_cancels_another_volumes_inflight_plan_and_keeps_history_book_local(
) {
    let root = tempfile::tempdir().unwrap();
    setup(root.path()).await;
    resolve(root.path(), 42, Some("Series"), &[42, 43]).await;
    let server = fixture().await;
    let config = root.path().join("config.json");
    LlmService::upsert_profile(&config, profile(server.endpoint.clone())).unwrap();
    NarrationService::plan(root.path(), &config, request(1), None)
        .await
        .unwrap();
    let mut other = request(2);
    other.book_id = 43;
    other.text = "Other volume".into();
    NarrationService::plan(root.path(), &config, other, None)
        .await
        .unwrap();
    assert_eq!(
        server.requests.lock().unwrap()[1]["messages"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let mut slow = request(3);
    slow.text = "slow".into();
    let pending = NarrationService::plan(root.path(), &config, slow, None);
    let edit = async {
        tokio::time::sleep(std::time::Duration::from_millis(40)).await;
        let mut settings = NarrationService::get_settings(root.path(), 43)
            .await
            .unwrap();
        settings.characters[1].instructions = "new instruction".into();
        NarrationService::save_settings(root.path(), settings)
            .await
            .unwrap();
    };
    let (result, _) = tokio::join!(pending, edit);
    assert!(result.unwrap_err().to_string().contains("STALE_REQUEST"));
}
