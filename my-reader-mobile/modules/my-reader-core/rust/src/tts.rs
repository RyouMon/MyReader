use std::path::Path;

use my_reader_core::{
    api::tts::TtsService,
    models::{
        TtsAudioArtifact as CoreAudioArtifact, TtsAudioFormat, TtsCachePolicy,
        TtsConfig as CoreTtsConfig, TtsEngineSelection, TtsPlaybackPreferences,
        TtsProviderCapabilities as CoreProviderCapabilities, TtsProviderKind, TtsProviderOptions,
        TtsProviderProfile as CoreProviderProfile, TtsSynthesisRequest as CoreSynthesisRequest,
        TtsVoice as CoreVoice, TtsVoiceRef,
    },
};

use crate::CoreFfiError;

const JS_SAFE_INTEGER_MAX: f64 = 9_007_199_254_740_991.0;

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsConfig {
    pub schema_version: u32,
    pub default_engine: TtsEngine,
    pub profiles: Vec<TtsProviderProfile>,
    pub voices: Vec<TtsLanguageVoice>,
    pub playback: TtsPlayback,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsEngine {
    pub kind: String,
    pub profile_id: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsProviderProfile {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub endpoint: String,
    pub model: Option<String>,
    pub credential_reference: Option<String>,
    pub response_format: Option<String>,
    pub instructions: Option<String>,
    pub voices: Vec<String>,
    pub default_voice: Option<String>,
    pub revision: f64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsLanguageVoice {
    pub language: String,
    pub engine: String,
    pub profile_id: Option<String>,
    pub voice_id: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsPlayback {
    pub speed: f64,
    pub pitch: f64,
    pub skip_page_breaks: bool,
    pub skip_footnotes: bool,
    pub announce_context: bool,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsProviderCapabilities {
    pub voice_discovery: bool,
    pub preview: bool,
    pub plain_text: bool,
    pub ssml: bool,
    pub streaming: bool,
    pub word_timings: bool,
    pub synthesis_rate: bool,
    pub synthesis_pitch: bool,
    pub max_input_chars: Option<u32>,
    pub output_mime_types: Vec<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsVoice {
    pub id: String,
    pub name: String,
    pub language: String,
    pub gender: Option<String>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct QwenTtsModel {
    pub id: String,
    pub name: String,
    pub supports_instructions: bool,
    pub voice_discovery: bool,
    pub audio_formats: Vec<String>,
    pub voices: Vec<TtsVoice>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct QwenTtsPreset {
    pub id: String,
    pub endpoint: String,
    pub default_model: QwenTtsModel,
}

impl From<my_reader_core::models::QwenTtsModel> for QwenTtsModel {
    fn from(model: my_reader_core::models::QwenTtsModel) -> Self {
        Self {
            id: model.id,
            name: model.name,
            supports_instructions: model.supports_instructions,
            voice_discovery: model.voice_discovery,
            audio_formats: model
                .audio_formats
                .into_iter()
                .map(|format| format.as_str().into())
                .collect(),
            voices: model.voices.into_iter().map(Into::into).collect(),
        }
    }
}

#[uniffi::export]
pub fn tts_qwen_presets() -> Vec<QwenTtsPreset> {
    TtsService::qwen_presets()
        .into_iter()
        .map(|preset| QwenTtsPreset {
            id: preset.id,
            endpoint: preset.endpoint,
            default_model: preset.default_model.into(),
        })
        .collect()
}

#[uniffi::export]
pub fn tts_qwen_models(endpoint: Option<String>) -> Vec<QwenTtsModel> {
    TtsService::qwen_models(endpoint.as_deref())
        .into_iter()
        .map(Into::into)
        .collect()
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_discover_qwen_voices(
    endpoint: String,
    model: String,
    credential: Option<String>,
) -> Result<Vec<TtsVoice>, CoreFfiError> {
    Ok(
        TtsService::discover_qwen_voices(&endpoint, &model, credential.as_deref())
            .await
            .map_err(CoreFfiError::from_core)?
            .into_iter()
            .map(Into::into)
            .collect(),
    )
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsSynthesisRequest {
    pub profile_id: String,
    pub text: String,
    pub language: Option<String>,
    pub voice_id: String,
    pub speed: Option<f64>,
    pub pitch: Option<f64>,
    pub accepted_mime_types: Vec<String>,
    pub cache_policy: String,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsAudioArtifact {
    pub path: String,
    pub mime_type: String,
    pub duration_ms: Option<f64>,
    pub timings: Vec<TtsTiming>,
    pub cache_key: Option<String>,
    pub playback_rate: Option<f64>,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct TtsTiming {
    pub start_utf16: u32,
    pub end_utf16: u32,
    pub start_ms: f64,
    pub end_ms: f64,
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_get_config(config_path: String) -> Result<TtsConfig, CoreFfiError> {
    Ok(TtsService::get_config(Path::new(&config_path))
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_upsert_profile(
    config_path: String,
    profile: TtsProviderProfile,
) -> Result<TtsConfig, CoreFfiError> {
    Ok(
        TtsService::upsert_profile(Path::new(&config_path), profile.try_into()?)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_remove_profile(
    config_path: String,
    profile_id: String,
) -> Result<TtsConfig, CoreFfiError> {
    Ok(
        TtsService::remove_profile(Path::new(&config_path), &profile_id)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_set_default_engine(
    config_path: String,
    engine: TtsEngine,
) -> Result<TtsConfig, CoreFfiError> {
    Ok(
        TtsService::set_default_engine(Path::new(&config_path), engine.try_into()?)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_set_playback(
    config_path: String,
    playback: TtsPlayback,
) -> Result<TtsConfig, CoreFfiError> {
    Ok(
        TtsService::set_playback_preferences(Path::new(&config_path), playback.into())
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_set_voice(
    config_path: String,
    language: String,
    voice: Option<TtsLanguageVoice>,
) -> Result<TtsConfig, CoreFfiError> {
    let voice = voice.map(TryInto::try_into).transpose()?;
    Ok(
        TtsService::set_voice_for_language(Path::new(&config_path), &language, voice)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_provider_capabilities(
    config_path: String,
    profile_id: String,
) -> Result<TtsProviderCapabilities, CoreFfiError> {
    Ok(
        TtsService::provider_capabilities(Path::new(&config_path), &profile_id)
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_probe_provider(
    config_path: String,
    profile_id: String,
    credential: Option<String>,
) -> Result<TtsProviderCapabilities, CoreFfiError> {
    Ok(
        TtsService::probe_provider(Path::new(&config_path), &profile_id, credential.as_deref())
            .await
            .map_err(CoreFfiError::from_core)?
            .into(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_list_voices(
    config_path: String,
    profile_id: String,
    credential: Option<String>,
) -> Result<Vec<TtsVoice>, CoreFfiError> {
    Ok(
        TtsService::list_voices(Path::new(&config_path), &profile_id, credential.as_deref())
            .await
            .map_err(CoreFfiError::from_core)?
            .into_iter()
            .map(Into::into)
            .collect(),
    )
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn tts_synthesize(
    config_path: String,
    cache_directory: String,
    request: TtsSynthesisRequest,
    credential: Option<String>,
) -> Result<TtsAudioArtifact, CoreFfiError> {
    Ok(TtsService::synthesize(
        Path::new(&config_path),
        Path::new(&cache_directory),
        request.try_into()?,
        credential.as_deref(),
    )
    .await
    .map_err(CoreFfiError::from_core)?
    .into())
}

impl From<CoreTtsConfig> for TtsConfig {
    fn from(value: CoreTtsConfig) -> Self {
        Self {
            schema_version: value.schema_version,
            default_engine: value.default_engine.into(),
            profiles: value.profiles.into_iter().map(Into::into).collect(),
            voices: value
                .voice_by_language
                .into_iter()
                .map(|(language, voice)| TtsLanguageVoice::from_core(language, voice))
                .collect(),
            playback: value.playback.into(),
        }
    }
}

impl From<TtsEngineSelection> for TtsEngine {
    fn from(value: TtsEngineSelection) -> Self {
        match value {
            TtsEngineSelection::System => Self {
                kind: "system".into(),
                profile_id: None,
            },
            TtsEngineSelection::Provider { profile_id } => Self {
                kind: "provider".into(),
                profile_id: Some(profile_id),
            },
        }
    }
}

impl TryFrom<TtsEngine> for TtsEngineSelection {
    type Error = CoreFfiError;

    fn try_from(value: TtsEngine) -> Result<Self, Self::Error> {
        match value.kind.as_str() {
            "system" => Ok(Self::System),
            "provider" => Ok(Self::Provider {
                profile_id: required(value.profile_id, "profileId")?,
            }),
            kind => Err(invalid(format!("Unsupported TTS engine: {kind}"))),
        }
    }
}

impl From<CoreProviderProfile> for TtsProviderProfile {
    fn from(value: CoreProviderProfile) -> Self {
        let (TtsProviderOptions::OpenAiCompatible {
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
        }) = value.options;
        Self {
            id: value.id,
            name: value.name,
            kind: provider_kind(value.kind).into(),
            enabled: value.enabled,
            endpoint: value.endpoint,
            model: value.model,
            credential_reference: value.credential_reference,
            response_format: Some(response_format.as_str().into()),
            instructions,
            voices,
            default_voice,
            revision: value.revision as f64,
        }
    }
}

impl TryFrom<TtsProviderProfile> for CoreProviderProfile {
    type Error = CoreFfiError;

    fn try_from(value: TtsProviderProfile) -> Result<Self, Self::Error> {
        let kind = parse_provider_kind(&value.kind)?;
        let options = match kind {
            TtsProviderKind::Qwen => TtsProviderOptions::Qwen {
                response_format: parse_audio_format(
                    value.response_format.as_deref().unwrap_or("wav"),
                )?,
                instructions: value.instructions,
                voices: value.voices,
                default_voice: value.default_voice,
            },
            TtsProviderKind::OpenAiCompatible => TtsProviderOptions::OpenAiCompatible {
                response_format: parse_audio_format(
                    value.response_format.as_deref().unwrap_or("mp3"),
                )?,
                instructions: value.instructions,
                voices: value.voices,
                default_voice: value.default_voice,
            },
        };
        Ok(Self {
            id: value.id,
            name: value.name,
            kind,
            enabled: value.enabled,
            endpoint: value.endpoint,
            model: value.model,
            credential_reference: value.credential_reference,
            options,
            revision: js_u64(value.revision, "revision")?,
        })
    }
}

impl TtsLanguageVoice {
    fn from_core(language: String, voice: TtsVoiceRef) -> Self {
        match voice {
            TtsVoiceRef::System { voice_id } => Self {
                language,
                engine: "system".into(),
                profile_id: None,
                voice_id,
            },
            TtsVoiceRef::Provider {
                profile_id,
                voice_id,
            } => Self {
                language,
                engine: "provider".into(),
                profile_id: Some(profile_id),
                voice_id,
            },
        }
    }
}

impl TryFrom<TtsLanguageVoice> for TtsVoiceRef {
    type Error = CoreFfiError;

    fn try_from(value: TtsLanguageVoice) -> Result<Self, Self::Error> {
        match value.engine.as_str() {
            "system" => Ok(Self::System {
                voice_id: value.voice_id,
            }),
            "provider" => Ok(Self::Provider {
                profile_id: required(value.profile_id, "profileId")?,
                voice_id: value.voice_id,
            }),
            engine => Err(invalid(format!("Unsupported TTS voice engine: {engine}"))),
        }
    }
}

impl From<TtsPlaybackPreferences> for TtsPlayback {
    fn from(value: TtsPlaybackPreferences) -> Self {
        Self {
            speed: value.speed,
            pitch: value.pitch,
            skip_page_breaks: value.skip_page_breaks,
            skip_footnotes: value.skip_footnotes,
            announce_context: value.announce_context,
        }
    }
}

impl From<TtsPlayback> for TtsPlaybackPreferences {
    fn from(value: TtsPlayback) -> Self {
        Self {
            speed: value.speed,
            pitch: value.pitch,
            skip_page_breaks: value.skip_page_breaks,
            skip_footnotes: value.skip_footnotes,
            announce_context: value.announce_context,
        }
    }
}

impl From<CoreProviderCapabilities> for TtsProviderCapabilities {
    fn from(value: CoreProviderCapabilities) -> Self {
        Self {
            voice_discovery: value.voice_discovery,
            preview: value.preview,
            plain_text: value.plain_text,
            ssml: value.ssml,
            streaming: value.streaming,
            word_timings: value.word_timings,
            synthesis_rate: value.synthesis_rate,
            synthesis_pitch: value.synthesis_pitch,
            max_input_chars: value.max_input_chars,
            output_mime_types: value.output_mime_types,
        }
    }
}

impl From<CoreVoice> for TtsVoice {
    fn from(value: CoreVoice) -> Self {
        Self {
            id: value.id,
            name: value.name,
            language: value.language,
            gender: value.gender,
        }
    }
}

impl TryFrom<TtsSynthesisRequest> for CoreSynthesisRequest {
    type Error = CoreFfiError;

    fn try_from(value: TtsSynthesisRequest) -> Result<Self, Self::Error> {
        Ok(Self {
            profile_id: value.profile_id,
            text: value.text,
            language: value.language,
            voice_id: value.voice_id,
            speed: value.speed,
            pitch: value.pitch,
            accepted_mime_types: value.accepted_mime_types,
            cache_policy: parse_cache_policy(&value.cache_policy)?,
        })
    }
}

impl From<CoreAudioArtifact> for TtsAudioArtifact {
    fn from(value: CoreAudioArtifact) -> Self {
        Self {
            path: value.path,
            mime_type: value.mime_type,
            duration_ms: value.duration_ms.map(|value| value as f64),
            timings: value
                .timings
                .into_iter()
                .map(|timing| TtsTiming {
                    start_utf16: timing.start_utf16,
                    end_utf16: timing.end_utf16,
                    start_ms: timing.start_ms as f64,
                    end_ms: timing.end_ms as f64,
                })
                .collect(),
            cache_key: value.cache_key,
            playback_rate: value.playback_rate,
        }
    }
}

fn provider_kind(kind: TtsProviderKind) -> &'static str {
    match kind {
        TtsProviderKind::OpenAiCompatible => "openAiCompatible",
        TtsProviderKind::Qwen => "qwen",
    }
}

fn parse_provider_kind(value: &str) -> Result<TtsProviderKind, CoreFfiError> {
    match value {
        "openAiCompatible" => Ok(TtsProviderKind::OpenAiCompatible),
        "qwen" => Ok(TtsProviderKind::Qwen),
        value => Err(invalid(format!("Unsupported TTS provider: {value}"))),
    }
}

fn parse_audio_format(value: &str) -> Result<TtsAudioFormat, CoreFfiError> {
    match value {
        "mp3" => Ok(TtsAudioFormat::Mp3),
        "opus" => Ok(TtsAudioFormat::Opus),
        "aac" => Ok(TtsAudioFormat::Aac),
        "flac" => Ok(TtsAudioFormat::Flac),
        "wav" => Ok(TtsAudioFormat::Wav),
        value => Err(invalid(format!("Unsupported TTS audio format: {value}"))),
    }
}

fn parse_cache_policy(value: &str) -> Result<TtsCachePolicy, CoreFfiError> {
    match value {
        "use" => Ok(TtsCachePolicy::Use),
        "refresh" => Ok(TtsCachePolicy::Refresh),
        "bypass" => Ok(TtsCachePolicy::Bypass),
        value => Err(invalid(format!("Unsupported TTS cache policy: {value}"))),
    }
}

fn required<T>(value: Option<T>, field: &str) -> Result<T, CoreFfiError> {
    value.ok_or_else(|| invalid(format!("Missing required field: {field}")))
}

fn js_u64(value: f64, field: &str) -> Result<u64, CoreFfiError> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > JS_SAFE_INTEGER_MAX {
        return Err(invalid(format!("Invalid unsigned integer for {field}")));
    }
    Ok(value as u64)
}

fn invalid(message: impl Into<String>) -> CoreFfiError {
    CoreFfiError::core(format!("INVALID_TTS_INPUT: {}", message.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_round_trip_typed_config_without_secret_material() {
        let core = CoreTtsConfig {
            profiles: vec![CoreProviderProfile {
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
                revision: 2,
            }],
            ..Default::default()
        };

        let ffi: TtsConfig = core.into();

        assert_eq!(
            ffi.profiles[0].credential_reference.as_deref(),
            Some("tts:openai:api-key")
        );
        assert_eq!(ffi.profiles[0].response_format.as_deref(), Some("mp3"));
        assert_eq!(
            ffi.profiles[0].voices,
            vec!["reader-voice", "narrator-voice"]
        );
        assert_eq!(
            ffi.profiles[0].default_voice.as_deref(),
            Some("reader-voice")
        );
        assert_eq!(ffi.profiles[0].revision, 2.0);
    }

    #[test]
    fn should_reject_mismatched_or_unknown_provider_types() {
        let profile = TtsProviderProfile {
            id: "bad".into(),
            name: "Bad".into(),
            kind: "unknown".into(),
            enabled: true,
            endpoint: "https://example.com".into(),
            model: None,
            credential_reference: None,
            response_format: None,
            instructions: None,
            voices: Vec::new(),
            default_voice: None,
            revision: 1.0,
        };

        assert!(CoreProviderProfile::try_from(profile).is_err());
    }
}
