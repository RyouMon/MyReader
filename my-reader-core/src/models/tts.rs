use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const TTS_CONFIG_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsConfig {
    #[serde(default = "default_tts_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub default_engine: TtsEngineSelection,
    #[serde(default)]
    pub profiles: Vec<TtsProviderProfile>,
    #[serde(default)]
    pub voice_by_language: BTreeMap<String, TtsVoiceRef>,
    #[serde(default)]
    pub playback: TtsPlaybackPreferences,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            schema_version: TTS_CONFIG_SCHEMA_VERSION,
            default_engine: TtsEngineSelection::System,
            profiles: Vec::new(),
            voice_by_language: BTreeMap::new(),
            playback: TtsPlaybackPreferences::default(),
        }
    }
}

fn default_tts_schema_version() -> u32 {
    TTS_CONFIG_SCHEMA_VERSION
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TtsEngineSelection {
    #[default]
    System,
    Provider {
        profile_id: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TtsProviderKind {
    OpenAiCompatible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsProviderProfile {
    pub id: String,
    pub name: String,
    pub kind: TtsProviderKind,
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    pub endpoint: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential_reference: Option<String>,
    pub options: TtsProviderOptions,
    #[serde(default = "initial_profile_revision")]
    pub revision: u64,
}

fn enabled_by_default() -> bool {
    true
}

fn initial_profile_revision() -> u64 {
    1
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TtsProviderOptions {
    OpenAiCompatible {
        #[serde(default)]
        response_format: TtsAudioFormat,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        instructions: Option<String>,
        #[serde(default)]
        voices: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default_voice: Option<String>,
    },
}

impl TtsProviderOptions {
    pub fn kind(&self) -> TtsProviderKind {
        match self {
            Self::OpenAiCompatible { .. } => TtsProviderKind::OpenAiCompatible,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TtsAudioFormat {
    #[default]
    Mp3,
    Opus,
    Aac,
    Flac,
    Wav,
}

impl TtsAudioFormat {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Mp3 => "mp3",
            Self::Opus => "opus",
            Self::Aac => "aac",
            Self::Flac => "flac",
            Self::Wav => "wav",
        }
    }

    pub const fn mime_type(self) -> &'static str {
        match self {
            Self::Mp3 => "audio/mpeg",
            Self::Opus => "audio/ogg",
            Self::Aac => "audio/aac",
            Self::Flac => "audio/flac",
            Self::Wav => "audio/wav",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsPlaybackPreferences {
    #[serde(default = "default_speed")]
    pub speed: f64,
    #[serde(default = "default_pitch")]
    pub pitch: f64,
    #[serde(default = "enabled_by_default")]
    pub skip_page_breaks: bool,
    #[serde(default)]
    pub skip_footnotes: bool,
    #[serde(default)]
    pub announce_context: bool,
}

impl Default for TtsPlaybackPreferences {
    fn default() -> Self {
        Self {
            speed: default_speed(),
            pitch: default_pitch(),
            skip_page_breaks: true,
            skip_footnotes: false,
            announce_context: false,
        }
    }
}

fn default_speed() -> f64 {
    1.0
}

fn default_pitch() -> f64 {
    1.0
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "engine",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TtsVoiceRef {
    System {
        voice_id: String,
    },
    Provider {
        profile_id: String,
        voice_id: String,
    },
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TtsCachePolicy {
    #[default]
    Use,
    Refresh,
    Bypass,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsSynthesisRequest {
    pub profile_id: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub voice_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f64>,
    #[serde(default)]
    pub accepted_mime_types: Vec<String>,
    pub cache_policy: TtsCachePolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsAudioArtifact {
    pub path: String,
    pub mime_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub timings: Vec<TtsTiming>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsTiming {
    pub start_utf16: u32,
    pub end_utf16: u32,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsVoice {
    pub id: String,
    pub name: String,
    pub language: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gender: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsProviderCapabilities {
    pub voice_discovery: bool,
    pub preview: bool,
    pub plain_text: bool,
    pub ssml: bool,
    pub streaming: bool,
    pub word_timings: bool,
    pub synthesis_rate: bool,
    pub synthesis_pitch: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_input_chars: Option<u32>,
    pub output_mime_types: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_default_to_private_system_tts() {
        let config = TtsConfig::default();

        assert_eq!(config.default_engine, TtsEngineSelection::System);
        assert!(config.profiles.is_empty());
        assert_eq!(config.playback.speed, 1.0);
        assert!(config.playback.skip_page_breaks);
    }

    #[test]
    fn should_round_trip_provider_profile_without_secret_material() {
        let profile = TtsProviderProfile {
            id: "openai".into(),
            name: "OpenAI".into(),
            kind: TtsProviderKind::OpenAiCompatible,
            enabled: true,
            endpoint: "https://api.openai.com/v1".into(),
            model: Some("gpt-4o-mini-tts".into()),
            credential_reference: Some("tts:openai:api-key".into()),
            options: TtsProviderOptions::OpenAiCompatible {
                response_format: TtsAudioFormat::Mp3,
                instructions: Some("Speak warmly".into()),
                voices: vec!["reader-voice".into(), "narrator-voice".into()],
                default_voice: Some("reader-voice".into()),
            },
            revision: 1,
        };

        let json = serde_json::to_value(&profile).unwrap();

        assert_eq!(json["kind"], "openAiCompatible");
        assert_eq!(json["credentialReference"], "tts:openai:api-key");
        assert_eq!(json["options"]["defaultVoice"], "reader-voice");
        assert!(json.get("apiKey").is_none());
        assert_eq!(
            serde_json::from_value::<TtsProviderProfile>(json).unwrap(),
            profile
        );
    }
}
