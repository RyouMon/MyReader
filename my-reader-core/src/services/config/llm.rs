use std::collections::HashSet;

use crate::{
    models::{LlmConfig, LlmProviderProfile},
    CoreError,
};

pub(crate) fn validate_config(config: &LlmConfig) -> Result<(), CoreError> {
    let mut providers = HashSet::new();
    for provider in &config.providers {
        let mut models = HashSet::new();
        if provider.id.trim().is_empty()
            || !providers.insert(&provider.id)
            || provider.models.is_empty()
            || provider
                .models
                .iter()
                .any(|model| !models.insert(&model.model))
        {
            return Err(CoreError::Config("LLM_INVALID_PROVIDER_MODELS".into()));
        }
    }
    let profiles = config.profiles();
    let mut ids = HashSet::new();
    for profile in &profiles {
        validate_profile(profile)?;
        if !ids.insert(&profile.id) {
            return Err(CoreError::Config("LLM_DUPLICATE_PROFILE".into()));
        }
    }
    if config
        .default_profile_id
        .as_ref()
        .is_some_and(|id| !ids.contains(id))
    {
        return Err(CoreError::Config("LLM_PROFILE_NOT_FOUND".into()));
    }
    Ok(())
}

pub(crate) fn validate_profile(profile: &LlmProviderProfile) -> Result<(), CoreError> {
    if profile.id.trim().is_empty()
        || profile.name.trim().is_empty()
        || profile.model.trim().is_empty()
    {
        return Err(CoreError::Config("LLM_PROFILE_FIELDS_REQUIRED".into()));
    }
    let endpoint = url::Url::parse(&profile.endpoint)
        .map_err(|_| CoreError::Config("LLM_INVALID_ENDPOINT".into()))?;
    if !matches!(endpoint.scheme(), "https" | "http")
        || endpoint.host_str().is_none()
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
    {
        return Err(CoreError::Config("LLM_INVALID_ENDPOINT".into()));
    }
    if !(8_192..=2_000_000).contains(&profile.context_window) {
        return Err(CoreError::Config("LLM_INVALID_CONTEXT_WINDOW".into()));
    }
    if profile
        .max_output_tokens
        .is_some_and(|limit| limit == 0 || limit > profile.context_window)
    {
        return Err(CoreError::Config("LLM_INVALID_OUTPUT_LIMIT".into()));
    }
    Ok(())
}
