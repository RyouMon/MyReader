use crate::{auth::credentials, error::AppError};
use my_reader_core::{api::llm::LlmService, models as core};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::Path;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LlmProtocolDto {
    ChatCompletions,
    Responses,
}

impl From<LlmProtocolDto> for core::LlmProtocol {
    fn from(value: LlmProtocolDto) -> Self {
        match value {
            LlmProtocolDto::ChatCompletions => Self::ChatCompletions,
            LlmProtocolDto::Responses => Self::Responses,
        }
    }
}
impl From<core::LlmProtocol> for LlmProtocolDto {
    fn from(value: core::LlmProtocol) -> Self {
        match value {
            core::LlmProtocol::ChatCompletions => Self::ChatCompletions,
            core::LlmProtocol::Responses => Self::Responses,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LlmProfileDto {
    pub id: String,
    pub name: String,
    pub protocol: LlmProtocolDto,
    pub endpoint: String,
    pub model: String,
    pub context_window: u32,
    #[serde(default)]
    pub has_credential: bool,
}

impl From<LlmProfileDto> for core::LlmProviderProfile {
    fn from(value: LlmProfileDto) -> Self {
        Self {
            id: value.id,
            name: value.name,
            protocol: value.protocol.into(),
            endpoint: value.endpoint,
            model: value.model,
            context_window: value.context_window,
            credential_reference: None,
            revision: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LlmConfigDto {
    pub profiles: Vec<LlmProfileDto>,
    pub default_profile_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LlmProfileInput {
    pub profile: LlmProfileDto,
    pub credential: Option<String>,
    #[serde(default)]
    pub clear_credential: bool,
}

pub struct DesktopLlmService;

impl DesktopLlmService {
    pub fn get_config(path: &Path) -> Result<LlmConfigDto, AppError> {
        config_dto(LlmService::get_config(path)?)
    }

    pub fn upsert(path: &Path, input: LlmProfileInput) -> Result<LlmConfigDto, AppError> {
        let mut profile: core::LlmProviderProfile = input.profile.into();
        if profile.id.is_empty() {
            profile.id = uuid::Uuid::new_v4().to_string();
        }
        let previous = LlmService::get_config(path)?;
        let old_reference = previous
            .profiles
            .iter()
            .find(|item| item.id == profile.id)
            .and_then(|item| item.credential_reference.clone());
        let key = input.credential.filter(|value| !value.trim().is_empty());
        let reference = if input.clear_credential {
            None
        } else if key.is_some() {
            Some(format!("llm-provider-{}", uuid::Uuid::new_v4()))
        } else {
            old_reference.clone()
        };
        profile.credential_reference = reference.clone();
        let config = LlmService::upsert_profile(path, profile)?;
        if !input.clear_credential {
            if let (Some(key), Some(reference)) = (key, &reference) {
                credentials::save_llm_credential(reference, key.trim())?;
            }
        }
        if old_reference != reference {
            if let Some(old) = old_reference {
                credentials::delete_llm_credential(&old)?;
            }
        }
        config_dto(config)
    }

    pub fn remove(path: &Path, id: &str) -> Result<LlmConfigDto, AppError> {
        let previous = LlmService::get_config(path)?;
        let config = LlmService::remove_profile(path, id)?;
        if let Some(reference) = previous
            .profiles
            .iter()
            .find(|profile| profile.id == id)
            .and_then(|profile| profile.credential_reference.as_deref())
        {
            credentials::delete_llm_credential(reference)?;
        }
        config_dto(config)
    }

    pub fn select(path: &Path, id: Option<String>) -> Result<LlmConfigDto, AppError> {
        config_dto(LlmService::select_profile(path, id)?)
    }

    pub async fn models(path: &Path, input: LlmProfileInput) -> Result<Vec<String>, AppError> {
        let credential = input_credential(path, &input)?;
        let mut profile: core::LlmProviderProfile = input.profile.into();
        if profile.id.is_empty() {
            profile.id = "preview".into();
        }
        // Model discovery does not depend on a model having been selected.
        if profile.model.is_empty() {
            profile.model = "discovery".into();
        }
        Ok(LlmService::list_models(&profile, credential.as_deref()).await?)
    }

    pub async fn probe(path: &Path, input: LlmProfileInput) -> Result<(), AppError> {
        let credential = input_credential(path, &input)?;
        let mut profile: core::LlmProviderProfile = input.profile.into();
        if profile.id.is_empty() {
            profile.id = "preview".into();
        }
        Ok(LlmService::probe(&profile, credential.as_deref()).await?)
    }
}

pub fn selected_credential(path: &Path) -> Result<my_reader_core::models::LlmCredential, AppError> {
    let profile = LlmService::selected_profile(path)?;
    let value = profile
        .credential_reference
        .as_deref()
        .map(credentials::read_llm_credential)
        .transpose()
        .map(Option::flatten)?;
    Ok(my_reader_core::models::LlmCredential {
        profile_id: profile.id,
        profile_revision: profile.revision,
        value,
    })
}

fn input_credential(path: &Path, input: &LlmProfileInput) -> Result<Option<String>, AppError> {
    if input.clear_credential {
        return Ok(None);
    }
    if let Some(key) = input
        .credential
        .as_ref()
        .filter(|key| !key.trim().is_empty())
    {
        return Ok(Some(key.trim().to_owned()));
    }
    let config = LlmService::get_config(path)?;
    config
        .profiles
        .iter()
        .find(|profile| profile.id == input.profile.id)
        .and_then(|profile| profile.credential_reference.as_deref())
        .map(credentials::read_llm_credential)
        .transpose()
        .map(Option::flatten)
}

fn config_dto(config: core::LlmConfig) -> Result<LlmConfigDto, AppError> {
    Ok(LlmConfigDto {
        default_profile_id: config.default_profile_id,
        profiles: config
            .profiles
            .into_iter()
            .map(|profile| {
                let has_credential = profile
                    .credential_reference
                    .as_deref()
                    .map(credentials::read_llm_credential)
                    .transpose()?
                    .flatten()
                    .is_some_and(|key| !key.is_empty());
                Ok(LlmProfileDto {
                    id: profile.id,
                    name: profile.name,
                    protocol: profile.protocol.into(),
                    endpoint: profile.endpoint,
                    model: profile.model,
                    context_window: profile.context_window,
                    has_credential,
                })
            })
            .collect::<Result<_, AppError>>()?,
    })
}
