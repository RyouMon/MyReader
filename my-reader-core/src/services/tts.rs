use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{Arc, OnceLock, Weak},
};

use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use url::Url;
use uuid::Uuid;

use crate::{
    infrastructure::tts,
    models::{
        QwenTtsModel, QwenTtsPreset, TtsAudioArtifact, TtsCachePolicy, TtsConfig,
        TtsEngineSelection, TtsPlaybackPreferences, TtsProviderCapabilities, TtsProviderKind,
        TtsProviderOptions, TtsProviderProfile, TtsSynthesisRequest, TtsVoice, TtsVoiceRef,
        TTS_CONFIG_SCHEMA_VERSION,
    },
    CoreError,
};

use super::config::ConfigService;

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

impl TtsService {
    pub fn qwen_presets() -> Vec<QwenTtsPreset> {
        tts::qwen::presets()
    }

    pub fn qwen_models(endpoint: Option<&str>) -> Vec<QwenTtsModel> {
        tts::qwen::models_for_endpoint(endpoint)
    }

    pub async fn discover_qwen_voices(
        endpoint: &str,
        model: &str,
        credential: Option<&str>,
    ) -> Result<Vec<TtsVoice>, CoreError> {
        tts::qwen::discover_voices(endpoint, model, credential).await
    }

    pub fn get_config(config_path: &Path) -> Result<TtsConfig, CoreError> {
        Ok(ConfigService::load_or_initialize(config_path, None)?.tts)
    }

    pub fn upsert_profile(
        config_path: &Path,
        mut profile: TtsProviderProfile,
    ) -> Result<TtsConfig, CoreError> {
        normalize_profile(&mut profile)?;
        let profile_id = profile.id.clone();
        let configured_voice_ids = configured_voice_ids(&profile);
        let state = ConfigService::mutate_config(config_path, move |state| {
            let retains_discovered_voices = profile.kind == TtsProviderKind::Qwen
                && state.tts.profiles.iter().any(|existing| {
                    existing.id == profile_id
                        && existing.kind == profile.kind
                        && existing.model == profile.model
                });
            if let Some(existing) = state
                .tts
                .profiles
                .iter_mut()
                .find(|existing| existing.id == profile_id)
            {
                profile.revision = if same_synthesis_profile(existing, &profile) {
                    existing.revision.max(1)
                } else {
                    existing.revision.max(1).saturating_add(1)
                };
                *existing = profile;
            } else {
                profile.revision = 1;
                state.tts.profiles.push(profile);
            }
            state.tts.voice_by_language.retain(|_, voice| {
                retains_discovered_voices
                    || !matches!(
                        voice,
                        TtsVoiceRef::Provider {
                            profile_id: selected_profile_id,
                            voice_id,
                        } if selected_profile_id == &profile_id
                            && !configured_voice_ids.contains(voice_id)
                    )
            });
            if matches!(
                &state.tts.default_engine,
                TtsEngineSelection::Provider { profile_id }
                    if state
                        .tts
                        .profiles
                        .iter()
                        .any(|profile| &profile.id == profile_id && !profile.enabled)
            ) {
                state.tts.default_engine = TtsEngineSelection::System;
            }
            Ok(())
        })?;
        Ok(state.tts)
    }

    pub fn remove_profile(config_path: &Path, profile_id: &str) -> Result<TtsConfig, CoreError> {
        let profile_id = profile_id.trim().to_owned();
        let state = ConfigService::mutate_config(config_path, |state| {
            let initial_len = state.tts.profiles.len();
            state
                .tts
                .profiles
                .retain(|profile| profile.id != profile_id);
            if state.tts.profiles.len() == initial_len {
                return Err(CoreError::NotFound(format!(
                    "TTS_PROFILE_NOT_FOUND: {profile_id}"
                )));
            }
            if matches!(
                &state.tts.default_engine,
                TtsEngineSelection::Provider { profile_id: selected } if selected == &profile_id
            ) {
                state.tts.default_engine = TtsEngineSelection::System;
            }
            state.tts.voice_by_language.retain(|_, voice| {
                !matches!(
                    voice,
                    TtsVoiceRef::Provider {
                        profile_id: selected,
                        ..
                    } if selected == &profile_id
                )
            });
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
            return Err(tts_error("configuration", "TTS_LANGUAGE_REQUIRED"));
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
        Ok(tts::capabilities(find_profile(&config, profile_id)?))
    }

    pub async fn probe_provider(
        config_path: &Path,
        profile_id: &str,
        credential: Option<&str>,
    ) -> Result<TtsProviderCapabilities, CoreError> {
        let config = Self::get_config(config_path)?;
        let profile = find_enabled_profile(&config, profile_id)?;
        tts::probe(profile, credential).await
    }

    pub async fn list_voices(
        config_path: &Path,
        profile_id: &str,
        credential: Option<&str>,
    ) -> Result<Vec<TtsVoice>, CoreError> {
        let config = Self::get_config(config_path)?;
        let profile = find_enabled_profile(&config, profile_id)?;
        tts::list_voices(profile, credential).await
    }

    pub async fn synthesize(
        config_path: &Path,
        cache_directory: &Path,
        request: TtsSynthesisRequest,
        credential: Option<&str>,
    ) -> Result<TtsAudioArtifact, CoreError> {
        validate_request(&request)?;
        let config = Self::get_config(config_path)?;
        let profile = find_enabled_profile(&config, &request.profile_id)?;
        validate_request_for_profile(profile, &request)?;
        let rate = if profile.kind == TtsProviderKind::Qwen {
            let requested = request.speed.unwrap_or(1.0);
            let synthesized = if tts::capabilities(profile).synthesis_rate {
                requested.clamp(0.5, 2.0)
            } else {
                1.0
            };
            Some(requested / synthesized)
        } else {
            None
        };
        let mut artifact =
            Self::synthesize_part(profile, cache_directory, request, credential).await?;
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

pub(crate) fn validate_tts_config(config: &TtsConfig) -> Result<(), CoreError> {
    if config.schema_version != TTS_CONFIG_SCHEMA_VERSION {
        return Err(tts_error("configuration", "UNSUPPORTED_TTS_CONFIG_VERSION"));
    }
    validate_playback(&config.playback)?;

    let mut profile_ids = HashSet::new();
    for profile in &config.profiles {
        validate_profile(profile)?;
        if !profile_ids.insert(profile.id.as_str()) {
            return Err(tts_error("configuration", "DUPLICATE_TTS_PROFILE_ID"));
        }
    }
    if let TtsEngineSelection::Provider { profile_id } = &config.default_engine {
        if !config
            .profiles
            .iter()
            .any(|profile| &profile.id == profile_id && profile.enabled)
        {
            return Err(tts_error("configuration", "TTS_DEFAULT_PROFILE_NOT_FOUND"));
        }
    }
    for (language, voice) in &config.voice_by_language {
        if language.trim().is_empty() || voice_id(voice).trim().is_empty() {
            return Err(tts_error("configuration", "INVALID_TTS_VOICE_MAPPING"));
        }
        if let TtsVoiceRef::Provider { profile_id, .. } = voice {
            if !config
                .profiles
                .iter()
                .any(|profile| &profile.id == profile_id)
            {
                return Err(tts_error("configuration", "TTS_VOICE_PROFILE_NOT_FOUND"));
            }
        }
    }
    Ok(())
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
    profile.model.get_or_insert_with(|| {
        if qwen {
            tts::qwen::DEFAULT_MODEL
        } else {
            "gpt-4o-mini-tts"
        }
        .into()
    });
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
    if qwen {
        let model = tts::qwen::model(
            profile.model.as_deref().unwrap_or_default(),
            &profile.endpoint,
        )?;
        for voice in model.voices {
            if !voices.contains(&voice.id) {
                voices.push(voice.id);
            }
        }
        if default_voice.is_none() {
            *default_voice = voices.first().cloned();
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
        return Err(tts_error("configuration", "TTS_VOICES_REQUIRED"));
    }
    let default_voice =
        default_voice.ok_or_else(|| tts_error("configuration", "TTS_DEFAULT_VOICE_REQUIRED"))?;
    if !voices.iter().any(|voice| voice == default_voice) {
        return Err(tts_error(
            "configuration",
            "TTS_DEFAULT_VOICE_NOT_CONFIGURED",
        ));
    }
    Ok(())
}

fn configured_voice_ids(profile: &TtsProviderProfile) -> HashSet<String> {
    profile.options.voices().iter().cloned().collect()
}

fn validate_profile(profile: &TtsProviderProfile) -> Result<(), CoreError> {
    if profile.id.trim().is_empty() {
        return Err(tts_error("configuration", "TTS_PROFILE_ID_REQUIRED"));
    }
    if profile.name.trim().is_empty() {
        return Err(tts_error("configuration", "TTS_PROFILE_NAME_REQUIRED"));
    }
    if profile.options.kind() != profile.kind {
        return Err(tts_error("configuration", "TTS_PROVIDER_OPTIONS_MISMATCH"));
    }
    let endpoint = Url::parse(profile.endpoint.trim())
        .map_err(|_| tts_error("configuration", "INVALID_TTS_ENDPOINT"))?;
    if !matches!(endpoint.scheme(), "http" | "https")
        && !(profile.kind == TtsProviderKind::Qwen && matches!(endpoint.scheme(), "ws" | "wss"))
    {
        return Err(tts_error("configuration", "INVALID_TTS_ENDPOINT_SCHEME"));
    }
    if endpoint.host_str().is_none()
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
    {
        return Err(tts_error("configuration", "INVALID_TTS_ENDPOINT"));
    }
    if profile.model.as_deref().is_none_or(str::is_empty) {
        return Err(tts_error("configuration", "TTS_MODEL_REQUIRED"));
    }
    if profile.kind == TtsProviderKind::Qwen {
        tts::qwen::validate_profile(profile)?;
    }
    Ok(())
}

fn validate_playback(playback: &TtsPlaybackPreferences) -> Result<(), CoreError> {
    if !playback.speed.is_finite() || !(0.25..=4.0).contains(&playback.speed) {
        return Err(tts_error("configuration", "INVALID_TTS_SPEED"));
    }
    if !playback.pitch.is_finite() || !(0.5..=2.0).contains(&playback.pitch) {
        return Err(tts_error("configuration", "INVALID_TTS_PITCH"));
    }
    Ok(())
}

fn validate_request(request: &TtsSynthesisRequest) -> Result<(), CoreError> {
    if request.profile_id.trim().is_empty() {
        return Err(tts_error("invalid_request", "TTS_PROFILE_ID_REQUIRED"));
    }
    if request.text.trim().is_empty() {
        return Err(tts_error("invalid_request", "TTS_TEXT_REQUIRED"));
    }
    if request.voice_id.trim().is_empty() {
        return Err(tts_error("invalid_request", "TTS_VOICE_REQUIRED"));
    }
    if request
        .speed
        .is_some_and(|speed| !speed.is_finite() || !(0.25..=4.0).contains(&speed))
    {
        return Err(tts_error("invalid_request", "INVALID_TTS_SPEED"));
    }
    if request
        .pitch
        .is_some_and(|pitch| !pitch.is_finite() || !(0.5..=2.0).contains(&pitch))
    {
        return Err(tts_error("invalid_request", "INVALID_TTS_PITCH"));
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
        return Err(tts_error("invalid_request", "TTS_VOICE_NOT_CONFIGURED"));
    }
    let capabilities = tts::capabilities(profile);
    if capabilities
        .max_input_chars
        .is_some_and(|limit| request.text.chars().count() > limit as usize)
    {
        return Err(tts_error("invalid_request", "TTS_TEXT_TOO_LONG"));
    }
    if request
        .pitch
        .is_some_and(|pitch| pitch != 1.0 && !capabilities.synthesis_pitch)
    {
        return Err(tts_error("unsupported", "TTS_PITCH_UNSUPPORTED"));
    }
    Ok(())
}

fn find_profile<'a>(
    config: &'a TtsConfig,
    profile_id: &str,
) -> Result<&'a TtsProviderProfile, CoreError> {
    config
        .profiles
        .iter()
        .find(|profile| profile.id == profile_id.trim())
        .ok_or_else(|| CoreError::NotFound(format!("TTS_PROFILE_NOT_FOUND: {profile_id}")))
}

fn find_enabled_profile<'a>(
    config: &'a TtsConfig,
    profile_id: &str,
) -> Result<&'a TtsProviderProfile, CoreError> {
    let profile = find_profile(config, profile_id)?;
    if !profile.enabled {
        return Err(tts_error("configuration", "TTS_PROFILE_DISABLED"));
    }
    Ok(profile)
}

fn voice_id(voice: &TtsVoiceRef) -> &str {
    match voice {
        TtsVoiceRef::System { voice_id } | TtsVoiceRef::Provider { voice_id, .. } => voice_id,
    }
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
        Err(tts_error("unsupported", "TTS_AUDIO_FORMAT_NOT_ACCEPTED"))
    }
}

async fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| tts_error("cache", "INVALID_TTS_CACHE_PATH"))?;
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

fn tts_error(kind: &str, code: &str) -> CoreError {
    CoreError::Tts(format!("{kind}:{code}"))
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
            enabled: true,
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
        }
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
            enabled: true,
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
            assert!(!error.contains("private book text"));
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
    fn qwen_creation_presets_provide_valid_independent_source_defaults() {
        let presets = TtsService::qwen_presets();
        let expected = [
            (
                "tokenPlan",
                "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference",
                "longanhuan_v3.6",
            ),
            (
                "qianwen",
                "https://maas.qianwenaiapi.com/api/v1",
                "longanlingxin",
            ),
            (
                "dashscope",
                "https://dashscope.aliyuncs.com/api/v1",
                "longanlingxin",
            ),
        ];
        assert_eq!(presets.len(), expected.len());
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("config.json");
        for (preset, (id, endpoint, voice)) in presets.into_iter().zip(expected) {
            assert_eq!(
                (preset.id.as_str(), preset.endpoint.as_str()),
                (id, endpoint)
            );
            assert_eq!(preset.default_model.voices[0].id, voice);
            assert_eq!(preset.default_model.voice_discovery, id != "tokenPlan");
            let mut profile = qwen_profile(preset.endpoint, &preset.default_model.id, voice);
            profile.id = id.into();
            profile.credential_reference = None;
            TtsService::upsert_profile(&config_path, profile).unwrap();
        }
        let config = TtsService::get_config(&config_path).unwrap();
        assert_eq!(config.profiles.len(), 3);
        for profile in config.profiles {
            assert_eq!(profile.kind, TtsProviderKind::Qwen);
            assert_eq!(
                profile.credential_reference,
                Some(format!("tts:{}:api-key", profile.id))
            );
        }
    }

    #[test]
    fn qwen_defaults_use_the_token_plan_catalog_and_documented_endpoint() {
        let models = TtsService::qwen_models(None);
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "qwen-audio-3.0-tts-plus");
        assert!(!models[0].voice_discovery);
        assert_eq!(models[0].voices[0].id, "longanhuan_v3.6");
        let dir = tempfile::tempdir().unwrap();
        let config = TtsService::upsert_profile(
            &dir.path().join("config.json"),
            qwen_profile("".into(), "qwen-audio-3.0-tts-plus", "longanhuan_v3.6"),
        )
        .unwrap();
        assert_eq!(
            config.profiles[0].endpoint,
            "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference"
        );
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
        tokio::time::advance(std::time::Duration::from_secs(46)).await;
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
        let voices = TtsService::discover_qwen_voices(
            tts::qwen::DEFAULT_ENDPOINT,
            "qwen-audio-3.0-tts-plus",
            Some("sk-sp-fixture"),
        )
        .await
        .unwrap();
        assert_eq!(voices[0].id, "longanhuan_v3.6");
    }

    #[tokio::test]
    async fn qwen_models_use_native_protocol_and_download_audio_without_credentials() {
        for model in TtsService::qwen_models(Some("https://dashscope.aliyuncs.com/api/v1")) {
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
            let audio_plus = model.id == tts::qwen::DEFAULT_MODEL;
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
            let voices = TtsService::discover_qwen_voices(&endpoint, model, Some("key"))
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
        let model = tts::qwen::DEFAULT_MODEL;
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
        let voices = TtsService::discover_qwen_voices(&endpoint, model, Some("key"))
            .await
            .unwrap();
        assert_eq!(voices.len(), 3);
        assert_eq!(voices.last().unwrap().id, id);
        let body = request_body(&server.await.unwrap()[0]);
        assert_eq!(body["model"], "voice-enrollment");
        assert_eq!(body["input"]["action"], "list_voice");
    }

    #[tokio::test]
    async fn qwen_discovery_surfaces_provider_errors_without_echoing_secrets_or_text() {
        let body = br#"{"code":"InvalidApiKey","message":"private text and secret","request_id":"request-1"}"#;
        let (endpoint, server) = test_server(vec![response("application/json", body)]).await;
        let error =
            TtsService::discover_qwen_voices(&endpoint, "qwen3-tts-vc-2026-01-22", Some("key"))
                .await
                .unwrap_err()
                .to_string();
        assert!(error.contains("InvalidApiKey"));
        assert!(error.contains("request-1"));
        assert!(!error.contains("private"));
        server.await.unwrap();
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
            config.profiles[0].options.default_voice(),
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
        assert!(TtsService::upsert_profile(&path, profile)
            .unwrap_err()
            .to_string()
            .contains("QWEN_AUDIO_FORMAT_UNSUPPORTED"));
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
            config.profiles[0].options,
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

        assert_eq!(first.profiles[0].revision, 1);
        assert_eq!(renamed.profiles[0].revision, 1);
        assert_eq!(changed.profiles[0].revision, 2);
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
        assert!(config.profiles.is_empty());
    }
}
