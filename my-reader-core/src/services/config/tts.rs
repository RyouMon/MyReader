//! Validation shared by registry loading and TTS profile operations.
use std::collections::HashSet;

use url::Url;

use crate::{
    infrastructure::tts,
    models::{
        TtsConfig, TtsEngineSelection, TtsPlaybackPreferences, TtsProviderKind, TtsProviderProfile,
        TtsVoiceRef, TTS_CONFIG_SCHEMA_VERSION,
    },
    CoreError, TtsErrorKind,
};

pub(crate) fn validate_tts_config(config: &TtsConfig) -> Result<(), CoreError> {
    if config.schema_version != TTS_CONFIG_SCHEMA_VERSION {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "UNSUPPORTED_TTS_CONFIG_VERSION",
        ));
    }
    validate_playback(&config.playback)?;

    let mut profile_ids = HashSet::new();
    for profile in &config.profiles {
        validate_profile(profile)?;
        if !profile_ids.insert(profile.id.as_str()) {
            return Err(tts_error(
                TtsErrorKind::Configuration,
                "DUPLICATE_TTS_PROFILE_ID",
            ));
        }
    }
    if let TtsEngineSelection::Provider { profile_id } = &config.default_engine {
        if !config
            .profiles
            .iter()
            .any(|profile| &profile.id == profile_id && profile.enabled)
        {
            return Err(tts_error(
                TtsErrorKind::Configuration,
                "TTS_DEFAULT_PROFILE_NOT_FOUND",
            ));
        }
    }
    for (language, voice) in &config.voice_by_language {
        if language.trim().is_empty() || voice_id(voice).trim().is_empty() {
            return Err(tts_error(
                TtsErrorKind::Configuration,
                "INVALID_TTS_VOICE_MAPPING",
            ));
        }
        if let TtsVoiceRef::Provider { profile_id, .. } = voice {
            if !config
                .profiles
                .iter()
                .any(|profile| &profile.id == profile_id)
            {
                return Err(tts_error(
                    TtsErrorKind::Configuration,
                    "TTS_VOICE_PROFILE_NOT_FOUND",
                ));
            }
        }
    }
    Ok(())
}

pub(crate) fn validate_profile(profile: &TtsProviderProfile) -> Result<(), CoreError> {
    if profile.id.trim().is_empty() {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_PROFILE_ID_REQUIRED",
        ));
    }
    if profile.name.trim().is_empty() {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_PROFILE_NAME_REQUIRED",
        ));
    }
    if profile.options.kind() != profile.kind {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_PROVIDER_OPTIONS_MISMATCH",
        ));
    }
    let endpoint = Url::parse(profile.endpoint.trim())
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    if !(matches!(endpoint.scheme(), "http" | "https")
        || profile.kind == TtsProviderKind::Qwen && matches!(endpoint.scheme(), "ws" | "wss"))
    {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "INVALID_TTS_ENDPOINT_SCHEME",
        ));
    }
    if endpoint.host_str().is_none()
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
    {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "INVALID_TTS_ENDPOINT",
        ));
    }
    if profile.model.as_deref().is_none_or(str::is_empty) {
        return Err(tts_error(TtsErrorKind::Configuration, "TTS_MODEL_REQUIRED"));
    }
    if profile.kind == TtsProviderKind::Qwen {
        tts::qwen::validate_profile(profile)?;
    }
    Ok(())
}

fn validate_playback(playback: &TtsPlaybackPreferences) -> Result<(), CoreError> {
    if !playback.speed.is_finite() || !(0.25..=4.0).contains(&playback.speed) {
        return Err(tts_error(TtsErrorKind::Configuration, "INVALID_TTS_SPEED"));
    }
    if !playback.pitch.is_finite() || !(0.5..=2.0).contains(&playback.pitch) {
        return Err(tts_error(TtsErrorKind::Configuration, "INVALID_TTS_PITCH"));
    }
    Ok(())
}

fn voice_id(voice: &TtsVoiceRef) -> &str {
    match voice {
        TtsVoiceRef::System { voice_id } | TtsVoiceRef::Provider { voice_id, .. } => voice_id,
    }
}

fn tts_error(kind: TtsErrorKind, code: &str) -> CoreError {
    CoreError::Tts {
        kind,
        message: code.to_owned(),
    }
}
