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
        TtsAudioArtifact, TtsCachePolicy, TtsConfig, TtsEngineSelection, TtsPlaybackPreferences,
        TtsProviderCapabilities, TtsProviderOptions, TtsProviderProfile, TtsSynthesisRequest,
        TtsVoice, TtsVoiceRef, TTS_CONFIG_SCHEMA_VERSION,
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
                !matches!(
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
    profile.id = if profile.id.trim().is_empty() {
        Uuid::new_v4().to_string()
    } else {
        profile.id.trim().to_owned()
    };
    profile.name = profile.name.trim().to_owned();
    if profile.name.is_empty() {
        profile.name = "OpenAI".into();
    }
    profile.endpoint = profile.endpoint.trim().trim_end_matches('/').to_owned();
    if profile.endpoint.is_empty() {
        profile.endpoint = "https://api.openai.com/v1".into();
    }
    profile.model = normalize_optional(profile.model.take());
    profile.credential_reference = normalize_optional(profile.credential_reference.take());
    profile
        .model
        .get_or_insert_with(|| "gpt-4o-mini-tts".into());
    profile
        .credential_reference
        .get_or_insert_with(|| format!("tts:{}:api-key", profile.id));
    let TtsProviderOptions::OpenAiCompatible {
        instructions,
        voices,
        default_voice,
        ..
    } = &mut profile.options;
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
    profile.revision = profile.revision.max(1);
    validate_profile(profile)?;
    validate_configured_voices(profile)
}

fn validate_configured_voices(profile: &TtsProviderProfile) -> Result<(), CoreError> {
    let TtsProviderOptions::OpenAiCompatible {
        voices,
        default_voice,
        ..
    } = &profile.options;
    if voices.is_empty() {
        return Err(tts_error("configuration", "TTS_VOICES_REQUIRED"));
    }
    let default_voice = default_voice
        .as_deref()
        .ok_or_else(|| tts_error("configuration", "TTS_DEFAULT_VOICE_REQUIRED"))?;
    if !voices.iter().any(|voice| voice == default_voice) {
        return Err(tts_error(
            "configuration",
            "TTS_DEFAULT_VOICE_NOT_CONFIGURED",
        ));
    }
    Ok(())
}

fn configured_voice_ids(profile: &TtsProviderProfile) -> HashSet<String> {
    let TtsProviderOptions::OpenAiCompatible { voices, .. } = &profile.options;
    voices.iter().cloned().collect()
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
    if endpoint.scheme() != "http" && endpoint.scheme() != "https" {
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
    if !configured_voice_ids(profile).contains(&request.voice_id) {
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
