use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const TTS_CONFIG_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", from = "TtsConfigWire")]
pub struct TtsConfig {
    #[serde(default = "default_tts_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub default_engine: TtsEngineSelection,
    #[serde(default)]
    pub providers: Vec<TtsProvider>,
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
            providers: Vec::new(),
            voice_by_language: BTreeMap::new(),
            playback: TtsPlaybackPreferences::default(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TtsConfigWire {
    #[serde(default = "default_tts_schema_version")]
    schema_version: u32,
    providers: Option<Vec<TtsProvider>>,
    #[serde(default)]
    profiles: Vec<TtsProviderProfile>,
    #[serde(default)]
    default_engine: TtsEngineSelection,
    #[serde(default)]
    voice_by_language: BTreeMap<String, TtsVoiceRef>,
    #[serde(default)]
    playback: TtsPlaybackPreferences,
}

impl From<TtsConfigWire> for TtsConfig {
    fn from(value: TtsConfigWire) -> Self {
        let mut providers = value
            .providers
            .unwrap_or_else(|| value.profiles.into_iter().map(Into::into).collect());
        for provider in &mut providers {
            provider.model_scoped_voices |= provider.kind == TtsProviderKind::Qwen;
        }
        Self {
            schema_version: if value.schema_version == 1 {
                TTS_CONFIG_SCHEMA_VERSION
            } else {
                value.schema_version
            },
            providers,
            default_engine: value.default_engine,
            voice_by_language: value.voice_by_language,
            playback: value.playback,
        }
    }
}

impl TtsConfig {
    /// Resolved models for playback; never persisted as a second source of configuration.
    pub fn profiles(&self) -> Vec<TtsProviderProfile> {
        self.providers
            .iter()
            .flat_map(TtsProvider::profiles)
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsProvider {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub voice_names: BTreeMap<String, String>,
    pub id: String,
    pub name: String,
    pub kind: TtsProviderKind,
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    pub endpoint: String,
    #[serde(default)]
    pub credential_reference: Option<String>,
    #[serde(default)]
    pub model_scoped_voices: bool,
    /// Shared voices when model-scoped voices are disabled.
    #[serde(default)]
    pub voices: Vec<String>,
    pub models: Vec<TtsModel>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsModel {
    pub id: String,
    pub model: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub voice_names: BTreeMap<String, String>,
    pub response_format: TtsAudioFormat,
    #[serde(default)]
    pub instructions: Option<String>,
    #[serde(default)]
    pub default_voice: Option<String>,
    /// Voices for this model when model-scoped voices are enabled.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub voices: Vec<String>,
    #[serde(default = "initial_profile_revision")]
    pub revision: u64,
}

impl TtsProvider {
    pub fn profiles(&self) -> Vec<TtsProviderProfile> {
        self.models
            .iter()
            .map(|model| {
                let options = match self.kind {
                    TtsProviderKind::OpenAiCompatible => TtsProviderOptions::OpenAiCompatible {
                        response_format: model.response_format,
                        instructions: model.instructions.clone(),
                        default_voice: model.default_voice.clone(),
                        voices: if self.model_scoped_voices {
                            model.voices.clone()
                        } else {
                            self.voices.clone()
                        },
                    },
                    TtsProviderKind::Qwen => TtsProviderOptions::Qwen {
                        response_format: model.response_format,
                        instructions: model.instructions.clone(),
                        default_voice: model.default_voice.clone(),
                        voices: model.voices.clone(),
                    },
                };
                TtsProviderProfile {
                    id: model.id.clone(),
                    name: self.name.clone(),
                    kind: self.kind,
                    enabled: self.enabled,
                    endpoint: self.endpoint.clone(),
                    model: Some(model.model.clone()),
                    credential_reference: self.credential_reference.clone(),
                    options,
                    revision: model.revision,
                }
            })
            .collect()
    }
}

impl From<TtsProviderProfile> for TtsProvider {
    fn from(profile: TtsProviderProfile) -> Self {
        let (response_format, instructions, voices, default_voice) = match profile.options {
            TtsProviderOptions::OpenAiCompatible {
                response_format,
                instructions,
                voices,
                default_voice,
            }
            | TtsProviderOptions::Qwen {
                response_format,
                instructions,
                voices,
                default_voice,
            } => (response_format, instructions, voices, default_voice),
        };
        Self {
            id: profile.id.clone(),
            voice_names: BTreeMap::new(),
            name: profile.name,
            kind: profile.kind,
            enabled: profile.enabled,
            endpoint: profile.endpoint,
            credential_reference: profile.credential_reference,
            model_scoped_voices: profile.kind == TtsProviderKind::Qwen,
            voices: if profile.kind == TtsProviderKind::OpenAiCompatible {
                voices.clone()
            } else {
                vec![]
            },
            models: vec![TtsModel {
                id: profile.id,
                display_name: String::new(),
                voice_names: BTreeMap::new(),
                model: profile.model.unwrap_or_default(),
                response_format,
                instructions,
                default_voice,
                revision: profile.revision,
                voices: if profile.kind == TtsProviderKind::Qwen {
                    voices
                } else {
                    vec![]
                },
            }],
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
    Qwen,
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
    Qwen {
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
            Self::Qwen { .. } => TtsProviderKind::Qwen,
        }
    }

    pub fn voices(&self) -> &[String] {
        match self {
            Self::OpenAiCompatible { voices, .. } | Self::Qwen { voices, .. } => voices,
        }
    }

    pub fn default_voice(&self) -> Option<&str> {
        match self {
            Self::OpenAiCompatible { default_voice, .. } | Self::Qwen { default_voice, .. } => {
                default_voice.as_deref()
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QwenTtsModel {
    pub id: String,
    pub name: String,
    pub supports_instructions: bool,
    pub voice_discovery: bool,
    pub audio_formats: Vec<TtsAudioFormat>,
    pub voices: Vec<TtsVoice>,
}

/// Creation defaults, not a separate provider implementation or persisted kind.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QwenTtsPreset {
    pub id: String,
    pub endpoint: String,
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
    pub instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speed: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pitch: Option<f64>,
    #[serde(default)]
    pub accepted_mime_types: Vec<String>,
    pub cache_policy: TtsCachePolicy,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playback_rate: Option<f64>,
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
        assert!(config.profiles().is_empty());
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
