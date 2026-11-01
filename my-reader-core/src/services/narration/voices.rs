use super::*;
use crate::models::{RemovedTtsSelection, TtsVoiceRef};

pub(super) async fn reconcile(
    repository: &NarrationRepository<'_>,
    config_path: &Path,
    settings: BookNarrationSettings,
) -> Result<BookNarrationSettings, CoreError> {
    let profiles = super::super::tts::TtsService::get_config(config_path)?.profiles();
    // Older versions could leave deleted model IDs in character and merge settings.
    // Voice IDs are deliberately not validated against the local voice catalog.
    let missing: HashSet<_> = settings
        .characters
        .iter()
        .chain(
            settings
                .merge_sources
                .iter()
                .flat_map(|source| &source.characters),
        )
        .filter_map(|character| match &character.voice {
            Some(TtsVoiceRef::Provider { profile_id, .. })
                if !profiles.iter().any(|profile| &profile.id == profile_id) =>
            {
                Some(profile_id.clone())
            }
            _ => None,
        })
        .collect();
    if missing.is_empty() {
        return Ok(settings);
    }
    let removed: Vec<_> = missing
        .into_iter()
        .map(|profile_id| RemovedTtsSelection {
            profile_id,
            voices: None,
        })
        .collect();
    repository.reset_tts_references(&removed).await?;
    repository.settings(settings.book_id).await
}
