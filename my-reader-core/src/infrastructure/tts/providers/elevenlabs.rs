//! ElevenLabs TTS REST adapter, `/v1/models`, and cursor-paginated `/v2/voices` discovery.

use reqwest::header::{ACCEPT, CONTENT_TYPE};
use serde_json::{json, Value};

use super::{
    audio_response, client, json_string, map_reqwest_error, provider_url, redact_secrets,
    response_bytes, sort_deduplicate_voices, successful, tts_error, SynthesizedAudio,
    MAX_DISCOVERY_PAGES, REQUEST_TIMEOUT, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

pub(super) const SUPPORTED_FORMATS: &[TtsAudioFormat] = &[TtsAudioFormat::Mp3];

const ELEVENLABS_FALLBACK_MODELS: &[&str] = &[
    "eleven_multilingual_v2",
    "eleven_flash_v2_5",
    "eleven_turbo_v2_5",
    "eleven_v3",
];

pub(super) fn supports_speed(model: &str) -> bool {
    let lower = model.to_ascii_lowercase();
    !lower.starts_with("eleven_v3") && !lower.starts_with("eleven_v4")
}

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = profile.options.response_format;
    if !SUPPORTED_FORMATS.contains(&format) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "ELEVENLABS_AUDIO_FORMAT_UNSUPPORTED",
        ));
    }
    let mut endpoint = provider_url(
        profile,
        "/v1/text-to-speech",
        &["/v1/text-to-speech", "/v1/models", "/v2/voices"],
    )?;
    endpoint
        .path_segments_mut()
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?
        .push(&request.voice_id);
    endpoint
        .query_pairs_mut()
        .append_pair("output_format", "mp3_44100_128");

    let model = profile.model.as_deref().unwrap_or("eleven_multilingual_v2");
    let mut body = json!({
        "text": request.text,
        "model_id": model,
    });
    if supports_speed(model) {
        if let Some(speed) = request.speed {
            body["voice_settings"] = json!({ "speed": speed.clamp(0.7, 1.2) });
        }
    }
    let response = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .header("xi-api-key", credential)
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, "audio/mpeg")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    audio_response(response, Some(format), Some(credential)).await
}

pub(super) async fn discover_models(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<String>, CoreError> {
    let endpoint = provider_url(
        profile,
        "/v1/models",
        &["/v1/text-to-speech", "/v1/models", "/v2/voices"],
    )?;
    let response = client(REQUEST_TIMEOUT)?
        .get(endpoint)
        .header("xi-api-key", credential)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let bytes = response_bytes(response, "TTS_MODEL_LIST_TOO_LARGE").await?;
        let text = String::from_utf8_lossy(&bytes);
        if text.contains("missing_permissions") && text.contains("models_read") {
            return Ok(ELEVENLABS_FALLBACK_MODELS
                .iter()
                .map(|id| (*id).into())
                .collect());
        }
        return Err(tts_error(
            TtsErrorKind::Unauthorized,
            &redact_secrets(&format!("HTTP_401: {text}"), &[credential]),
        ));
    }
    let response = successful(response, Some(credential)).await?;
    let bytes = response_bytes(response, "TTS_MODEL_LIST_TOO_LARGE").await?;
    let entries: Vec<Value> = serde_json::from_slice(&bytes).map_err(|_| {
        tts_error(
            TtsErrorKind::InvalidResponse,
            "ELEVENLABS_INVALID_MODEL_LIST",
        )
    })?;
    let mut ids: Vec<String> = entries
        .into_iter()
        .filter(|entry| {
            entry
                .get("can_do_text_to_speech")
                .and_then(Value::as_bool)
                .unwrap_or(true)
        })
        .filter_map(|entry| json_string(&entry, &["model_id"]))
        .collect();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

pub(super) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<TtsVoice>, CoreError> {
    let http = client(REQUEST_TIMEOUT)?;
    let mut voices = Vec::new();
    let mut next_page_token: Option<String> = None;
    for _ in 0..MAX_DISCOVERY_PAGES {
        let mut endpoint = provider_url(
            profile,
            "/v2/voices",
            &["/v1/text-to-speech", "/v1/models", "/v2/voices"],
        )?;
        {
            let mut query = endpoint.query_pairs_mut();
            query.append_pair("page_size", "100");
            if let Some(token) = next_page_token.as_deref() {
                query.append_pair("next_page_token", token);
            }
        }
        let response = http
            .get(endpoint)
            .header("xi-api-key", credential)
            .send()
            .await
            .map_err(map_reqwest_error)?;
        let response = successful(response, Some(credential)).await?;
        let bytes = response_bytes(response, "TTS_VOICE_LIST_TOO_LARGE").await?;
        let body: Value = serde_json::from_slice(&bytes).map_err(|_| {
            tts_error(
                TtsErrorKind::InvalidResponse,
                "ELEVENLABS_INVALID_VOICE_LIST",
            )
        })?;
        let entries = body
            .get("voices")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                tts_error(
                    TtsErrorKind::InvalidResponse,
                    "ELEVENLABS_INVALID_VOICE_LIST",
                )
            })?;
        for entry in entries {
            let Some(id) = json_string(entry, &["voice_id"]) else {
                continue;
            };
            let name = json_string(entry, &["name"]).filter(|value| value != &id);
            let language = entry
                .pointer("/labels/language")
                .or_else(|| entry.pointer("/fine_tuning/language"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("mul")
                .to_owned();
            let gender = entry
                .pointer("/labels/gender")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned);
            voices.push(TtsVoice {
                id,
                name,
                language,
                gender,
            });
        }
        let has_more = body
            .get("has_more")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        next_page_token = json_string(&body, &["next_page_token"]);
        if !has_more || next_page_token.is_none() {
            break;
        }
    }
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}
