//! OpenAI-compatible `/v1/audio/speech` adapter with optional empty credentials for local servers.

use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use url::Url;

use super::{
    audio_response, client, json_string, map_reqwest_error, response_bytes,
    sort_deduplicate_voices, successful, tts_error, SynthesizedAudio, REQUEST_TIMEOUT,
    SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsProviderKind, TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: Option<&str>,
) -> Result<SynthesizedAudio, CoreError> {
    if profile.options.kind != TtsProviderKind::OpenAiCompatible {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_PROVIDER_OPTIONS_MISMATCH",
        ));
    }
    let response_format = profile.options.response_format;
    let model = profile.model.as_deref().unwrap_or("gpt-4o-mini-tts");
    let mut body = json!({
        "model": model,
        "voice": request.voice_id,
        "input": request.text,
        "response_format": response_format.as_str(),
    });
    if let Some(speed) = request.speed {
        body["speed"] = json!(speed.clamp(0.25, 4.0));
    }
    if let Some(instructions) = request
        .instructions
        .as_deref()
        .or(profile.options.instructions.as_deref())
        .filter(|value| !value.is_empty())
    {
        body["instructions"] = json!(instructions);
    }

    let mut builder = client(SYNTHESIS_TIMEOUT)?
        .post(speech_endpoint(profile)?)
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, response_format.mime_type());
    let credential = credential.map(str::trim).filter(|value| !value.is_empty());
    if let Some(token) = credential {
        builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = builder
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    audio_response(response, Some(response_format), credential).await
}

pub(super) async fn discover_models(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    let mut url = speech_endpoint(profile)?;
    let path = url.path().trim_end_matches("/audio/speech");
    url.set_path(&format!("{path}/models"));
    let credential = credential.map(str::trim).filter(|value| !value.is_empty());
    let mut request = client(REQUEST_TIMEOUT)?.get(url);
    if let Some(token) = credential {
        request = request.bearer_auth(token);
    }
    let response = successful(request.send().await.map_err(map_reqwest_error)?, credential).await?;
    let bytes = response_bytes(response, "TTS_MODEL_LIST_TOO_LARGE").await?;
    let body: Value = serde_json::from_slice(&bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "TTS_INVALID_MODEL_LIST"))?;
    let entries = body["data"]
        .as_array()
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "TTS_INVALID_MODEL_LIST"))?;
    let mut ids: Vec<String> = entries
        .iter()
        .filter_map(|entry| entry["id"].as_str())
        .filter(|id| !id.trim().is_empty())
        .map(str::to_owned)
        .collect();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

/// Best-effort voice discovery for OpenAI-compatible servers (e.g. Kokoro-FastAPI `/v1/audio/voices`,
/// Speaches `/v1/audio/speech/voices`).
pub(super) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<TtsVoice>, CoreError> {
    let base = speech_endpoint(profile)?;
    let base_prefix = base.path().trim_end_matches("/audio/speech").to_owned();
    let credential = credential.map(str::trim).filter(|value| !value.is_empty());
    let http = client(REQUEST_TIMEOUT)?;
    let mut last_error = None;
    for suffix in ["/audio/voices", "/audio/speech/voices"] {
        let mut url = base.clone();
        url.set_path(&format!("{base_prefix}{suffix}"));
        let mut builder = http.get(url);
        if let Some(token) = credential {
            builder = builder.bearer_auth(token);
        }
        let response = builder.send().await.map_err(map_reqwest_error)?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            last_error = Some(tts_error(
                TtsErrorKind::Unsupported,
                "TTS_VOICE_DISCOVERY_UNSUPPORTED",
            ));
            continue;
        }
        let response = successful(response, credential).await?;
        let bytes = response_bytes(response, "TTS_VOICE_LIST_TOO_LARGE").await?;
        let mut voices = parse_voice_list(&bytes)?;
        sort_deduplicate_voices(&mut voices);
        return Ok(voices);
    }
    Err(last_error
        .unwrap_or_else(|| tts_error(TtsErrorKind::Unsupported, "TTS_VOICE_DISCOVERY_UNSUPPORTED")))
}

fn parse_voice_list(bytes: &[u8]) -> Result<Vec<TtsVoice>, CoreError> {
    let body: Value = serde_json::from_slice(bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "TTS_INVALID_VOICE_LIST"))?;
    let list = body
        .as_array()
        .or_else(|| body.get("voices").and_then(Value::as_array))
        .or_else(|| body.get("data").and_then(Value::as_array))
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "TTS_INVALID_VOICE_LIST"))?;
    let mut voices = Vec::new();
    for entry in list {
        if let Some(id) = entry.as_str().map(str::trim).filter(|id| !id.is_empty()) {
            voices.push(TtsVoice {
                id: id.to_owned(),
                name: None,
                language: "mul".into(),
                gender: None,
            });
            continue;
        }
        if let Some(id) = json_string(entry, &["id", "voice_id", "voiceId", "name"]) {
            let name = json_string(entry, &["name", "display_name", "title"])
                .filter(|display| display != &id);
            let language =
                json_string(entry, &["language", "lang", "locale"]).unwrap_or_else(|| "mul".into());
            let gender = json_string(entry, &["gender"]);
            voices.push(TtsVoice {
                id,
                name,
                language,
                gender,
            });
        }
    }
    Ok(voices)
}

pub(super) fn speech_endpoint(profile: &TtsProviderProfile) -> Result<Url, CoreError> {
    let mut url = Url::parse(&profile.endpoint)
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    let path = url.path().trim_end_matches('/');
    if path.ends_with("/audio/speech") {
        return Ok(url);
    }
    let next_path = if path.ends_with("/v1") {
        format!("{path}/audio/speech")
    } else if path.is_empty() {
        "/v1/audio/speech".into()
    } else {
        format!("{path}/v1/audio/speech")
    };
    url.set_path(&next_path);
    Ok(url)
}
