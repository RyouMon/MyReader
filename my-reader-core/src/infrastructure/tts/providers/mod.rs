//! Provider-specific TTS adapters and their shared dispatch boundary.

mod elevenlabs;
pub(crate) mod encoding;
mod fish_audio;
mod gemini;
mod minimax;
mod openai;
mod volcengine;

use serde_json::Value;
use url::Url;

pub(super) use super::{
    audio_from_bytes, audio_response, client, map_reqwest_error, response_bytes, sniff_audio,
    successful, tts_error, SynthesizedAudio, REQUEST_TIMEOUT, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{
        TtsAudioFormat, TtsProviderCapabilities, TtsProviderKind, TtsProviderProfile,
        TtsSynthesisRequest, TtsVoice,
    },
    CoreError, TtsErrorKind,
};

pub(super) const MAX_DISCOVERY_PAGES: usize = 20;

pub(crate) fn capabilities(profile: &TtsProviderProfile) -> TtsProviderCapabilities {
    let model = profile.model.as_deref().unwrap_or_default();
    let formats = supported_formats(profile);
    let output_mime_types = formats
        .iter()
        .map(|format| format.mime_type().to_owned())
        .collect();
    match profile.kind {
        TtsProviderKind::OpenAiCompatible => TtsProviderCapabilities {
            voice_discovery: true,
            preview: true,
            plain_text: true,
            ssml: false,
            streaming: false,
            word_timings: false,
            synthesis_rate: true,
            synthesis_pitch: false,
            max_input_chars: Some(4096),
            output_mime_types,
        },
        TtsProviderKind::Qwen => {
            let audio = super::qwen::is_audio_model(model);
            TtsProviderCapabilities {
                voice_discovery: super::qwen::model(model, &profile.endpoint)
                    .is_ok_and(|item| item.voice_discovery),
                preview: true,
                plain_text: true,
                ssml: false,
                streaming: false,
                word_timings: false,
                synthesis_rate: audio,
                synthesis_pitch: audio,
                max_input_chars: if audio { None } else { Some(600) },
                output_mime_types,
            }
        }
        TtsProviderKind::MiniMax => TtsProviderCapabilities {
            voice_discovery: true,
            preview: true,
            plain_text: true,
            ssml: false,
            streaming: false,
            word_timings: false,
            synthesis_rate: true,
            synthesis_pitch: true,
            max_input_chars: Some(5000),
            output_mime_types,
        },
        TtsProviderKind::Volcengine => TtsProviderCapabilities {
            voice_discovery: false,
            preview: true,
            plain_text: true,
            ssml: false,
            streaming: false,
            word_timings: false,
            synthesis_rate: true,
            synthesis_pitch: false,
            max_input_chars: Some(1024),
            output_mime_types,
        },
        TtsProviderKind::ElevenLabs => TtsProviderCapabilities {
            voice_discovery: true,
            preview: true,
            plain_text: true,
            ssml: false,
            streaming: false,
            word_timings: false,
            synthesis_rate: elevenlabs::supports_speed(model),
            synthesis_pitch: false,
            max_input_chars: Some(5000),
            output_mime_types,
        },
        TtsProviderKind::FishAudio => TtsProviderCapabilities {
            voice_discovery: true,
            preview: true,
            plain_text: true,
            ssml: false,
            streaming: false,
            word_timings: false,
            synthesis_rate: true,
            synthesis_pitch: false,
            max_input_chars: Some(4096),
            output_mime_types,
        },
        TtsProviderKind::Gemini => TtsProviderCapabilities {
            voice_discovery: true,
            preview: true,
            plain_text: true,
            ssml: false,
            streaming: false,
            word_timings: false,
            synthesis_rate: false,
            synthesis_pitch: false,
            max_input_chars: Some(4000),
            output_mime_types,
        },
    }
}

pub(crate) fn synthesis_rate_range(profile: &TtsProviderProfile) -> Option<(f64, f64)> {
    let model = profile.model.as_deref().unwrap_or_default();
    match profile.kind {
        TtsProviderKind::OpenAiCompatible => Some((0.25, 4.0)),
        TtsProviderKind::Qwen => super::qwen::is_audio_model(model).then_some((0.5, 2.0)),
        TtsProviderKind::MiniMax | TtsProviderKind::Volcengine | TtsProviderKind::FishAudio => {
            Some((0.5, 2.0))
        }
        TtsProviderKind::ElevenLabs => elevenlabs::supports_speed(model).then_some((0.7, 1.2)),
        TtsProviderKind::Gemini => None,
    }
}

pub(crate) fn supported_formats(profile: &TtsProviderProfile) -> Vec<TtsAudioFormat> {
    let model = profile.model.as_deref().unwrap_or_default();
    match profile.kind {
        TtsProviderKind::OpenAiCompatible => vec![
            TtsAudioFormat::Mp3,
            TtsAudioFormat::Opus,
            TtsAudioFormat::Aac,
            TtsAudioFormat::Flac,
            TtsAudioFormat::Wav,
        ],
        TtsProviderKind::Qwen => {
            if super::qwen::is_audio_model(model) {
                vec![
                    TtsAudioFormat::Mp3,
                    TtsAudioFormat::Wav,
                    TtsAudioFormat::Opus,
                ]
            } else {
                vec![TtsAudioFormat::Wav]
            }
        }
        TtsProviderKind::MiniMax => minimax::SUPPORTED_FORMATS.to_vec(),
        TtsProviderKind::Volcengine => volcengine::SUPPORTED_FORMATS.to_vec(),
        TtsProviderKind::ElevenLabs => elevenlabs::SUPPORTED_FORMATS.to_vec(),
        TtsProviderKind::FishAudio => fish_audio::SUPPORTED_FORMATS.to_vec(),
        TtsProviderKind::Gemini => gemini::SUPPORTED_FORMATS.to_vec(),
    }
}

pub(crate) fn normalize_profile_options(profile: &mut TtsProviderProfile) -> Result<(), CoreError> {
    if profile.kind == TtsProviderKind::Qwen {
        let selected = super::qwen::model(
            profile.model.as_deref().unwrap_or_default(),
            &profile.endpoint,
        )?;
        if !selected
            .audio_formats
            .contains(&profile.options.response_format)
        {
            profile.options.response_format = selected.audio_formats[0];
        }
        return Ok(());
    }
    let formats = supported_formats(profile);
    if !formats.contains(&profile.options.response_format) {
        profile.options.response_format = formats[0];
    }
    Ok(())
}

pub(crate) fn validate_profile(profile: &TtsProviderProfile) -> Result<(), CoreError> {
    if profile.kind == TtsProviderKind::Qwen {
        return super::qwen::validate_profile(profile);
    }
    if !supported_formats(profile).contains(&profile.options.response_format) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_AUDIO_FORMAT_UNSUPPORTED",
        ));
    }
    Ok(())
}

pub(crate) async fn discover_models(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    match profile.kind {
        TtsProviderKind::OpenAiCompatible => openai::discover_models(profile, credential).await,
        TtsProviderKind::Qwen => Ok(super::qwen::discover_models(&profile.endpoint, credential)
            .await?
            .into_iter()
            .map(|model| model.id)
            .collect()),
        TtsProviderKind::MiniMax => Ok(minimax::models()),
        TtsProviderKind::Volcengine => Ok(volcengine::models()),
        TtsProviderKind::ElevenLabs => {
            elevenlabs::discover_models(profile, require_credential(credential)?).await
        }
        TtsProviderKind::FishAudio => Ok(fish_audio::models()),
        TtsProviderKind::Gemini => {
            gemini::discover_models(profile, require_credential(credential)?).await
        }
    }
}

pub(crate) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<TtsVoice>, CoreError> {
    match profile.kind {
        TtsProviderKind::OpenAiCompatible => openai::discover_voices(profile, credential).await,
        TtsProviderKind::Qwen => {
            super::qwen::discover_voices(
                &profile.endpoint,
                profile.model.as_deref().unwrap_or_default(),
                credential,
            )
            .await
        }
        TtsProviderKind::MiniMax => {
            minimax::discover_voices(profile, require_credential(credential)?).await
        }
        TtsProviderKind::Volcengine => Err(tts_error(
            TtsErrorKind::Unsupported,
            "TTS_VOICE_DISCOVERY_UNSUPPORTED",
        )),
        TtsProviderKind::ElevenLabs => {
            elevenlabs::discover_voices(profile, require_credential(credential)?).await
        }
        TtsProviderKind::FishAudio => {
            fish_audio::discover_voices(profile, require_credential(credential)?).await
        }
        TtsProviderKind::Gemini => {
            let _ = require_credential(credential)?;
            Ok(gemini::discover_voices())
        }
    }
}

pub(crate) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: Option<&str>,
) -> Result<SynthesizedAudio, CoreError> {
    match profile.kind {
        TtsProviderKind::OpenAiCompatible => openai::synthesize(profile, request, credential).await,
        TtsProviderKind::Qwen => super::qwen::synthesize(profile, request, credential).await,
        TtsProviderKind::MiniMax => {
            minimax::synthesize(profile, request, require_credential(credential)?).await
        }
        TtsProviderKind::Volcengine => {
            volcengine::synthesize(profile, request, require_credential(credential)?).await
        }
        TtsProviderKind::ElevenLabs => {
            elevenlabs::synthesize(profile, request, require_credential(credential)?).await
        }
        TtsProviderKind::FishAudio => {
            fish_audio::synthesize(profile, request, require_credential(credential)?).await
        }
        TtsProviderKind::Gemini => {
            gemini::synthesize(profile, request, require_credential(credential)?).await
        }
    }
}

fn require_credential(credential: Option<&str>) -> Result<&str, CoreError> {
    credential
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))
}

pub(super) fn provider_url(
    profile: &TtsProviderProfile,
    target_suffix: &str,
    known_suffixes: &[&str],
) -> Result<Url, CoreError> {
    let mut url = Url::parse(profile.endpoint.trim())
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "INVALID_TTS_ENDPOINT",
        ));
    }
    let path = url.path().trim_end_matches('/');
    if path.ends_with(target_suffix) {
        return Ok(url);
    }
    let mut base = path;
    for suffix in known_suffixes {
        if let Some(stripped) = base.strip_suffix(suffix) {
            base = stripped;
            break;
        }
    }
    let base = base.trim_end_matches('/');
    let next = if base.is_empty() {
        target_suffix.to_owned()
    } else {
        format!("{base}{target_suffix}")
    };
    url.set_path(&next);
    Ok(url)
}

pub(super) fn json_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub(super) fn redact_secrets(message: &str, secrets: &[&str]) -> String {
    let mut redacted = message.to_owned();
    for secret in secrets {
        if !secret.is_empty() {
            redacted = redacted.replace(secret, "[credential]");
        }
    }
    redacted
}

pub(super) fn sort_deduplicate_voices(voices: &mut Vec<TtsVoice>) {
    let mut seen = std::collections::HashSet::new();
    voices.retain(|voice| !voice.id.trim().is_empty() && seen.insert(voice.id.clone()));
}
