use super::config::{llm::validate_profile, ConfigService};
use crate::{
    infrastructure::llm,
    models::{LlmConfig, LlmProviderProfile},
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
        profile.id = profile.id.trim().to_owned();
        if profile.id.is_empty() {
            profile.id = Uuid::new_v4().to_string();
        }
        profile.name = profile.name.trim().to_owned();
        profile.model = profile.model.trim().to_owned();
        profile.endpoint = profile.endpoint.trim().trim_end_matches('/').to_owned();
        validate_profile(&profile)?;
        Ok(ConfigService::mutate_config(path, |config| {
            if let Some(existing) = config
                .llm
                .profiles
                .iter_mut()
                .find(|item| item.id == profile.id)
            {
                profile.revision = existing.revision.saturating_add(1);
                *existing = profile;
            } else {
                profile.revision = 1;
                if config.llm.default_profile_id.is_none() {
                    config.llm.default_profile_id = Some(profile.id.clone());
                }
                config.llm.profiles.push(profile);
            }
            Ok(())
        })?
        .llm)
    }

    pub fn remove_profile(path: &Path, id: &str) -> Result<LlmConfig, CoreError> {
        Ok(ConfigService::mutate_config(path, |config| {
            config.llm.profiles.retain(|profile| profile.id != id);
            if config.llm.default_profile_id.as_deref() == Some(id) {
                config.llm.default_profile_id = config
                    .llm
                    .profiles
                    .first()
                    .map(|profile| profile.id.clone());
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
            .profiles
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
