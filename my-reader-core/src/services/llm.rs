use super::config::{llm::validate_profile, ConfigService};
use crate::{
    infrastructure::llm,
    models::{LlmConfig, LlmProvider, LlmProviderProfile},
    CoreError,
};
use std::path::Path;
use uuid::Uuid;

pub struct LlmService;

#[cfg(test)]
mod tests;

impl LlmService {
    pub fn get_config(path: &Path) -> Result<LlmConfig, CoreError> {
        Ok(ConfigService::load_or_initialize(path, None)?.llm)
    }

    pub fn upsert_profile(
        path: &Path,
        mut profile: LlmProviderProfile,
    ) -> Result<LlmConfig, CoreError> {
        if profile.id.trim().is_empty() {
            profile.id = Uuid::new_v4().to_string();
        }
        Self::upsert_provider(path, profile.into())
    }

    pub fn upsert_provider(path: &Path, mut provider: LlmProvider) -> Result<LlmConfig, CoreError> {
        provider.id = provider.id.trim().to_owned();
        if provider.id.is_empty() {
            provider.id = Uuid::new_v4().to_string();
        }
        provider.name = provider.name.trim().to_owned();
        provider.endpoint = provider.endpoint.trim().trim_end_matches('/').to_owned();
        for model in &mut provider.models {
            if model.id.trim().is_empty() {
                model.id = Uuid::new_v4().to_string();
            }
            model.model = model.model.trim().to_owned();
            model.display_name = model.display_name.trim().to_owned();
        }
        Ok(ConfigService::mutate_config(path, |config| {
            let previous = config.llm.profiles();
            let resolved = provider.profiles();
            for (model, profile) in provider.models.iter_mut().zip(resolved) {
                validate_profile(&profile)?;
                model.revision = previous
                    .iter()
                    .find(|old| old.id == model.id)
                    .map_or(1, |old| old.revision.saturating_add(1));
            }
            let is_new = !config.llm.providers.iter().any(|old| old.id == provider.id);
            if let Some(old) = config
                .llm
                .providers
                .iter_mut()
                .find(|old| old.id == provider.id)
            {
                *old = provider;
            } else {
                config.llm.providers.push(provider);
            }
            let profiles = config.llm.profiles();
            if (is_new && config.llm.default_profile_id.is_none())
                || config
                    .llm
                    .default_profile_id
                    .as_ref()
                    .is_some_and(|id| !profiles.iter().any(|profile| &profile.id == id))
            {
                config.llm.default_profile_id = profiles.first().map(|profile| profile.id.clone());
            }
            Ok(())
        })?
        .llm)
    }

    pub fn remove_profile(path: &Path, id: &str) -> Result<LlmConfig, CoreError> {
        Self::remove_provider(path, id)
    }

    pub fn remove_provider(path: &Path, id: &str) -> Result<LlmConfig, CoreError> {
        Ok(ConfigService::mutate_config(path, |config| {
            config.llm.providers.retain(|provider| provider.id != id);
            let profiles = config.llm.profiles();
            if config
                .llm
                .default_profile_id
                .as_ref()
                .is_some_and(|id| !profiles.iter().any(|profile| &profile.id == id))
            {
                config.llm.default_profile_id = profiles.first().map(|profile| profile.id.clone());
            }
            Ok(())
        })?
        .llm)
    }

    pub fn select_profile(path: &Path, id: Option<String>) -> Result<LlmConfig, CoreError> {
        Ok(ConfigService::mutate_config(path, |config| {
            config.llm.default_profile_id = id;
            Ok(())
        })?
        .llm)
    }

    pub fn selected_profile(path: &Path) -> Result<LlmProviderProfile, CoreError> {
        let config = Self::get_config(path)?;
        config
            .profiles()
            .into_iter()
            .find(|profile| Some(&profile.id) == config.default_profile_id.as_ref())
            .ok_or_else(|| CoreError::Config("LLM_PROFILE_REQUIRED".into()))
    }

    pub async fn list_models(
        profile: &LlmProviderProfile,
        credential: Option<&str>,
    ) -> Result<Vec<String>, CoreError> {
        validate_profile(profile)?;
        llm::list_models(profile, credential).await
    }

    pub async fn probe(
        profile: &LlmProviderProfile,
        credential: Option<&str>,
    ) -> Result<(), CoreError> {
        validate_profile(profile)?;
        llm::probe(profile, credential).await
    }
}
