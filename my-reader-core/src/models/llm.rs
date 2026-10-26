use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", from = "LlmConfigWire")]
pub struct LlmConfig {
    pub providers: Vec<LlmProvider>,
    pub default_profile_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LlmConfigWire {
    providers: Option<Vec<LlmProvider>>,
    #[serde(default)]
    profiles: Vec<LlmProviderProfile>,
    #[serde(default)]
    default_profile_id: Option<String>,
}

impl From<LlmConfigWire> for LlmConfig {
    fn from(value: LlmConfigWire) -> Self {
        Self {
            providers: value
                .providers
                .unwrap_or_else(|| value.profiles.into_iter().map(Into::into).collect()),
            default_profile_id: value.default_profile_id,
        }
    }
}

impl LlmConfig {
    /// Resolved models for inference; connection data is stored only on the provider.
    pub fn profiles(&self) -> Vec<LlmProviderProfile> {
        self.providers
            .iter()
            .flat_map(LlmProvider::profiles)
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProvider {
    pub id: String,
    pub name: String,
    pub protocol: LlmProtocol,
    pub endpoint: String,
    #[serde(default)]
    pub credential_reference: Option<String>,
    pub models: Vec<LlmModel>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmModel {
    pub id: String,
    pub model: String,
    #[serde(default)]
    pub max_output_tokens: Option<u32>,
    #[serde(default = "default_context_window")]
    pub context_window: u32,
    #[serde(default)]
    pub revision: u32,
}

impl LlmProvider {
    pub fn profiles(&self) -> Vec<LlmProviderProfile> {
        self.models
            .iter()
            .map(|model| LlmProviderProfile {
                id: model.id.clone(),
                name: self.name.clone(),
                protocol: self.protocol,
                endpoint: self.endpoint.clone(),
                credential_reference: self.credential_reference.clone(),
                model: model.model.clone(),
                context_window: model.context_window,
                max_output_tokens: model.max_output_tokens,
                revision: model.revision,
            })
            .collect()
    }
}

impl From<LlmProviderProfile> for LlmProvider {
    fn from(profile: LlmProviderProfile) -> Self {
        Self {
            id: profile.id.clone(),
            name: profile.name,
            protocol: profile.protocol,
            endpoint: profile.endpoint,
            credential_reference: profile.credential_reference,
            models: vec![LlmModel {
                id: profile.id,
                model: profile.model,

                max_output_tokens: profile.max_output_tokens,
                context_window: profile.context_window,
                revision: profile.revision,
            }],
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LlmProtocol {
    ChatCompletions,
    Responses,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderProfile {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub protocol: LlmProtocol,
    pub endpoint: String,
    pub model: String,
    #[serde(default)]
    pub credential_reference: Option<String>,
    #[serde(default = "default_context_window")]
    pub context_window: u32,
    #[serde(default)]
    pub max_output_tokens: Option<u32>,
    #[serde(default)]
    pub revision: u32,
}

fn default_context_window() -> u32 {
    32_768
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
}

// Request-scoped only: never serialized into configuration or conversation history.
pub struct LlmCredential {
    pub profile_id: String,
    pub profile_revision: u32,
    pub value: Option<String>,
}
