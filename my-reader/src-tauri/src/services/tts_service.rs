use std::{collections::BTreeMap, path::Path};

use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use crate::{auth::credentials, error::AppError};

type CoreTtsService = my_reader_core::api::tts::TtsService;

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsConfigDto {
    pub schema_version: u32,
    pub default_engine: TtsEngineSelectionDto,
    pub profiles: Vec<TtsProviderProfileDto>,
    pub voice_by_language: BTreeMap<String, TtsVoiceRefDto>,
    pub playback: TtsPlaybackPreferencesDto,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TtsEngineSelectionDto {
    System,
    Provider { profile_id: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TtsProviderKindDto {
    OpenAiCompatible,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum TtsAudioFormatDto {
    #[default]
    Mp3,
    Opus,
    Aac,
    Flac,
    Wav,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TtsProviderOptionsDto {
    OpenAiCompatible {
        #[serde(default)]
        response_format: TtsAudioFormatDto,
        #[serde(default)]
        instructions: Option<String>,
        #[serde(default)]
        voices: Vec<String>,
        #[serde(default)]
        default_voice: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsProviderProfileDto {
    pub id: String,
    pub name: String,
    pub kind: TtsProviderKindDto,
    pub enabled: bool,
    pub endpoint: String,
    pub model: Option<String>,
    pub options: TtsProviderOptionsDto,
    pub revision: u64,
    pub has_credential: bool,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsProviderProfileInput {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub kind: TtsProviderKindDto,
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    pub endpoint: String,
    #[serde(default)]
    pub model: Option<String>,
    pub options: TtsProviderOptionsDto,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTtsProviderInput {
    pub profile: TtsProviderProfileInput,
    #[serde(default)]
    pub credential: Option<String>,
    #[serde(default)]
    pub clear_credential: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsPlaybackPreferencesDto {
    pub speed: f64,
    pub pitch: f64,
    pub skip_page_breaks: bool,
    pub skip_footnotes: bool,
    pub announce_context: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(
    tag = "engine",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TtsVoiceRefDto {
    System {
        voice_id: String,
    },
    Provider {
        profile_id: String,
        voice_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsProviderCapabilitiesDto {
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

#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsVoiceDto {
    pub id: String,
    pub name: String,
    pub language: String,
    pub gender: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TtsCachePolicyDto {
    #[default]
    Use,
    Refresh,
    Bypass,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsSynthesisInput {
    pub profile_id: String,
    pub text: String,
    #[serde(default)]
    pub language: Option<String>,
    pub voice_id: String,
    #[serde(default)]
    pub speed: Option<f64>,
    #[serde(default)]
    pub pitch: Option<f64>,
    #[serde(default)]
    pub accepted_mime_types: Vec<String>,
    #[serde(default)]
    pub cache_policy: TtsCachePolicyDto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsAudioArtifactDto {
    pub path: String,
    pub mime_type: String,
    pub duration_ms: Option<u64>,
    pub timings: Vec<TtsTimingDto>,
    pub cache_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TtsTimingDto {
    pub start_utf16: u32,
    pub end_utf16: u32,
    pub start_ms: u64,
    pub end_ms: u64,
}

pub struct DesktopTtsService;

impl DesktopTtsService {
    pub fn get_config(config_path: &Path) -> Result<TtsConfigDto, AppError> {
        config_dto(CoreTtsService::get_config(config_path)?)
    }

    pub fn upsert_profile(
        config_path: &Path,
        input: UpsertTtsProviderInput,
    ) -> Result<TtsConfigDto, AppError> {
        let UpsertTtsProviderInput {
            profile: input_profile,
            credential,
            clear_credential,
        } = input;
        let existing_config = CoreTtsService::get_config(config_path)?;
        let mut profile = input_profile.into_core();
        if profile.id.trim().is_empty() {
            profile.id = Uuid::new_v4().to_string();
        }
        let profile_id = profile.id.clone();
        let existing = existing_config
            .profiles
            .iter()
            .find(|existing| existing.id == profile.id);
        profile.revision = existing.map_or(1, |existing| existing.revision);
        profile.credential_reference = existing
            .and_then(|existing| existing.credential_reference.clone())
            .or_else(|| Some(credentials::tts_credential_account(&profile.id)));

        let config = CoreTtsService::upsert_profile(config_path, profile)?;
        let persisted = config
            .profiles
            .iter()
            .find(|profile| profile.id == profile_id)
            .ok_or_else(|| AppError::Config("TTS_PROFILE_CONFIG_WRITE_FAILED".into()))?;
        let credential_reference = persisted.credential_reference.as_deref();

        if clear_credential {
            if let Some(reference) = credential_reference {
                credentials::delete_tts_credential(reference)?;
            }
        } else if let Some(credential) = credential
            .as_deref()
            .map(str::trim)
            .filter(|credential| !credential.is_empty())
        {
            let reference = credential_reference
                .ok_or_else(|| AppError::Config("TTS_CREDENTIAL_REFERENCE_MISSING".into()))?;
            credentials::save_tts_credential(reference, credential)?;
        }

        config_dto(config)
    }

    pub fn remove_profile(config_path: &Path, profile_id: &str) -> Result<TtsConfigDto, AppError> {
        let config = CoreTtsService::get_config(config_path)?;
        let credential_reference = config
            .profiles
            .iter()
            .find(|profile| profile.id == profile_id)
            .and_then(|profile| profile.credential_reference.clone());
        let config = CoreTtsService::remove_profile(config_path, profile_id)?;
        if let Some(reference) = credential_reference {
            credentials::delete_tts_credential(&reference)?;
        }
        config_dto(config)
    }

    pub fn set_default_engine(
        config_path: &Path,
        engine: TtsEngineSelectionDto,
    ) -> Result<TtsConfigDto, AppError> {
        config_dto(CoreTtsService::set_default_engine(
            config_path,
            engine.into(),
        )?)
    }

    pub fn set_playback_preferences(
        config_path: &Path,
        playback: TtsPlaybackPreferencesDto,
    ) -> Result<TtsConfigDto, AppError> {
        config_dto(CoreTtsService::set_playback_preferences(
            config_path,
            playback.into(),
        )?)
    }

    pub fn set_voice_for_language(
        config_path: &Path,
        language: &str,
        voice: Option<TtsVoiceRefDto>,
    ) -> Result<TtsConfigDto, AppError> {
        config_dto(CoreTtsService::set_voice_for_language(
            config_path,
            language,
            voice.map(Into::into),
        )?)
    }

    pub fn provider_capabilities(
        config_path: &Path,
        profile_id: &str,
    ) -> Result<TtsProviderCapabilitiesDto, AppError> {
        Ok(CoreTtsService::provider_capabilities(config_path, profile_id)?.into())
    }

    pub async fn probe_provider(
        config_path: &Path,
        profile_id: &str,
    ) -> Result<TtsProviderCapabilitiesDto, AppError> {
        let credential = resolve_credential(config_path, profile_id)?;
        Ok(
            CoreTtsService::probe_provider(config_path, profile_id, credential.as_deref())
                .await?
                .into(),
        )
    }

    pub async fn list_voices(
        config_path: &Path,
        profile_id: &str,
    ) -> Result<Vec<TtsVoiceDto>, AppError> {
        let credential = resolve_credential(config_path, profile_id)?;
        Ok(
            CoreTtsService::list_voices(config_path, profile_id, credential.as_deref())
                .await?
                .into_iter()
                .map(Into::into)
                .collect(),
        )
    }

    pub async fn synthesize(
        config_path: &Path,
        cache_directory: &Path,
        input: TtsSynthesisInput,
    ) -> Result<TtsAudioArtifactDto, AppError> {
        let credential = resolve_credential(config_path, &input.profile_id)?;
        Ok(CoreTtsService::synthesize(
            config_path,
            cache_directory,
            input.into(),
            credential.as_deref(),
        )
        .await?
        .into())
    }
}

fn resolve_credential(config_path: &Path, profile_id: &str) -> Result<Option<String>, AppError> {
    let config = CoreTtsService::get_config(config_path)?;
    let profile = config
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id)
        .ok_or_else(|| AppError::NotFound(format!("TTS_PROFILE_NOT_FOUND: {profile_id}")))?;
    profile
        .credential_reference
        .as_deref()
        .map(credentials::read_tts_credential)
        .transpose()
        .map(Option::flatten)
}

fn config_dto(config: my_reader_core::models::TtsConfig) -> Result<TtsConfigDto, AppError> {
    let profiles = config
        .profiles
        .into_iter()
        .map(|profile| {
            let has_credential = profile
                .credential_reference
                .as_deref()
                .map(credentials::read_tts_credential)
                .transpose()?
                .flatten()
                .is_some_and(|credential| !credential.trim().is_empty());
            Ok(TtsProviderProfileDto::from_core(profile, has_credential))
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    Ok(TtsConfigDto {
        schema_version: config.schema_version,
        default_engine: config.default_engine.into(),
        profiles,
        voice_by_language: config
            .voice_by_language
            .into_iter()
            .map(|(language, voice)| (language, voice.into()))
            .collect(),
        playback: config.playback.into(),
    })
}

fn enabled_by_default() -> bool {
    true
}

impl TtsProviderProfileInput {
    fn into_core(self) -> my_reader_core::models::TtsProviderProfile {
        my_reader_core::models::TtsProviderProfile {
            id: self.id,
            name: self.name,
            kind: self.kind.into(),
            enabled: self.enabled,
            endpoint: self.endpoint,
            model: self.model,
            credential_reference: None,
            options: self.options.into(),
            revision: 1,
        }
    }
}

impl TtsProviderProfileDto {
    fn from_core(
        profile: my_reader_core::models::TtsProviderProfile,
        has_credential: bool,
    ) -> Self {
        Self {
            id: profile.id,
            name: profile.name,
            kind: profile.kind.into(),
            enabled: profile.enabled,
            endpoint: profile.endpoint,
            model: profile.model,
            options: profile.options.into(),
            revision: profile.revision,
            has_credential,
        }
    }
}

impl From<TtsEngineSelectionDto> for my_reader_core::models::TtsEngineSelection {
    fn from(value: TtsEngineSelectionDto) -> Self {
        match value {
            TtsEngineSelectionDto::System => Self::System,
            TtsEngineSelectionDto::Provider { profile_id } => Self::Provider { profile_id },
        }
    }
}

impl From<my_reader_core::models::TtsEngineSelection> for TtsEngineSelectionDto {
    fn from(value: my_reader_core::models::TtsEngineSelection) -> Self {
        match value {
            my_reader_core::models::TtsEngineSelection::System => Self::System,
            my_reader_core::models::TtsEngineSelection::Provider { profile_id } => {
                Self::Provider { profile_id }
            }
        }
    }
}

impl From<TtsProviderKindDto> for my_reader_core::models::TtsProviderKind {
    fn from(value: TtsProviderKindDto) -> Self {
        match value {
            TtsProviderKindDto::OpenAiCompatible => Self::OpenAiCompatible,
        }
    }
}

impl From<my_reader_core::models::TtsProviderKind> for TtsProviderKindDto {
    fn from(value: my_reader_core::models::TtsProviderKind) -> Self {
        match value {
            my_reader_core::models::TtsProviderKind::OpenAiCompatible => Self::OpenAiCompatible,
        }
    }
}

impl From<TtsAudioFormatDto> for my_reader_core::models::TtsAudioFormat {
    fn from(value: TtsAudioFormatDto) -> Self {
        match value {
            TtsAudioFormatDto::Mp3 => Self::Mp3,
            TtsAudioFormatDto::Opus => Self::Opus,
            TtsAudioFormatDto::Aac => Self::Aac,
            TtsAudioFormatDto::Flac => Self::Flac,
            TtsAudioFormatDto::Wav => Self::Wav,
        }
    }
}

impl From<my_reader_core::models::TtsAudioFormat> for TtsAudioFormatDto {
    fn from(value: my_reader_core::models::TtsAudioFormat) -> Self {
        match value {
            my_reader_core::models::TtsAudioFormat::Mp3 => Self::Mp3,
            my_reader_core::models::TtsAudioFormat::Opus => Self::Opus,
            my_reader_core::models::TtsAudioFormat::Aac => Self::Aac,
            my_reader_core::models::TtsAudioFormat::Flac => Self::Flac,
            my_reader_core::models::TtsAudioFormat::Wav => Self::Wav,
        }
    }
}

impl From<TtsProviderOptionsDto> for my_reader_core::models::TtsProviderOptions {
    fn from(value: TtsProviderOptionsDto) -> Self {
        match value {
            TtsProviderOptionsDto::OpenAiCompatible {
                response_format,
                instructions,
                voices,
                default_voice,
            } => Self::OpenAiCompatible {
                response_format: response_format.into(),
                instructions,
                voices,
                default_voice,
            },
        }
    }
}

impl From<my_reader_core::models::TtsProviderOptions> for TtsProviderOptionsDto {
    fn from(value: my_reader_core::models::TtsProviderOptions) -> Self {
        match value {
            my_reader_core::models::TtsProviderOptions::OpenAiCompatible {
                response_format,
                instructions,
                voices,
                default_voice,
            } => Self::OpenAiCompatible {
                response_format: response_format.into(),
                instructions,
                voices,
                default_voice,
            },
        }
    }
}

impl From<TtsPlaybackPreferencesDto> for my_reader_core::models::TtsPlaybackPreferences {
    fn from(value: TtsPlaybackPreferencesDto) -> Self {
        Self {
            speed: value.speed,
            pitch: value.pitch,
            skip_page_breaks: value.skip_page_breaks,
            skip_footnotes: value.skip_footnotes,
            announce_context: value.announce_context,
        }
    }
}

impl From<my_reader_core::models::TtsPlaybackPreferences> for TtsPlaybackPreferencesDto {
    fn from(value: my_reader_core::models::TtsPlaybackPreferences) -> Self {
        Self {
            speed: value.speed,
            pitch: value.pitch,
            skip_page_breaks: value.skip_page_breaks,
            skip_footnotes: value.skip_footnotes,
            announce_context: value.announce_context,
        }
    }
}

impl From<TtsVoiceRefDto> for my_reader_core::models::TtsVoiceRef {
    fn from(value: TtsVoiceRefDto) -> Self {
        match value {
            TtsVoiceRefDto::System { voice_id } => Self::System { voice_id },
            TtsVoiceRefDto::Provider {
                profile_id,
                voice_id,
            } => Self::Provider {
                profile_id,
                voice_id,
            },
        }
    }
}

impl From<my_reader_core::models::TtsVoiceRef> for TtsVoiceRefDto {
    fn from(value: my_reader_core::models::TtsVoiceRef) -> Self {
        match value {
            my_reader_core::models::TtsVoiceRef::System { voice_id } => Self::System { voice_id },
            my_reader_core::models::TtsVoiceRef::Provider {
                profile_id,
                voice_id,
            } => Self::Provider {
                profile_id,
                voice_id,
            },
        }
    }
}

impl From<my_reader_core::models::TtsProviderCapabilities> for TtsProviderCapabilitiesDto {
    fn from(value: my_reader_core::models::TtsProviderCapabilities) -> Self {
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

impl From<my_reader_core::models::TtsVoice> for TtsVoiceDto {
    fn from(value: my_reader_core::models::TtsVoice) -> Self {
        Self {
            id: value.id,
            name: value.name,
            language: value.language,
            gender: value.gender,
        }
    }
}

impl From<TtsCachePolicyDto> for my_reader_core::models::TtsCachePolicy {
    fn from(value: TtsCachePolicyDto) -> Self {
        match value {
            TtsCachePolicyDto::Use => Self::Use,
            TtsCachePolicyDto::Refresh => Self::Refresh,
            TtsCachePolicyDto::Bypass => Self::Bypass,
        }
    }
}

impl From<TtsSynthesisInput> for my_reader_core::models::TtsSynthesisRequest {
    fn from(value: TtsSynthesisInput) -> Self {
        Self {
            profile_id: value.profile_id,
            text: value.text,
            language: value.language,
            voice_id: value.voice_id,
            speed: value.speed,
            pitch: value.pitch,
            accepted_mime_types: value.accepted_mime_types,
            cache_policy: value.cache_policy.into(),
        }
    }
}

impl From<my_reader_core::models::TtsAudioArtifact> for TtsAudioArtifactDto {
    fn from(value: my_reader_core::models::TtsAudioArtifact) -> Self {
        Self {
            path: value.path,
            mime_type: value.mime_type,
            duration_ms: value.duration_ms,
            timings: value.timings.into_iter().map(Into::into).collect(),
            cache_key: value.cache_key,
        }
    }
}

impl From<my_reader_core::models::TtsTiming> for TtsTimingDto {
    fn from(value: my_reader_core::models::TtsTiming) -> Self {
        Self {
            start_utf16: value.start_utf16,
            end_utf16: value.end_utf16,
            start_ms: value.start_ms,
            end_ms: value.end_ms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::credentials::test_support::{use_test_backend, MemoryBackend};

    fn openai_input(credential: Option<&str>) -> UpsertTtsProviderInput {
        UpsertTtsProviderInput {
            profile: TtsProviderProfileInput {
                id: "openai".into(),
                name: "OpenAI".into(),
                kind: TtsProviderKindDto::OpenAiCompatible,
                enabled: true,
                endpoint: "https://api.openai.com/v1".into(),
                model: Some("gpt-4o-mini-tts".into()),
                options: TtsProviderOptionsDto::OpenAiCompatible {
                    response_format: TtsAudioFormatDto::Mp3,
                    instructions: None,
                    voices: vec!["reader-voice".into()],
                    default_voice: Some("reader-voice".into()),
                },
            },
            credential: credential.map(Into::into),
            clear_credential: false,
        }
    }

    #[test]
    fn should_persist_profile_without_writing_secret_to_config() {
        let _guard = use_test_backend(MemoryBackend::default());
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");

        let config =
            DesktopTtsService::upsert_profile(&config_path, openai_input(Some("desktop-secret")))
                .unwrap();

        assert!(config.profiles[0].has_credential);
        assert_eq!(config.profiles[0].id, "openai");
        let persisted = std::fs::read_to_string(config_path).unwrap();
        assert!(persisted.contains("tts-provider-openai"));
        assert!(!persisted.contains("desktop-secret"));
        assert_eq!(
            credentials::read_tts_credential("tts-provider-openai").unwrap(),
            Some("desktop-secret".into())
        );
    }

    #[test]
    fn should_delete_keyring_credential_with_profile() {
        let _guard = use_test_backend(MemoryBackend::default());
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        DesktopTtsService::upsert_profile(&config_path, openai_input(Some("secret"))).unwrap();

        let config = DesktopTtsService::remove_profile(&config_path, "openai").unwrap();

        assert!(config.profiles.is_empty());
        assert_eq!(
            credentials::read_tts_credential("tts-provider-openai").unwrap(),
            None
        );
    }
}
