use crate::TtsErrorKind;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{Arc, OnceLock, Weak},
};

use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{
    infrastructure::tts,
    models::{
        QwenTtsModel, QwenTtsPreset, TtsAudioArtifact, TtsCachePolicy, TtsConfig,
        TtsEngineSelection, TtsPlaybackPreferences, TtsProvider, TtsProviderCapabilities,
        TtsProviderKind, TtsProviderOptions, TtsProviderProfile, TtsSynthesisRequest, TtsVoice,
        TtsVoiceRef,
    },
    CoreError,
};

use super::config::{tts::validate_profile, ConfigService};

const CACHE_FORMAT_VERSION: u32 = 1;
const CACHE_EXTENSIONS: &[(&str, &str)] = &[
    ("mp3", "audio/mpeg"),
    ("wav", "audio/wav"),
    ("ogg", "audio/ogg"),
    ("flac", "audio/flac"),
    ("m4a", "audio/mp4"),
    ("aac", "audio/aac"),
];
static SYNTHESIS_LOCKS: OnceLock<Mutex<HashMap<String, Weak<Mutex<()>>>>> = OnceLock::new();

pub struct TtsService;

mod usage;

#[cfg(test)]
mod provider_tests;
#[cfg(test)]
mod removal_tests;

impl TtsService {
    pub fn qwen_presets() -> Vec<QwenTtsPreset> {
        tts::qwen::presets()
    }

    pub async fn qwen_models(
        endpoint: &str,
        credential: Option<&str>,
    ) -> Result<Vec<QwenTtsModel>, CoreError> {
        tts::qwen::discover_models(endpoint, credential).await
    }

    pub async fn discover_qwen_voices(
        endpoint: &str,
        model: &str,
        credential: Option<&str>,
    ) -> Result<Vec<TtsVoice>, CoreError> {
        tts::qwen::discover_voices(endpoint, model, credential).await
    }

    pub async fn discover_models(
        profile: &TtsProviderProfile,
        credential: Option<&str>,
    ) -> Result<Vec<String>, CoreError> {
        tts::discover_models(profile, credential).await
    }

    pub fn get_config(config_path: &Path) -> Result<TtsConfig, CoreError> {
        Ok(ConfigService::load_or_initialize(config_path, None)?.tts)
    }

    pub fn upsert_profile(
        config_path: &Path,
        mut profile: TtsProviderProfile,
    ) -> Result<TtsConfig, CoreError> {
        normalize_profile(&mut profile)?;
        Self::upsert_provider(config_path, profile.into())
    }

    pub fn upsert_provider(
        config_path: &Path,
        mut provider: TtsProvider,
    ) -> Result<TtsConfig, CoreError> {
        provider.model_scoped_voices |= provider.kind == TtsProviderKind::Qwen;
        if provider.id.trim().is_empty() {
            provider.id = Uuid::new_v4().to_string();
        }
        provider
            .credential_reference
            .get_or_insert_with(|| format!("tts:{}:api-key", provider.id));
        let mut models = Vec::new();
        for mut profile in provider.profiles() {
            if profile
                .model
                .as_deref()
                .is_none_or(|model| model.trim().is_empty())
            {
                return Err(tts_error(TtsErrorKind::Configuration, "TTS_MODEL_REQUIRED"));
            }
            normalize_profile(&mut profile)?;
            let mut normalized = TtsProvider::from(profile);
            if provider.model_scoped_voices && provider.kind == TtsProviderKind::OpenAiCompatible {
                normalized.models[0].voices = std::mem::take(&mut normalized.voices);
            }
            provider.name = normalized.name;
            provider.endpoint = normalized.endpoint;
            provider.voices = normalized.voices;
            models.extend(normalized.models);
        }
        provider.models = models;
        let state = ConfigService::mutate_config(config_path, move |state| {
            let previous = state.tts.profiles();
            let resolved = provider.profiles();
            for (model, profile) in provider.models.iter_mut().zip(&resolved) {
                model.revision = previous
                    .iter()
                    .find(|old| old.id == model.id)
                    .map_or(1, |old| {
                        if same_synthesis_profile(old, profile) {
                            old.revision.max(1)
                        } else {
                            old.revision.max(1).saturating_add(1)
                        }
                    });
            }
            if let Some(old) = state
                .tts
                .providers
                .iter_mut()
                .find(|old| old.id == provider.id)
            {
                *old = provider;
            } else {
                state.tts.providers.push(provider);
            }
            reconcile_selections(&mut state.tts, &previous);
            Ok(())
        })?;
        Ok(state.tts)
    }

    pub fn remove_profile(config_path: &Path, profile_id: &str) -> Result<TtsConfig, CoreError> {
        Self::remove_provider(config_path, profile_id)
    }

    pub fn remove_provider(config_path: &Path, provider_id: &str) -> Result<TtsConfig, CoreError> {
        let state = ConfigService::mutate_config(config_path, |state| {
            let previous = state.tts.profiles();
            let count = state.tts.providers.len();
            state
                .tts
                .providers
                .retain(|provider| provider.id != provider_id.trim());
            if state.tts.providers.len() == count {
                return Err(CoreError::NotFound(format!(
                    "TTS_PROFILE_NOT_FOUND: {provider_id}"
                )));
            }
            reconcile_selections(&mut state.tts, &previous);
            Ok(())
        })?;
        Ok(state.tts)
    }

    pub fn set_default_engine(
        config_path: &Path,
        engine: TtsEngineSelection,
    ) -> Result<TtsConfig, CoreError> {
        let state = ConfigService::mutate_config(config_path, move |state| {
            state.tts.default_engine = engine;
            Ok(())
        })?;
        Ok(state.tts)
    }

    pub fn set_playback_preferences(
        config_path: &Path,
        playback: TtsPlaybackPreferences,
    ) -> Result<TtsConfig, CoreError> {
        let state = ConfigService::mutate_config(config_path, move |state| {
            state.tts.playback = playback;
            Ok(())
        })?;
        Ok(state.tts)
    }

    pub fn set_voice_for_language(
        config_path: &Path,
        language: &str,
        voice: Option<TtsVoiceRef>,
    ) -> Result<TtsConfig, CoreError> {
        let language = language.trim().to_ascii_lowercase();
        if language.is_empty() {
            return Err(tts_error(
                TtsErrorKind::Configuration,
                "TTS_LANGUAGE_REQUIRED",
            ));
        }
        let state = ConfigService::mutate_config(config_path, move |state| {
            if let Some(voice) = voice {
                state.tts.voice_by_language.insert(language, voice);
            } else {
                state.tts.voice_by_language.remove(&language);
            }
            Ok(())
        })?;
        Ok(state.tts)
    }

    pub fn provider_capabilities(
        config_path: &Path,
        profile_id: &str,
    ) -> Result<TtsProviderCapabilities, CoreError> {
        let config = Self::get_config(config_path)?;
        Ok(tts::capabilities(&find_profile(&config, profile_id)?))
    }

    pub async fn probe_provider(
        config_path: &Path,
        profile_id: &str,
        credential: Option<&str>,
    ) -> Result<TtsProviderCapabilities, CoreError> {
        let config = Self::get_config(config_path)?;
        let profile = find_profile(&config, profile_id)?;
        tts::probe(&profile, credential).await
    }

    pub async fn list_voices(
        config_path: &Path,
        profile_id: &str,
        credential: Option<&str>,
    ) -> Result<Vec<TtsVoice>, CoreError> {
        let config = Self::get_config(config_path)?;
        let profile = find_profile(&config, profile_id)?;
        tts::list_voices(&profile, credential).await
    }

    /// Test an unsaved profile without changing configuration or writing audio to disk.
    pub async fn test_provider(
        mut profile: TtsProviderProfile,
        text: String,
        credential: Option<&str>,
    ) -> Result<(), CoreError> {
        if profile.id.trim().is_empty() {
            profile.id = "tts-test".into();
        }
        normalize_profile(&mut profile)?;
        let request = TtsSynthesisRequest {
            profile_id: profile.id.clone(),
            text,
            language: None,
            voice_id: profile
                .options
                .default_voice()
                .unwrap_or_default()
                .to_owned(),
            instructions: None,
            speed: None,
            pitch: None,
            accepted_mime_types: Vec::new(),
            cache_policy: TtsCachePolicy::Bypass,
        };
        validate_request(&request)?;
        validate_request_for_profile(&profile, &request)?;
        tokio::time::timeout(
            tts::REQUEST_TIMEOUT,
            tts::synthesize(&profile, &request, credential),
        )
        .await
        .map_err(|_| tts_error(TtsErrorKind::Timeout, "TTS_REQUEST_TIMEOUT"))??;
        Ok(())
    }

    /// Audition an unsaved voice using the same synthesis and audio validation as reading.
    pub async fn preview_provider(
        mut profile: TtsProviderProfile,
        cache_directory: &Path,
        text: String,
        credential: Option<&str>,
    ) -> Result<TtsAudioArtifact, CoreError> {
        if profile.id.trim().is_empty() {
            profile.id = "tts-preview".into();
        }
        normalize_profile(&mut profile)?;
        let request = TtsSynthesisRequest {
            profile_id: profile.id.clone(),
            text,
            language: None,
            voice_id: profile
                .options
                .default_voice()
                .unwrap_or_default()
                .to_owned(),
            instructions: None,
            speed: None,
            pitch: None,
            accepted_mime_types: Vec::new(),
            cache_policy: TtsCachePolicy::Bypass,
        };
        validate_request(&request)?;
        validate_request_for_profile(&profile, &request)?;
        tokio::time::timeout(
            tts::REQUEST_TIMEOUT,
            Self::synthesize_part(&profile, cache_directory, request, credential),
        )
        .await
        .map_err(|_| tts_error(TtsErrorKind::Timeout, "TTS_REQUEST_TIMEOUT"))?
    }

    pub async fn synthesize(
        config_path: &Path,
        cache_directory: &Path,
        request: TtsSynthesisRequest,
        credential: Option<&str>,
    ) -> Result<TtsAudioArtifact, CoreError> {
        validate_request(&request)?;
        let config = Self::get_config(config_path)?;
        let profile = find_profile(&config, &request.profile_id)?;
        validate_request_for_profile(&profile, &request)?;
        let rate = if profile.kind == TtsProviderKind::Qwen {
            let requested = request.speed.unwrap_or(1.0);
            let synthesized = if tts::capabilities(&profile).synthesis_rate {
                requested.clamp(0.5, 2.0)
            } else {
                1.0
            };
            Some(requested / synthesized)
        } else {
            None
        };
        let mut artifact = tokio::time::timeout(
            tts::REQUEST_TIMEOUT,
            Self::synthesize_part(&profile, cache_directory, request, credential),
        )
        .await
        .map_err(|_| tts_error(TtsErrorKind::Timeout, "TTS_REQUEST_TIMEOUT"))??;
        artifact.playback_rate = rate;
        Ok(artifact)
    }

    async fn synthesize_part(
        profile: &TtsProviderProfile,
        cache_directory: &Path,
        request: TtsSynthesisRequest,
        credential: Option<&str>,
    ) -> Result<TtsAudioArtifact, CoreError> {
        let cache_key = synthesis_cache_key(profile, &request)?;

        if request.cache_policy == TtsCachePolicy::Use {
            if let Some(artifact) = cached_artifact(cache_directory, &cache_key, &request).await? {
                return Ok(artifact);
            }
        }

        let _single_flight = if request.cache_policy == TtsCachePolicy::Use {
            let lock = synthesis_lock(cache_directory, &cache_key).await;
            let guard = lock.lock_owned().await;
            if let Some(artifact) = cached_artifact(cache_directory, &cache_key, &request).await? {
                return Ok(artifact);
            }
            Some(guard)
        } else {
            None
        };

        let audio = tts::synthesize(profile, &request, credential).await?;
        ensure_accepted_mime(&request, &audio.mime_type)?;
        let (file_stem, artifact_cache_key) = match request.cache_policy {
            TtsCachePolicy::Bypass => (format!("transient-{}", Uuid::new_v4()), None),
            TtsCachePolicy::Use | TtsCachePolicy::Refresh => (cache_key.clone(), Some(cache_key)),
        };
        tokio::fs::create_dir_all(cache_directory).await?;
        let path = cache_directory.join(format!("{file_stem}.{}", audio.extension));
        write_atomic(&path, &audio.bytes).await?;

        Ok(TtsAudioArtifact {
            path: path.to_string_lossy().into_owned(),
            mime_type: audio.mime_type,
            duration_ms: None,
            timings: Vec::new(),
            cache_key: artifact_cache_key,
            playback_rate: None,
        })
    }
}

async fn synthesis_lock(cache_directory: &Path, cache_key: &str) -> Arc<Mutex<()>> {
    let key = cache_directory
        .join(cache_key)
        .to_string_lossy()
        .into_owned();
    let locks = SYNTHESIS_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut locks = locks.lock().await;
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
        return lock;
    }
    let lock = Arc::new(Mutex::new(()));
    locks.insert(key, Arc::downgrade(&lock));
    lock
}

fn normalize_profile(profile: &mut TtsProviderProfile) -> Result<(), CoreError> {
    let qwen = profile.kind == TtsProviderKind::Qwen;
    profile.id = if profile.id.trim().is_empty() {
        Uuid::new_v4().to_string()
    } else {
        profile.id.trim().to_owned()
    };
    profile.name = profile.name.trim().to_owned();
    if profile.name.is_empty() {
        profile.name = if qwen { "Qwen" } else { "OpenAI" }.into();
    }
    profile.endpoint = profile.endpoint.trim().trim_end_matches('/').to_owned();
    if profile.endpoint.is_empty() {
        profile.endpoint = if qwen {
            tts::qwen::DEFAULT_ENDPOINT
        } else {
            "https://api.openai.com/v1"
        }
        .into();
    }
    profile.model = normalize_optional(profile.model.take());
    profile.credential_reference = normalize_optional(profile.credential_reference.take());
    if !qwen {
        profile
            .model
            .get_or_insert_with(|| "gpt-4o-mini-tts".into());
    }
    profile
        .credential_reference
        .get_or_insert_with(|| format!("tts:{}:api-key", profile.id));
    let (TtsProviderOptions::OpenAiCompatible {
        instructions,
        voices,
        default_voice,
        ..
    }
    | TtsProviderOptions::Qwen {
        instructions,
        voices,
        default_voice,
        ..
    }) = &mut profile.options;
    *instructions = normalize_optional(instructions.take());
    let mut normalized_voices = Vec::new();
    for voice in std::mem::take(voices) {
        let voice = voice.trim();
        if !voice.is_empty() && !normalized_voices.iter().any(|existing| existing == voice) {
            normalized_voices.push(voice.to_owned());
        }
    }
    *voices = normalized_voices;
    *default_voice = normalize_optional(default_voice.take());
    if qwen && default_voice.is_none() {
        *default_voice = voices.first().cloned();
    }
    if let TtsProviderOptions::Qwen {
        response_format, ..
    } = &mut profile.options
    {
        let selected = tts::qwen::model(
            profile.model.as_deref().unwrap_or_default(),
            &profile.endpoint,
        )?;
        if !selected.audio_formats.contains(response_format) {
            *response_format = selected.audio_formats[0];
        }
    }
    profile.revision = profile.revision.max(1);
    validate_profile(profile)?;
    validate_configured_voices(profile)
}

fn validate_configured_voices(profile: &TtsProviderProfile) -> Result<(), CoreError> {
    let voices = profile.options.voices();
    let default_voice = profile.options.default_voice();
    if voices.is_empty() {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_VOICES_REQUIRED",
        ));
    }
    let default_voice = default_voice
        .ok_or_else(|| tts_error(TtsErrorKind::Configuration, "TTS_DEFAULT_VOICE_REQUIRED"))?;
    if !voices.iter().any(|voice| voice == default_voice) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_DEFAULT_VOICE_NOT_CONFIGURED",
        ));
    }
    Ok(())
}

fn configured_voice_ids(profile: &TtsProviderProfile) -> HashSet<String> {
    profile.options.voices().iter().cloned().collect()
}

fn validate_request(request: &TtsSynthesisRequest) -> Result<(), CoreError> {
    if request
        .instructions
        .as_ref()
        .is_some_and(|value| value.len() > 4000)
    {
        return Err(tts_error(
            TtsErrorKind::InvalidRequest,
            "TTS_INSTRUCTIONS_TOO_LONG",
        ));
    }
    if request.profile_id.trim().is_empty() {
        return Err(tts_error(
            TtsErrorKind::InvalidRequest,
            "TTS_PROFILE_ID_REQUIRED",
        ));
    }
    if request.text.trim().is_empty() {
        return Err(tts_error(TtsErrorKind::InvalidRequest, "TTS_TEXT_REQUIRED"));
    }
    if request.voice_id.trim().is_empty() {
        return Err(tts_error(
            TtsErrorKind::InvalidRequest,
            "TTS_VOICE_REQUIRED",
        ));
    }
    if request
        .speed
        .is_some_and(|speed| !speed.is_finite() || !(0.25..=4.0).contains(&speed))
    {
        return Err(tts_error(TtsErrorKind::InvalidRequest, "INVALID_TTS_SPEED"));
    }
    if request
        .pitch
        .is_some_and(|pitch| !pitch.is_finite() || !(0.5..=2.0).contains(&pitch))
    {
        return Err(tts_error(TtsErrorKind::InvalidRequest, "INVALID_TTS_PITCH"));
    }
    Ok(())
}

fn validate_request_for_profile(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
) -> Result<(), CoreError> {
    if profile.kind != TtsProviderKind::Qwen
        && !configured_voice_ids(profile).contains(&request.voice_id)
    {
        return Err(tts_error(
            TtsErrorKind::InvalidRequest,
            "TTS_VOICE_NOT_CONFIGURED",
        ));
    }
    let capabilities = tts::capabilities(profile);
    if capabilities
        .max_input_chars
        .is_some_and(|limit| request.text.chars().count() > limit as usize)
    {
        return Err(tts_error(TtsErrorKind::InvalidRequest, "TTS_TEXT_TOO_LONG"));
    }
    if request
        .pitch
        .is_some_and(|pitch| pitch != 1.0 && !capabilities.synthesis_pitch)
    {
        return Err(tts_error(
            TtsErrorKind::Unsupported,
            "TTS_PITCH_UNSUPPORTED",
        ));
    }
    Ok(())
}

fn reconcile_selections(config: &mut TtsConfig, previous: &[TtsProviderProfile]) {
    let profiles = config.profiles();
    let removed = usage::removed_selections(previous, &usage::model_voices(&profiles));
    if let TtsEngineSelection::Provider { profile_id } = &config.default_engine {
        if !profiles.iter().any(|profile| &profile.id == profile_id)
            || config.voice_by_language.values().any(|voice| {
                matches!(voice, TtsVoiceRef::Provider { profile_id: id, .. } if id == profile_id)
                    && removed.iter().any(|item| item.matches(voice))
            })
        {
            config.default_engine = TtsEngineSelection::System;
        }
    }
    config.voice_by_language.retain(|_, voice| {
        if removed.iter().any(|item| item.matches(voice)) {
            return false;
        }
        let TtsVoiceRef::Provider {
            profile_id,
            voice_id,
        } = voice
        else {
            return true;
        };
        profiles
            .iter()
            .find(|profile| &profile.id == profile_id)
            .is_some_and(|profile| {
                configured_voice_ids(profile).contains(voice_id)
                    || (profile.kind == TtsProviderKind::Qwen
                        && previous
                            .iter()
                            .any(|old| old.id == profile.id && old.model == profile.model))
            })
    });
}

fn find_profile(config: &TtsConfig, profile_id: &str) -> Result<TtsProviderProfile, CoreError> {
    config
        .profiles()
        .into_iter()
        .find(|profile| profile.id == profile_id.trim())
        .ok_or_else(|| CoreError::NotFound(format!("TTS_PROFILE_NOT_FOUND: {profile_id}")))
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn same_synthesis_profile(left: &TtsProviderProfile, right: &TtsProviderProfile) -> bool {
    left.kind == right.kind
        && left.endpoint == right.endpoint
        && left.model == right.model
        && left.credential_reference == right.credential_reference
        && left.options == right.options
}

fn synthesis_cache_key(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
) -> Result<String, CoreError> {
    let value = serde_json::json!({
        "version": CACHE_FORMAT_VERSION,
        "providerKind": profile.kind,
        "profileId": profile.id,
        "profileRevision": profile.revision,
        "endpoint": profile.endpoint,
        "model": profile.model,
        "options": profile.options,
        "text": request.text,
        "language": request.language,
        "voiceId": request.voice_id,
        "instructions": request.instructions,
        "speed": request.speed.unwrap_or(1.0),
        "pitch": request.pitch.unwrap_or(1.0),
    });
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(&value)?)))
}

async fn cached_artifact(
    cache_directory: &Path,
    cache_key: &str,
    request: &TtsSynthesisRequest,
) -> Result<Option<TtsAudioArtifact>, CoreError> {
    for (extension, mime_type) in CACHE_EXTENSIONS {
        let path = cache_directory.join(format!("{cache_key}.{extension}"));
        if tokio::fs::try_exists(&path).await? {
            ensure_accepted_mime(request, mime_type)?;
            return Ok(Some(TtsAudioArtifact {
                path: path.to_string_lossy().into_owned(),
                mime_type: (*mime_type).into(),
                duration_ms: None,
                timings: Vec::new(),
                cache_key: Some(cache_key.into()),
                playback_rate: None,
            }));
        }
    }
    Ok(None)
}

fn ensure_accepted_mime(request: &TtsSynthesisRequest, mime_type: &str) -> Result<(), CoreError> {
    if request.accepted_mime_types.is_empty()
        || request.accepted_mime_types.iter().any(|accepted| {
            accepted
                .split(';')
                .next()
                .is_some_and(|accepted| accepted.trim().eq_ignore_ascii_case(mime_type))
        })
    {
        Ok(())
    } else {
        Err(tts_error(
            TtsErrorKind::Unsupported,
            "TTS_AUDIO_FORMAT_NOT_ACCEPTED",
        ))
    }
}

async fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| tts_error(TtsErrorKind::Cache, "INVALID_TTS_CACHE_PATH"))?;
    let temporary = path.with_file_name(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    tokio::fs::write(&temporary, bytes).await?;
    if let Err(error) = tokio::fs::rename(&temporary, path).await {
        if tokio::fs::try_exists(path).await? {
            tokio::fs::remove_file(path).await?;
            tokio::fs::rename(&temporary, path).await?;
        } else {
            let _ = tokio::fs::remove_file(&temporary).await;
            return Err(error.into());
        }
    }
    Ok(())
}

fn tts_error(kind: TtsErrorKind, code: &str) -> CoreError {
    CoreError::Tts {
        kind,
        message: code.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::Value;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        task::JoinHandle,
    };

    use super::*;
    use crate::models::{TtsAudioFormat, TtsProviderKind, TtsProviderOptions};

    fn openai_profile(endpoint: String) -> TtsProviderProfile {
        TtsProviderProfile {
            id: "openai".into(),
            name: "OpenAI".into(),
            kind: TtsProviderKind::OpenAiCompatible,
            endpoint,
            model: Some("gpt-4o-mini-tts".into()),
            credential_reference: Some("tts:openai:api-key".into()),
            options: TtsProviderOptions::OpenAiCompatible {
                response_format: TtsAudioFormat::Mp3,
                instructions: Some("Speak warmly".into()),
                voices: vec!["reader-voice".into(), "narrator-voice".into()],
                default_voice: Some("reader-voice".into()),
            },
            revision: 1,
        }
    }

    fn request(profile_id: &str, accepted_mime_type: &str) -> TtsSynthesisRequest {
        TtsSynthesisRequest {
            profile_id: profile_id.into(),
            text: "Hello from MyReader.".into(),
            language: Some("en-US".into()),
            voice_id: "reader-voice".into(),
            speed: Some(1.25),
            pitch: None,
            accepted_mime_types: vec![accepted_mime_type.into()],
            cache_policy: TtsCachePolicy::Use,
            instructions: None,
        }
    }

    #[tokio::test]
    async fn legacy_disabled_providers_remain_selectable_and_playable() {
        for version in [1, 2] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join("config.json");
            let audio = b"ID3test-audio";
            let (endpoint, server) = test_server(vec![response("audio/mpeg", audio)]).await;
            let profile = openai_profile(endpoint);
            let provider = TtsProvider::from(profile.clone());
            let (key, mut saved) = if version == 1 {
                ("profiles", serde_json::to_value(&profile).unwrap())
            } else {
                ("providers", serde_json::to_value(&provider).unwrap())
            };
            saved["enabled"] = false.into();
            let mut config = serde_json::json!({"tts": {"schemaVersion": version}});
            config["tts"][key] = serde_json::json!([saved]);
            std::fs::write(&path, serde_json::to_vec(&config).unwrap()).unwrap();

            assert_eq!(
                TtsService::get_config(&path).unwrap().providers,
                vec![provider.clone()]
            );
            let engine = TtsEngineSelection::Provider {
                profile_id: profile.id.clone(),
            };
            TtsService::set_default_engine(&path, engine.clone()).unwrap();
            let updated = TtsService::upsert_provider(&path, provider).unwrap();
            assert_eq!(updated.default_engine, engine);
            assert!(TtsService::list_voices(&path, &profile.id, None)
                .await
                .unwrap()
                .iter()
                .any(|voice| voice.id == "reader-voice"));
            let artifact = TtsService::synthesize(
                &path,
                directory.path(),
                request(&profile.id, "audio/mpeg"),
                Some("fixture-key"),
            )
            .await
            .unwrap();
            assert_eq!(std::fs::read(artifact.path).unwrap(), audio);
            assert_eq!(server.await.unwrap().len(), 1);
            let stored: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            assert!(stored["tts"]["providers"][0].get("enabled").is_none());
        }
    }

    #[tokio::test]
    async fn tests_unsaved_profiles_with_real_synthesis() {
        let (endpoint, server) = test_server(vec![response("audio/mpeg", b"ID3test-audio")]).await;
        let mut profile = openai_profile(endpoint);
        profile.id.clear();
        profile.model = Some("draft-model".into());
        TtsService::test_provider(profile, "Test this draft.".into(), Some("draft-key"))
            .await
            .unwrap();
        let requests = server.await.unwrap();
        assert_eq!(requests.len(), 1);
        let body = request_body(&requests[0]);
        assert_eq!(body["model"], "draft-model");
        assert_eq!(body["voice"], "reader-voice");
        assert_eq!(body["input"], "Test this draft.");
        assert_eq!(body["instructions"], "Speak warmly");
        assert!(request_text(&requests[0]).contains("Bearer draft-key"));
    }

    #[tokio::test]
    async fn provider_tests_validate_before_sending_and_report_provider_failure() {
        let mut profile = openai_profile("http://127.0.0.1:1".into());
        assert!(
            TtsService::test_provider(profile.clone(), " ".into(), Some("key"))
                .await
                .unwrap_err()
                .to_string()
                .contains("TTS_TEXT_REQUIRED")
        );
        assert!(
            TtsService::test_provider(profile.clone(), "Test".into(), None)
                .await
                .unwrap_err()
                .to_string()
                .contains("TTS_CREDENTIAL_REQUIRED")
        );
        let (endpoint, server) = test_server(vec![
            b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"
                .to_vec(),
        ])
        .await;
        profile.endpoint = endpoint;
        assert!(matches!(
            TtsService::test_provider(profile, "Test".into(), Some("bad-key")).await,
            Err(CoreError::Tts {
                kind: TtsErrorKind::Unauthorized,
                ..
            })
        ));
        assert_eq!(server.await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn previews_unsaved_voice_to_validated_audio_without_configuration() {
        let dir = tempfile::tempdir().unwrap();
        let audio = b"ID3\x04\x00\x00MyReader";
        let (endpoint, server) = test_server(vec![response("audio/mpeg", audio)]).await;
        let mut profile = openai_profile(endpoint);
        profile.id.clear();
        if let TtsProviderOptions::OpenAiCompatible { default_voice, .. } = &mut profile.options {
            *default_voice = Some("narrator-voice".into());
        }
        let artifact = TtsService::preview_provider(
            profile,
            dir.path(),
            "Draft preview".into(),
            Some("draft-key"),
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&artifact.path).unwrap(), audio);
        assert_eq!(artifact.mime_type, "audio/mpeg");
        let requests = server.await.unwrap();
        assert_eq!(request_body(&requests[0])["voice"], "narrator-voice");
        assert_eq!(request_body(&requests[0])["input"], "Draft preview");
        assert!(!dir.path().join("config.json").exists());
    }

    #[tokio::test]
    async fn discovers_models_from_speech_endpoint_without_synthesizing() {
        let (endpoint, server) = test_server(vec![response(
            "application/json",
            br#"{"data":[{"id":"b"},{"id":"a"},{"id":"b"}]}"#,
        )])
        .await;
        let profile = openai_profile(format!("{endpoint}/v1/audio/speech"));
        let models = TtsService::discover_models(&profile, Some("draft-key"))
            .await
            .unwrap();
        assert_eq!(models, vec!["a", "b"]);
        let requests = server.await.unwrap();
        let request = request_text(&requests[0]);
        assert!(request.starts_with("GET /v1/models HTTP/1.1"));
        assert!(request.contains("Bearer draft-key"));
    }

    async fn test_server(responses: Vec<Vec<u8>>) -> (String, JoinHandle<Vec<Vec<u8>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move {
            let mut requests = Vec::new();
            for response in responses {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                loop {
                    let mut chunk = [0_u8; 4096];
                    let count = stream.read(&mut chunk).await.unwrap();
                    if count == 0 {
                        break;
                    }
                    request.extend_from_slice(&chunk[..count]);
                    if request_complete(&request) {
                        break;
                    }
                }
                requests.push(request);
                stream.write_all(&response).await.unwrap();
                stream.shutdown().await.unwrap();
            }
            requests
        });
        (format!("http://{address}"), handle)
    }

    fn request_complete(request: &[u8]) -> bool {
        let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n") else {
            return false;
        };
        let headers = String::from_utf8_lossy(&request[..header_end]);
        let content_length = headers.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        });
        request.len() >= header_end + 4 + content_length.unwrap_or(0)
    }

    fn response(content_type: &str, body: &[u8]) -> Vec<u8> {
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        response.extend_from_slice(body);
        response
    }

    fn request_body(request: &[u8]) -> Value {
        let body_offset = request
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .unwrap()
            + 4;
        serde_json::from_slice(&request[body_offset..]).unwrap()
    }

    fn request_text(request: &[u8]) -> String {
        String::from_utf8_lossy(request).into_owned()
    }

    fn qwen_profile(endpoint: String, model: &str, voice: &str) -> TtsProviderProfile {
        TtsProviderProfile {
            id: "qwen".into(),
            name: "Qwen".into(),
            kind: TtsProviderKind::Qwen,
            endpoint,
            model: Some(model.into()),
            credential_reference: Some("tts:qwen:api-key".into()),
            options: TtsProviderOptions::Qwen {
                response_format: TtsAudioFormat::Wav,
                instructions: None,
                voices: vec![voice.into()],
                default_voice: Some(voice.into()),
            },
            revision: 1,
        }
    }

    #[tokio::test]
    // Tungstenite fixes the handshake callback's error type to an HTTP response.
    #[allow(clippy::result_large_err)]
    async fn qwen_websocket_synthesis_returns_completed_audio_and_reuses_cache() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::{
            handshake::server::{Request, Response},
            Message,
        };

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!(
            "ws://{}/api-ws/v1/inference",
            listener.local_addr().unwrap()
        );
        let audio = b"RIFF\x10\x00\x00\x00WAVEfmt test";
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket =
                tokio_tungstenite::accept_hdr_async(stream, |req: &Request, res: Response| {
                    assert_eq!(req.uri().path(), "/api-ws/v1/inference");
                    assert_eq!(req.headers()["authorization"], "Bearer private-key");
                    Ok(res)
                })
                .await
                .unwrap();
            let start: Value =
                serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap())
                    .unwrap();
            assert_eq!(start["header"]["action"], "run-task");
            assert_eq!(start["header"]["streaming"], "duplex");
            assert_eq!(start["payload"]["model"], "qwen-audio-3.0-tts-plus");
            assert_eq!(start["payload"]["parameters"]["voice"], "longanhuan_v3.6");
            assert_eq!(start["payload"]["parameters"]["format"], "wav");
            assert_eq!(start["payload"]["parameters"]["rate"], 1.5);
            assert_eq!(
                start["payload"]["parameters"]["instruction"],
                "Speak calmly"
            );
            let task_id = &start["header"]["task_id"];
            socket.send(Message::text(serde_json::json!({"header":{"event":"task-started","task_id":task_id},"payload":{}}).to_string())).await.unwrap();
            let text: Value =
                serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap())
                    .unwrap();
            assert_eq!(text["header"]["action"], "continue-task");
            assert_eq!(text["header"]["task_id"], *task_id);
            assert_eq!(text["payload"]["input"]["text"], "你好，Hello.");
            let finish: Value =
                serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap())
                    .unwrap();
            assert_eq!(finish["header"]["action"], "finish-task");
            assert_eq!(finish["header"]["task_id"], *task_id);
            socket
                .send(Message::binary(audio[..7].to_vec()))
                .await
                .unwrap();
            socket
                .send(Message::binary(audio[7..].to_vec()))
                .await
                .unwrap();
            socket.send(Message::text(serde_json::json!({"header":{"event":"task-finished","task_id":task_id},"payload":{}}).to_string())).await.unwrap();
        });
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("config.json");
        let mut profile = qwen_profile(endpoint, "qwen-audio-3.0-tts-plus", "longanhuan_v3.6");
        if let TtsProviderOptions::Qwen { instructions, .. } = &mut profile.options {
            *instructions = Some("Speak calmly".into());
        }
        TtsService::upsert_profile(&config_path, profile).unwrap();
        let mut input = request("qwen", "audio/wav");
        input.text = "你好，Hello.".into();
        input.voice_id = "longanhuan_v3.6".into();
        input.speed = Some(1.5);
        let artifact =
            TtsService::synthesize(&config_path, dir.path(), input.clone(), Some("private-key"))
                .await
                .unwrap();
        assert_eq!(std::fs::read(&artifact.path).unwrap(), audio);
        assert_eq!(artifact.mime_type, "audio/wav");
        server.await.unwrap();
        assert_eq!(
            artifact,
            TtsService::synthesize(&config_path, dir.path(), input, Some("private-key"))
                .await
                .unwrap()
        );
    }

    #[tokio::test]
    async fn qwen_websocket_does_not_cache_failed_or_incomplete_audio() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::Message;

        for fail in [true, false] {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let endpoint = format!(
                "ws://{}/api-ws/v1/inference",
                listener.local_addr().unwrap()
            );
            let server = tokio::spawn(async move {
                let (stream, _) = listener.accept().await.unwrap();
                let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
                let start: Value =
                    serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap())
                        .unwrap();
                let id = &start["header"]["task_id"];
                socket
                    .send(Message::text(
                        serde_json::json!({"header":{"event":"task-started","task_id":id}})
                            .to_string(),
                    ))
                    .await
                    .unwrap();
                socket.next().await.unwrap().unwrap();
                socket.next().await.unwrap().unwrap();
                socket
                    .send(Message::binary(
                        b"RIFF\x10\x00\x00\x00WAVEfmt partial".to_vec(),
                    ))
                    .await
                    .unwrap();
                if fail {
                    socket.send(Message::text(serde_json::json!({"header":{"event":"task-failed","task_id":id,
                        "error_code":"InvalidParameter","error_message":"private-key and private book text"}}).to_string())).await.unwrap();
                } else {
                    socket.close(None).await.unwrap();
                }
            });
            let dir = tempfile::tempdir().unwrap();
            let config_path = dir.path().join("config.json");
            let cache = dir.path().join("audio");
            TtsService::upsert_profile(
                &config_path,
                qwen_profile(endpoint, "qwen-audio-3.0-tts-plus", "reader-voice"),
            )
            .unwrap();
            let error = TtsService::synthesize(
                &config_path,
                &cache,
                request("qwen", "audio/wav"),
                Some("private-key"),
            )
            .await
            .unwrap_err()
            .to_string();
            assert!(error.contains(if fail {
                "QWEN_InvalidParameter"
            } else {
                "QWEN_TASK_INTERRUPTED"
            }));
            assert!(!error.contains("private-key"));
            if fail {
                assert!(error.contains("[credential] and private book text"));
            }
            assert!(!cache.exists());
            server.await.unwrap();
        }
    }

    #[tokio::test]
    async fn qwen_websocket_cancellation_closes_connection_without_publishing_audio() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::Message;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!(
            "ws://{}/api-ws/v1/inference",
            listener.local_addr().unwrap()
        );
        let (ready, waiting) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let start: Value =
                serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap())
                    .unwrap();
            socket.send(Message::text(serde_json::json!({"header":{"event":"task-started","task_id":start["header"]["task_id"]}}).to_string())).await.unwrap();
            socket.next().await.unwrap().unwrap();
            socket.next().await.unwrap().unwrap();
            socket
                .send(Message::binary(
                    b"RIFF\x10\x00\x00\x00WAVEfmt partial".to_vec(),
                ))
                .await
                .unwrap();
            ready.send(()).unwrap();
            let closed = tokio::time::timeout(std::time::Duration::from_secs(2), socket.next())
                .await
                .unwrap();
            assert!(!matches!(
                closed,
                Some(Ok(Message::Text(_) | Message::Binary(_)))
            ));
        });
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("config.json");
        let cache = dir.path().join("audio");
        TtsService::upsert_profile(
            &config_path,
            qwen_profile(endpoint, "qwen-audio-3.0-tts-plus", "reader-voice"),
        )
        .unwrap();
        let audio_path = cache.clone();
        let client = tokio::spawn(async move {
            TtsService::synthesize(
                &config_path,
                &audio_path,
                request("qwen", "audio/wav"),
                Some("private-key"),
            )
            .await
        });
        waiting.await.unwrap();
        client.abort();
        assert!(client.await.unwrap_err().is_cancelled());
        server.await.unwrap();
        assert!(!cache.exists());
    }

    #[test]
    fn qwen_presets_contain_only_connection_settings() {
        let presets = TtsService::qwen_presets();
        assert_eq!(presets.len(), 3);
        assert_eq!(presets[0].endpoint, tts::qwen::DEFAULT_ENDPOINT);
        assert_eq!(presets[1].endpoint, "https://maas.qianwenaiapi.com/api/v1");
        assert_eq!(presets[2].endpoint, "https://dashscope.aliyuncs.com/api/v1");
    }

    #[tokio::test]
    async fn qwen_catalog_pages_official_metadata_and_accepts_future_models() {
        let pages = [
            serde_json::json!({"output":{"total":4,"models":[
                {"model":"qwen-audio-9.0-tts-plus", "name":"New Audio"},
                {"model":"qwen3-tts-flash-realtime"}
            ]}}),
            serde_json::json!({"output":{"total":4,"models":[
                {"model":"qwen3-tts-instruct-flash-2099-01-01"},
                {"model":"qwen-max"}
            ]}}),
        ];
        let (endpoint, server) = test_server(
            pages
                .iter()
                .map(|page| response("application/json", &serde_json::to_vec(page).unwrap()))
                .collect(),
        )
        .await;
        let models = TtsService::qwen_models(&endpoint, Some("catalog-key"))
            .await
            .unwrap();
        assert_eq!(
            models.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            [
                "qwen-audio-9.0-tts-plus",
                "qwen3-tts-instruct-flash-2099-01-01"
            ]
        );
        assert!(models[0].voices.is_empty());
        assert!(!models[1].voices.is_empty());
        for (index, request) in server.await.unwrap().iter().enumerate() {
            let text = request_text(request);
            assert!(text.starts_with(&format!(
                "GET /api/v1/models?page_no={}&page_size=100 ",
                index + 1
            )));
            assert!(text
                .to_lowercase()
                .contains("authorization: bearer catalog-key"));
        }
    }

    #[tokio::test]
    async fn token_plan_catalog_stays_on_subscription_gateway() {
        let body = serde_json::json!({"data":[{"id":"qwen-audio-9.0-tts-plus"},{"id":"qwen3-tts-flash"},{"id":"qwen-max"}]});
        let (endpoint, server) = test_server(vec![response(
            "application/json",
            &serde_json::to_vec(&body).unwrap(),
        )])
        .await;
        let websocket = format!("{}/api-ws/v1/inference", endpoint.replace("http:", "ws:"));
        let models = TtsService::qwen_models(&websocket, Some("sk-sp-private"))
            .await
            .unwrap();
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "qwen-audio-9.0-tts-plus");
        assert!(
            request_text(&server.await.unwrap()[0]).starts_with("GET /compatible-mode/v1/models?")
        );
        assert!(TtsService::qwen_models(&endpoint, Some("sk-sp-private"))
            .await
            .unwrap_err()
            .to_string()
            .contains("QWEN_TOKEN_PLAN_WEBSOCKET_REQUIRED"));
    }

    #[tokio::test]
    async fn catalog_does_not_silently_substitute_defaults_on_failure() {
        for body in [
            serde_json::json!({"output":{}}),
            serde_json::json!({"code":"InvalidApiKey", "message":"bad secret"}),
        ] {
            let (endpoint, server) = test_server(vec![response(
                "application/json",
                &serde_json::to_vec(&body).unwrap(),
            )])
            .await;
            let error = TtsService::qwen_models(&endpoint, Some("secret"))
                .await
                .unwrap_err()
                .to_string();
            assert!(!error.contains("secret"));
            server.await.unwrap();
        }
    }

    #[tokio::test]
    async fn qwen_websocket_timeout_closes_the_request_without_caching_partial_audio() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::Message;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!(
            "ws://{}/api-ws/v1/inference",
            listener.local_addr().unwrap()
        );
        let (ready, waiting) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let start: Value =
                serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap())
                    .unwrap();
            socket.send(Message::text(serde_json::json!({"header":{"event":"task-started","task_id":start["header"]["task_id"]}}).to_string())).await.unwrap();
            socket.next().await.unwrap().unwrap();
            socket.next().await.unwrap().unwrap();
            ready.send(()).unwrap();
            let closed = socket.next().await;
            assert!(!matches!(
                closed,
                Some(Ok(Message::Text(_) | Message::Binary(_)))
            ));
        });
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("config.json");
        let cache = dir.path().join("audio");
        TtsService::upsert_profile(
            &config_path,
            qwen_profile(endpoint, "qwen-audio-3.0-tts-plus", "reader-voice"),
        )
        .unwrap();
        let audio_path = cache.clone();
        let client = tokio::spawn(async move {
            TtsService::synthesize(
                &config_path,
                &audio_path,
                request("qwen", "audio/wav"),
                Some("private-key"),
            )
            .await
        });
        waiting.await.unwrap();
        tokio::time::pause();
        tokio::time::advance(std::time::Duration::from_secs(20)).await;
        assert!(client
            .await
            .unwrap()
            .unwrap_err()
            .to_string()
            .contains("timeout:TTS_REQUEST_TIMEOUT"));
        server.await.unwrap();
        assert!(!cache.exists());
    }

    #[tokio::test]
    async fn qwen_token_plan_does_not_send_subscription_credentials_to_standard_http_apis() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let profile = qwen_profile(
            "http://127.0.0.1:9/api/v1".into(),
            "qwen-audio-3.0-tts-plus",
            "reader-voice",
        );
        TtsService::upsert_profile(&path, profile.clone()).unwrap();
        let error = TtsService::synthesize(
            &path,
            dir.path(),
            request("qwen", "audio/wav"),
            Some("sk-sp-fixture"),
        )
        .await
        .unwrap_err();
        assert!(error
            .to_string()
            .contains("QWEN_TOKEN_PLAN_WEBSOCKET_REQUIRED"));
        let error = TtsService::discover_qwen_voices(
            &profile.endpoint,
            profile.model.as_deref().unwrap(),
            Some("sk-sp-fixture"),
        )
        .await
        .unwrap_err();
        assert!(error
            .to_string()
            .contains("QWEN_TOKEN_PLAN_WEBSOCKET_REQUIRED"));
    }

    #[tokio::test]
    async fn qwen_models_use_native_protocol_and_download_audio_without_credentials() {
        for id in [
            "qwen-audio-9.0-tts-plus",
            "qwen3-tts-flash",
            "qwen3-tts-instruct-flash-2099-01-01",
            "qwen3-tts-vc-2099-01-01",
            "qwen3-tts-vd-2099-01-01",
        ] {
            let model = tts::qwen::model(id, "https://dashscope.aliyuncs.com/api/v1").unwrap();
            let voice = model
                .voices
                .first()
                .map(|v| v.id.as_str())
                .unwrap_or("my-account-voice");
            let (audio_endpoint, audio_server) = test_server(vec![response(
                "audio/wav",
                b"RIFF\x10\x00\x00\x00WAVEfmt test",
            )])
            .await;
            let json = serde_json::json!({"output": {"audio": {"url": format!("{audio_endpoint}/signed.wav")}}});
            let (endpoint, server) = test_server(vec![response(
                "application/json",
                &serde_json::to_vec(&json).unwrap(),
            )])
            .await;
            let dir = tempfile::tempdir().unwrap();
            let config_path = dir.path().join("config.json");
            let mut profile = qwen_profile(endpoint, &model.id, voice);
            if model.supports_instructions {
                if let TtsProviderOptions::Qwen { instructions, .. } = &mut profile.options {
                    *instructions = Some("Speak calmly".into());
                }
            }
            TtsService::upsert_profile(&config_path, profile).unwrap();
            let mut input = request("qwen", "audio/wav");
            input.text = "你好，Hello.".into();
            input.voice_id = voice.into();
            input.speed = Some(3.0);
            let artifact = TtsService::synthesize(
                &config_path,
                dir.path(),
                input.clone(),
                Some("private-key"),
            )
            .await
            .unwrap();
            assert_eq!(
                artifact,
                TtsService::synthesize(&config_path, dir.path(), input, Some("private-key"))
                    .await
                    .unwrap()
            );
            let requests = server.await.unwrap();
            let body = request_body(&requests[0]);
            assert_eq!(body["model"], model.id);
            assert_eq!(body["input"]["voice"], voice);
            assert_eq!(body["input"]["text"], "你好，Hello.");
            let audio_plus = tts::qwen::is_audio_model(&model.id);
            let path = if audio_plus {
                "/api/v1/services/audio/tts/SpeechSynthesizer"
            } else {
                "/api/v1/services/aigc/multimodal-generation/generation"
            };
            assert!(request_text(&requests[0]).starts_with(&format!("POST {path} HTTP/1.1")));
            if audio_plus {
                assert_eq!(body["input"]["format"], "wav");
                assert_eq!(body["input"]["rate"], 2.0);
                assert_eq!(artifact.playback_rate, Some(1.5));
            } else {
                assert_eq!(body["input"]["language_type"], "Auto");
                assert!(body["input"].get("rate").is_none());
                assert_eq!(artifact.playback_rate, Some(3.0));
            }
            if model.supports_instructions {
                assert_eq!(
                    body["input"][if audio_plus {
                        "instruction"
                    } else {
                        "instructions"
                    }],
                    "Speak calmly"
                );
            }
            let downloads = audio_server.await.unwrap();
            assert!(!request_text(&downloads[0])
                .to_lowercase()
                .contains("authorization"));
            assert!(Path::new(&artifact.path).is_file());
            assert!(!std::fs::read_to_string(config_path)
                .unwrap()
                .contains("private-key"));
        }
    }

    #[tokio::test]
    async fn qwen_discovers_all_account_pages_and_filters_by_exact_target_model() {
        for (model, api_model) in [
            ("qwen3-tts-vc-2026-01-22", "qwen-voice-enrollment"),
            ("qwen3-tts-vd-2026-01-26", "qwen-voice-design"),
        ] {
            let mut entries = (0..99).map(|index| serde_json::json!({"voice": format!("voice-{index}"), "target_model": model, "language": "zh"})).collect::<Vec<_>>();
            entries.push(serde_json::json!({"voice": "realtime-only", "target_model": "qwen3-tts-vc-realtime"}));
            let pages = [
                serde_json::json!({"output": {"voice_list": entries, "total_count": 101}}),
                serde_json::json!({"output": {"voice_list": [{"voice": "new-voice", "target_model": model}], "total_count": 101}}),
            ];
            let (endpoint, server) = test_server(
                pages
                    .iter()
                    .map(|page| response("application/json", &serde_json::to_vec(page).unwrap()))
                    .collect(),
            )
            .await;
            let voices = tts::qwen::discover_account_voices(&endpoint, model, Some("key"))
                .await
                .unwrap();
            assert_eq!(voices.len(), 100);
            assert_eq!(voices.last().unwrap().id, "new-voice");
            assert!(!voices.iter().any(|voice| voice.id == "realtime-only"));
            for (page, request) in server.await.unwrap().iter().enumerate() {
                assert!(request_text(request)
                    .starts_with("POST /api/v1/services/audio/tts/customization HTTP/1.1"));
                let body = request_body(request);
                assert_eq!(body["model"], api_model);
                assert_eq!(body["input"]["action"], "list");
                assert_eq!(body["input"]["page_index"], page);
            }
        }
    }

    #[tokio::test]
    async fn qwen_audio_discovery_includes_only_ready_voices_for_selected_model() {
        let model = "qwen-audio-9.0-tts-plus";
        let id = format!("{model}-reader-1234");
        let body = serde_json::json!({"output": {"voice_list": [
            {"voice_id": id, "status": "OK"},
            {"voice_id": format!("{model}-pending"), "status": "DEPLOYING"},
            {"voice_id": "qwen-audio-3.0-tts-flash-other", "status": "OK"}
        ]}});
        let (endpoint, server) = test_server(vec![response(
            "application/json",
            &serde_json::to_vec(&body).unwrap(),
        )])
        .await;
        let voices = tts::qwen::discover_account_voices(&endpoint, model, Some("key"))
            .await
            .unwrap();
        assert_eq!(voices.len(), 1);
        assert_eq!(voices.last().unwrap().id, id);
        let body = request_body(&server.await.unwrap()[0]);
        assert_eq!(body["model"], "voice-enrollment");
        assert_eq!(body["input"]["action"], "list_voice");
    }

    #[tokio::test]
    async fn qwen_discovery_preserves_provider_response_and_redacts_credentials() {
        let body = br#"{"code":"InvalidApiKey","message":"private text and secret","request_id":"request-1"}"#;
        let (endpoint, server) = test_server(vec![response("application/json", body)]).await;
        let error =
            TtsService::discover_qwen_voices(&endpoint, "qwen3-tts-vc-2026-01-22", Some("secret"))
                .await
                .unwrap_err()
                .to_string();
        assert!(error.contains("InvalidApiKey"));
        assert!(error.contains("request-1"));
        assert!(error.contains("HTTP_200"));
        assert!(error.contains("private text and [credential]"));
        assert!(!error.contains("secret"));
        server.await.unwrap();
    }

    #[tokio::test]
    async fn synthesis_preserves_raw_http_errors_for_both_providers() {
        for qwen in [false, true] {
            let body = r#"{"code":"InvalidApiKey","message":"API key private-key expired","request_id":"request-1"}"#;
            let response = format!("HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: {}\r\nx-request-id: request-header\r\nConnection: close\r\n\r\n{body}", body.len()).into_bytes();
            let (endpoint, server) = test_server(vec![response]).await;
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("config.json");
            let profile = if qwen {
                qwen_profile(endpoint, "qwen3-tts-flash", "reader-voice")
            } else {
                openai_profile(endpoint)
            };
            let input = request(&profile.id, if qwen { "audio/wav" } else { "audio/mpeg" });
            TtsService::upsert_profile(&path, profile).unwrap();
            let error = TtsService::synthesize(&path, dir.path(), input, Some("private-key"))
                .await
                .unwrap_err();
            assert!(matches!(
                &error,
                CoreError::Tts {
                    kind: TtsErrorKind::Unauthorized,
                    ..
                }
            ));
            let detail = error.to_string();
            assert!(detail.contains("HTTP_401"));
            assert!(detail.contains(&body.replace("private-key", "[credential]")));
            assert!(!detail.contains("private-key"));
            assert!(detail.contains("request-header"));
            server.await.unwrap();
        }
    }

    #[tokio::test]
    async fn invalid_qwen_voice_ids_report_provider_errors_without_substitution_or_audio() {
        for model in ["qwen-audio-3.1-tts-plus", "qwen3-tts-flash"] {
            let body =
                r#"{"code":"InvalidParameter","message":"Voice not found: misspelled-voice"}"#;
            let response = format!("HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).into_bytes();
            let (endpoint, server) = test_server(vec![response]).await;
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("config.json");
            let cache = dir.path().join("audio");
            TtsService::upsert_profile(&path, qwen_profile(endpoint, model, "configured-voice"))
                .unwrap();
            let mut input = request("qwen", "audio/wav");
            input.voice_id = "misspelled-voice".into();
            let error = TtsService::synthesize(&path, &cache, input, Some("key"))
                .await
                .unwrap_err();
            assert!(matches!(
                &error,
                CoreError::Tts {
                    kind: TtsErrorKind::InvalidRequest,
                    ..
                }
            ));
            assert!(error
                .to_string()
                .contains("Voice not found: misspelled-voice"));
            let requests = server.await.unwrap();
            assert_eq!(
                request_body(&requests[0])["input"]["voice"],
                "misspelled-voice"
            );
            assert!(!cache.exists());
        }
    }

    #[tokio::test]
    async fn qwen_errors_preserve_empty_and_non_json_responses_with_request_context() {
        for (body, header, expected) in [
            (
                "{}",
                "x-request-id: request-header",
                "Provider returned no error details (body: {}).",
            ),
            (
                "  ",
                "x-dashscope-request-id: request-header",
                "Provider returned an empty response body.",
            ),
            (
                "upstream rejected private-key",
                "x-request-id: request-header",
                "upstream rejected [credential]",
            ),
            (
                r#"{"code":"","message":"private-key invalid","request_id":"request-body"}"#,
                "x-request-id:",
                "request-body",
            ),
            (
                r#"{"error":{"code":"InvalidParameter","message":"Voice not found"}}"#,
                "x-request-id: private-key",
                "Voice not found",
            ),
        ] {
            let response = format!("HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{header}\r\nConnection: close\r\n\r\n{body}", body.len()).into_bytes();
            let (endpoint, server) = test_server(vec![response]).await;
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("config.json");
            TtsService::upsert_profile(
                &path,
                qwen_profile(
                    format!("{endpoint}?key=private-key"),
                    "qwen3-tts-flash",
                    "reader-voice",
                ),
            )
            .unwrap();
            let error = TtsService::synthesize(
                &path,
                dir.path(),
                request("qwen", "audio/wav"),
                Some("private-key"),
            )
            .await
            .unwrap_err();
            assert!(matches!(
                &error,
                CoreError::Tts {
                    kind: TtsErrorKind::InvalidRequest,
                    ..
                }
            ));
            let detail = error.to_string();
            assert!(
                detail.contains("QWEN_REQUEST_FAILED (HTTP_400;"),
                "{detail}"
            );
            assert!(!detail.contains("QWEN_QWEN_"));
            assert!(detail.contains(expected), "{detail}");
            assert!(detail.contains("model=qwen3-tts-flash"));
            assert!(detail.contains(&format!(
                "endpoint={endpoint}/api/v1/services/aigc/multimodal-generation/generation"
            )));
            assert!(!detail.contains("private-key"));
            assert!(!detail.contains("?key="));
            if header.contains("request-header") {
                assert!(detail.contains("request_id=request-header"));
            }
            server.await.unwrap();
        }
    }

    #[tokio::test]
    async fn new_model_versions_and_edited_voices_survive_save_and_playback_listing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        for model in ["qwen-audio-9.0-tts-plus", "qwen3-tts-flash"] {
            let profile = qwen_profile(
                "https://maas.qianwenaiapi.com/api/v1".into(),
                model,
                "future-voice",
            );
            TtsService::upsert_profile(&path, profile.clone()).unwrap();
            let saved = TtsService::get_config(&path).unwrap();
            assert_eq!(saved.profiles()[0].options.voices(), &["future-voice"]);
            let voices = TtsService::list_voices(&path, "qwen", None).await.unwrap();
            assert_eq!(voices.len(), 1);
            assert_eq!(voices[0].id, "future-voice");
            TtsService::upsert_profile(&path, profile).unwrap();
            assert_eq!(
                TtsService::get_config(&path).unwrap().profiles()[0]
                    .options
                    .voices(),
                &["future-voice"]
            );
        }
    }

    #[tokio::test]
    async fn system_voice_presets_do_not_require_a_network_request() {
        for (model, endpoint) in [
            ("qwen3-tts-flash", "http://127.0.0.1:9/api/v1"),
            (
                "qwen-audio-3.0-tts-plus",
                "ws://127.0.0.1:9/api-ws/v1/inference",
            ),
        ] {
            let defaults = tts::qwen::model(model, endpoint).unwrap();
            assert!(!defaults.voices.is_empty());
            assert!(!defaults.voice_discovery);
            assert!(TtsService::discover_qwen_voices(endpoint, model, None)
                .await
                .unwrap()
                .is_empty());
        }
    }

    #[test]
    fn qwen_accepts_new_voice_ids_without_a_catalog_update_and_rejects_incompatible_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let mut profile = qwen_profile(
            "https://dashscope.aliyuncs.com/api/v1".into(),
            "qwen3-tts-flash",
            "future-official-voice",
        );
        let config = TtsService::upsert_profile(&path, profile.clone()).unwrap();
        assert_eq!(
            config.profiles()[0].options.default_voice(),
            Some("future-official-voice")
        );
        let mut input = request("qwen", "audio/wav");
        input.voice_id = "freshly-discovered-account-voice".into();
        assert!(validate_request_for_profile(&profile, &input).is_ok());
        input.text = "中".repeat(601);
        assert!(validate_request_for_profile(&profile, &input)
            .unwrap_err()
            .to_string()
            .contains("TTS_TEXT_TOO_LONG"));
        if let TtsProviderOptions::Qwen {
            response_format, ..
        } = &mut profile.options
        {
            *response_format = TtsAudioFormat::Mp3;
        }
        let saved = TtsService::upsert_profile(&path, profile).unwrap();
        assert!(matches!(
            saved.profiles()[0].options,
            TtsProviderOptions::Qwen {
                response_format: TtsAudioFormat::Wav,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn should_call_openai_speech_endpoint_and_reuse_cached_audio() {
        let (endpoint, server) =
            test_server(vec![response("audio/mpeg", b"ID3\x04\x00\x00MyReader")]).await;
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let cache_directory = directory.path().join("tts-cache");
        TtsService::upsert_profile(&config_path, openai_profile(endpoint)).unwrap();

        let first = TtsService::synthesize(
            &config_path,
            &cache_directory,
            request("openai", "audio/mpeg"),
            Some("test-secret"),
        )
        .await
        .unwrap();
        let second = TtsService::synthesize(
            &config_path,
            &cache_directory,
            request("openai", "audio/mpeg"),
            Some("test-secret"),
        )
        .await
        .unwrap();

        let requests = server.await.unwrap();
        assert_eq!(requests.len(), 1);
        let raw_request = request_text(&requests[0]);
        assert!(raw_request.starts_with("POST /v1/audio/speech HTTP/1.1"));
        assert!(raw_request
            .to_ascii_lowercase()
            .contains("authorization: bearer test-secret"));
        let body = request_body(&requests[0]);
        assert_eq!(body["model"], "gpt-4o-mini-tts");
        assert_eq!(body["voice"], "reader-voice");
        assert_eq!(body["input"], "Hello from MyReader.");
        assert_eq!(body["speed"], 1.25);
        assert_eq!(body["instructions"], "Speak warmly");
        assert_eq!(first, second);
        assert_eq!(first.mime_type, "audio/mpeg");
        assert!(PathBuf::from(first.path).is_file());

        let persisted = std::fs::read_to_string(config_path).unwrap();
        assert!(persisted.contains("tts:openai:api-key"));
        assert!(!persisted.contains("test-secret"));
    }

    #[tokio::test]
    async fn character_instructions_override_without_mutating_provider_or_reusing_other_voice_audio(
    ) {
        let (endpoint, server) = test_server(vec![
            response("audio/mpeg", b"ID3gentle"),
            response("audio/mpeg", b"ID3male"),
        ])
        .await;
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        TtsService::upsert_profile(&config_path, openai_profile(endpoint)).unwrap();
        let original = TtsService::get_config(&config_path).unwrap();
        let mut gentle = request("openai", "audio/mpeg");
        gentle.instructions = Some("温柔的女声".into());
        let mut male = gentle.clone();
        male.instructions = Some("仿男声\n高兴".into());
        let first = TtsService::synthesize(
            &config_path,
            directory.path(),
            gentle.clone(),
            Some("fixture-key"),
        )
        .await
        .unwrap();
        let second =
            TtsService::synthesize(&config_path, directory.path(), male, Some("fixture-key"))
                .await
                .unwrap();
        let repeated =
            TtsService::synthesize(&config_path, directory.path(), gentle, Some("fixture-key"))
                .await
                .unwrap();
        assert_ne!(first.cache_key, second.cache_key);
        assert_eq!(first, repeated);
        assert_eq!(TtsService::get_config(&config_path).unwrap(), original);
        let requests = server.await.unwrap();
        assert_eq!(request_body(&requests[0])["instructions"], "温柔的女声");
        assert_eq!(request_body(&requests[1])["instructions"], "仿男声\n高兴");
    }

    #[tokio::test]
    async fn should_share_one_synthesis_for_concurrent_cache_misses() {
        let (endpoint, server) =
            test_server(vec![response("audio/mpeg", b"ID3\x04\x00\x00MyReader")]).await;
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let cache_directory = directory.path().join("tts-cache");
        TtsService::upsert_profile(&config_path, openai_profile(endpoint)).unwrap();

        let first = TtsService::synthesize(
            &config_path,
            &cache_directory,
            request("openai", "audio/mpeg"),
            Some("test-secret"),
        );
        let second = TtsService::synthesize(
            &config_path,
            &cache_directory,
            request("openai", "audio/mpeg"),
            Some("test-secret"),
        );
        let (first, second) = tokio::join!(first, second);

        assert_eq!(first.unwrap(), second.unwrap());
        assert_eq!(server.await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn should_expose_only_configured_openai_voices_with_default_first() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let mut profile = openai_profile("https://api.example.test/v1".into());
        profile.options = TtsProviderOptions::OpenAiCompatible {
            response_format: TtsAudioFormat::Mp3,
            instructions: None,
            voices: vec![
                " reader-voice ".into(),
                "narrator-voice".into(),
                "reader-voice".into(),
            ],
            default_voice: Some("narrator-voice".into()),
        };

        let config = TtsService::upsert_profile(&config_path, profile).unwrap();
        let voices = TtsService::list_voices(&config_path, "openai", None)
            .await
            .unwrap();

        assert_eq!(
            config.profiles()[0].options,
            TtsProviderOptions::OpenAiCompatible {
                response_format: TtsAudioFormat::Mp3,
                instructions: None,
                voices: vec!["reader-voice".into(), "narrator-voice".into()],
                default_voice: Some("narrator-voice".into()),
            }
        );
        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            vec!["narrator-voice", "reader-voice"]
        );
    }

    #[test]
    fn should_require_user_configured_openai_voices_and_prune_removed_mappings() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let mut invalid_profile = openai_profile("https://api.example.test/v1".into());
        invalid_profile.options = TtsProviderOptions::OpenAiCompatible {
            response_format: TtsAudioFormat::Mp3,
            instructions: None,
            voices: Vec::new(),
            default_voice: None,
        };
        assert!(TtsService::upsert_profile(&config_path, invalid_profile)
            .unwrap_err()
            .to_string()
            .contains("TTS_VOICES_REQUIRED"));

        let mut profile = openai_profile("https://api.example.test/v1".into());
        TtsService::upsert_profile(&config_path, profile.clone()).unwrap();
        TtsService::set_voice_for_language(
            &config_path,
            "en",
            Some(TtsVoiceRef::Provider {
                profile_id: "openai".into(),
                voice_id: "narrator-voice".into(),
            }),
        )
        .unwrap();
        profile.options = TtsProviderOptions::OpenAiCompatible {
            response_format: TtsAudioFormat::Mp3,
            instructions: None,
            voices: vec!["reader-voice".into()],
            default_voice: Some("reader-voice".into()),
        };

        let config = TtsService::upsert_profile(&config_path, profile).unwrap();

        assert!(!config.voice_by_language.contains_key("en"));
    }

    #[test]
    fn should_increment_revision_only_when_synthesis_settings_change() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        let mut profile = openai_profile("https://api.openai.com/v1".into());
        let first = TtsService::upsert_profile(&config_path, profile.clone()).unwrap();

        profile.name = "OpenAI Speech".into();
        let renamed = TtsService::upsert_profile(&config_path, profile.clone()).unwrap();
        profile.model = Some("tts-1".into());
        let changed = TtsService::upsert_profile(&config_path, profile).unwrap();

        assert_eq!(first.profiles()[0].revision, 1);
        assert_eq!(renamed.profiles()[0].revision, 1);
        assert_eq!(changed.profiles()[0].revision, 2);
    }

    #[test]
    fn should_fall_back_to_system_when_selected_profile_is_removed() {
        let directory = tempfile::tempdir().unwrap();
        let config_path = directory.path().join("config.json");
        TtsService::upsert_profile(
            &config_path,
            openai_profile("https://api.openai.com/v1".into()),
        )
        .unwrap();
        TtsService::set_default_engine(
            &config_path,
            TtsEngineSelection::Provider {
                profile_id: "openai".into(),
            },
        )
        .unwrap();

        let config = TtsService::remove_profile(&config_path, "openai").unwrap();

        assert_eq!(config.default_engine, TtsEngineSelection::System);
        assert!(config.profiles().is_empty());
    }
}
