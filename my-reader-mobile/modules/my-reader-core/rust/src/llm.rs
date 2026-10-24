use crate::CoreFfiError;
use my_reader_core::{api::llm::LlmService, models as core};
use std::path::Path;

#[derive(Debug, Clone, uniffi::Record)]
pub struct LlmProviderProfile {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub endpoint: String,
    pub model: String,
    pub context_window: u32,
    pub credential_reference: Option<String>,
    pub revision: u32,
}
#[derive(Debug, Clone, uniffi::Record)]
pub struct LlmConfig {
    pub profiles: Vec<LlmProviderProfile>,
    pub default_profile_id: Option<String>,
}

impl TryFrom<LlmProviderProfile> for core::LlmProviderProfile {
    type Error = CoreFfiError;
    fn try_from(value: LlmProviderProfile) -> Result<Self, Self::Error> {
        Ok(Self {
            id: value.id,
            name: value.name,
            protocol: match value.protocol.as_str() {
                "chatCompletions" => core::LlmProtocol::ChatCompletions,
                "responses" => core::LlmProtocol::Responses,
                _ => return Err(CoreFfiError::Config("LLM_PROTOCOL_INVALID".into())),
            },
            endpoint: value.endpoint,
            model: value.model,
            context_window: value.context_window,
            credential_reference: value.credential_reference,
            revision: value.revision,
        })
    }
}
impl From<core::LlmProviderProfile> for LlmProviderProfile {
    fn from(value: core::LlmProviderProfile) -> Self {
        Self {
            id: value.id,
            name: value.name,
            protocol: match value.protocol {
                core::LlmProtocol::ChatCompletions => "chatCompletions",
                core::LlmProtocol::Responses => "responses",
            }
            .into(),
            endpoint: value.endpoint,
            model: value.model,
            context_window: value.context_window,
            credential_reference: value.credential_reference,
            revision: value.revision,
        }
    }
}
impl From<core::LlmConfig> for LlmConfig {
    fn from(value: core::LlmConfig) -> Self {
        Self {
            profiles: value.profiles.into_iter().map(Into::into).collect(),
            default_profile_id: value.default_profile_id,
        }
    }
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn llm_get_config(config_path: String) -> Result<LlmConfig, CoreFfiError> {
    Ok(LlmService::get_config(Path::new(&config_path))
        .map_err(CoreFfiError::from_core)?
        .into())
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn llm_upsert_profile(
    config_path: String,
    profile: LlmProviderProfile,
) -> Result<LlmConfig, CoreFfiError> {
    Ok(
        LlmService::upsert_profile(Path::new(&config_path), profile.try_into()?)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn llm_remove_profile(
    config_path: String,
    profile_id: String,
) -> Result<LlmConfig, CoreFfiError> {
    Ok(
        LlmService::remove_profile(Path::new(&config_path), &profile_id)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn llm_select_profile(
    config_path: String,
    profile_id: Option<String>,
) -> Result<LlmConfig, CoreFfiError> {
    Ok(
        LlmService::select_profile(Path::new(&config_path), profile_id)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn llm_list_models(
    profile: LlmProviderProfile,
    credential: Option<String>,
) -> Result<Vec<String>, CoreFfiError> {
    LlmService::list_models(&profile.try_into()?, credential.as_deref())
        .await
        .map_err(CoreFfiError::from_core)
}
#[uniffi::export(async_runtime = "tokio")]
pub async fn llm_probe(
    profile: LlmProviderProfile,
    credential: Option<String>,
) -> Result<(), CoreFfiError> {
    LlmService::probe(&profile.try_into()?, credential.as_deref())
        .await
        .map_err(CoreFfiError::from_core)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn profile_round_trip_preserves_reference_and_rejects_unknown_protocol() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory
            .path()
            .join("config.json")
            .to_str()
            .unwrap()
            .to_owned();
        assert!(llm_get_config(path.clone())
            .await
            .unwrap()
            .profiles
            .is_empty());
        let mut profile = LlmProviderProfile {
            id: "p".into(),
            name: "Local".into(),
            protocol: "responses".into(),
            endpoint: "http://127.0.0.1:1/v1".into(),
            model: "m".into(),
            context_window: 32768,
            credential_reference: Some("secure-key-reference".into()),
            revision: 0,
        };
        let saved = llm_upsert_profile(path.clone(), profile.clone())
            .await
            .unwrap();
        assert_eq!(saved.profiles[0].protocol, "responses");
        assert_eq!(
            saved.profiles[0].credential_reference.as_deref(),
            Some("secure-key-reference")
        );
        assert_eq!(saved.default_profile_id.as_deref(), Some("p"));
        assert!(llm_select_profile(path.clone(), None)
            .await
            .unwrap()
            .default_profile_id
            .is_none());
        profile.protocol = "chatCompletions".into();
        assert_eq!(
            llm_upsert_profile(path.clone(), profile.clone())
                .await
                .unwrap()
                .profiles[0]
                .protocol,
            "chatCompletions"
        );
        profile.protocol = "unknown".into();
        assert!(llm_probe(profile.clone(), None).await.is_err());
        assert!(llm_list_models(profile.clone(), None).await.is_err());
        assert!(llm_upsert_profile(path.clone(), profile).await.is_err());
        assert!(llm_remove_profile(path, "p".into())
            .await
            .unwrap()
            .profiles
            .is_empty());
    }
}
