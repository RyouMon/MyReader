use std::path::Path;

use super::{ConfigService, TtsService};
use crate::{
    library::LibraryContext,
    models::{
        RemovedTtsSelection, TtsConfig, TtsEngineSelection, TtsModelVoices, TtsProvider,
        TtsProviderProfile, TtsSelectionUsage, TtsVoiceRef,
    },
    repositories::narration::NarrationRepository,
    CoreError,
};

impl TtsService {
    /// Read-only preview. Empty models means removing the provider.
    pub async fn change_usage(
        config_path: &Path,
        provider_id: &str,
        models: &[TtsModelVoices],
    ) -> Result<Vec<TtsSelectionUsage>, CoreError> {
        let config = Self::get_config(config_path)?;
        let previous: Vec<_> = config
            .providers
            .iter()
            .filter(|p| p.id == provider_id)
            .flat_map(TtsProvider::profiles)
            .collect();
        let removed = removed_selections(&previous, models);
        if removed.is_empty() {
            return Ok(Vec::new());
        }
        let mut usages = global_usages(&config, &removed);
        for (name, context) in libraries(config_path).await? {
            for settings in NarrationRepository::new(context.database())
                .tts_settings()
                .await?
            {
                let mut groups = vec![(settings.scope_name.clone(), settings.characters)];
                groups.extend(
                    settings
                        .merge_sources
                        .into_iter()
                        .map(|source| (Some(source.title), source.characters)),
                );
                for (scope_name, characters) in groups {
                    for character in characters {
                        if let Some(TtsVoiceRef::Provider {
                            profile_id,
                            voice_id,
                        }) = character
                            .voice
                            .filter(|voice| removed.iter().any(|item| item.matches(voice)))
                        {
                            usages.push(TtsSelectionUsage {
                                profile_id,
                                voice_id: Some(voice_id),
                                language: None,
                                library_name: Some(name.clone()),
                                scope_name: scope_name.clone(),
                                book_id: Some(settings.book_id),
                                character_name: Some(character.name),
                            });
                        }
                    }
                }
            }
        }
        Ok(usages)
    }

    pub async fn save_provider(
        config_path: &Path,
        provider: TtsProvider,
    ) -> Result<TtsConfig, CoreError> {
        let previous = Self::get_config(config_path)?.profiles();
        let contexts = libraries(config_path).await?;
        let config = Self::upsert_provider(config_path, provider)?;
        reset_references(&contexts, &previous, &config).await?;
        Ok(config)
    }

    pub async fn delete_provider(
        config_path: &Path,
        provider_id: &str,
    ) -> Result<TtsConfig, CoreError> {
        let previous = Self::get_config(config_path)?.profiles();
        let contexts = libraries(config_path).await?;
        let config = Self::remove_provider(config_path, provider_id)?;
        reset_references(&contexts, &previous, &config).await?;
        Ok(config)
    }
}

pub(super) fn model_voices(profiles: &[TtsProviderProfile]) -> Vec<TtsModelVoices> {
    profiles
        .iter()
        .map(|profile| TtsModelVoices {
            id: profile.id.clone(),
            voices: profile.options.voices().to_vec(),
        })
        .collect()
}

pub(super) fn removed_selections(
    previous: &[TtsProviderProfile],
    models: &[TtsModelVoices],
) -> Vec<RemovedTtsSelection> {
    previous
        .iter()
        .filter_map(|old| {
            let next = models.iter().find(|model| model.id == old.id);
            let voices = next.map(|model| {
                old.options
                    .voices()
                    .iter()
                    .filter(|voice| !model.voices.iter().any(|id| id.trim() == voice.as_str()))
                    .cloned()
                    .collect::<Vec<_>>()
            });
            if voices.as_ref().is_some_and(Vec::is_empty) {
                return None;
            }
            Some(RemovedTtsSelection {
                profile_id: old.id.clone(),
                voices,
            })
        })
        .collect()
}

fn global_usages(config: &TtsConfig, removed: &[RemovedTtsSelection]) -> Vec<TtsSelectionUsage> {
    let mut usages = Vec::new();
    if let TtsEngineSelection::Provider { profile_id } = &config.default_engine {
        if removed
            .iter()
            .any(|item| &item.profile_id == profile_id && item.voices.is_none())
        {
            usages.push(TtsSelectionUsage {
                profile_id: profile_id.clone(),
                voice_id: None,
                language: None,
                library_name: None,
                scope_name: None,
                book_id: None,
                character_name: None,
            });
        }
    }
    for (language, voice) in &config.voice_by_language {
        if removed.iter().any(|item| item.matches(voice)) {
            if let TtsVoiceRef::Provider {
                profile_id,
                voice_id,
            } = voice
            {
                usages.push(TtsSelectionUsage {
                    profile_id: profile_id.clone(),
                    voice_id: Some(voice_id.clone()),
                    language: Some(language.clone()),
                    library_name: None,
                    scope_name: None,
                    book_id: None,
                    character_name: None,
                });
            }
        }
    }
    usages
}

async fn libraries(config_path: &Path) -> Result<Vec<(String, LibraryContext)>, CoreError> {
    // Both platform adapters keep sidecars beside config.json in libraries/{id}.
    let root = config_path
        .parent()
        .unwrap_or(Path::new("."))
        .join("libraries");
    let config = ConfigService::load_or_initialize(config_path, None)?;
    let mut contexts = Vec::new();
    for library in config.libraries {
        let sidecar = root.join(&library.id);
        if sidecar.join(".myreader/myreader.db").try_exists()? {
            contexts.push((library.name, LibraryContext::open(&sidecar).await?));
        }
    }
    Ok(contexts)
}

async fn reset_references(
    contexts: &[(String, LibraryContext)],
    previous: &[TtsProviderProfile],
    config: &TtsConfig,
) -> Result<(), CoreError> {
    let removed = removed_selections(previous, &model_voices(&config.profiles()));
    if !removed.is_empty() {
        for (_, context) in contexts {
            NarrationRepository::new(context.database())
                .reset_tts_references(&removed)
                .await?;
        }
    }
    Ok(())
}
