use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmConfig {
    #[serde(default)]
    pub profiles: Vec<LlmProviderProfile>,
    #[serde(default)]
    pub default_profile_id: Option<String>,
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
