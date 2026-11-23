use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use uuid::Uuid;

use super::{
    audio_format, audio_from_bytes, client, map_reqwest_error, provider_url, response_bytes,
    successful, tts_error, SynthesizedAudio, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderProfile, TtsSynthesisRequest},
    CoreError, TtsErrorKind,
};

const VOLCENGINE_MODELS: &[&str] = &["volcano_tts"];

pub(super) fn models() -> Vec<String> {
    VOLCENGINE_MODELS.iter().map(|id| (*id).into()).collect()
}

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = audio_format(profile)?;
    let credentials = parse_credential(credential)?;
    let endpoint = provider_url(profile, "/api/v1/tts")?;
    let body = serde_json::json!({
        "app": {
            "appid": credentials.app_id,
            "token": credentials.token,
            "cluster": profile.model.as_deref().unwrap_or("volcano_tts"),
        },
        "user": {"uid": "myreader"},
        "audio": {
            "voice_type": request.voice_id,
            "encoding": v1_format(format),
            "speed_ratio": request.speed.unwrap_or(1.0).clamp(0.5, 2.0),
            "rate": 24000,
        },
        "request": {
            "reqid": Uuid::new_v4().to_string(),
            "text": request.text,
            "text_type": "plain",
            "operation": "query",
        }
    });
    let response = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .header(AUTHORIZATION, format!("Bearer;{}", credentials.token))
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(credential)).await?;
    let bytes = response_bytes(response, "TTS_RESPONSE_TOO_LARGE").await?;
    let audio = decode_v1_audio(&bytes)?;
    audio_from_bytes(audio, Some(format))
}

#[derive(Debug)]
pub(super) struct VolcengineCredential {
    pub(super) app_id: String,
    pub(super) token: String,
}

pub(super) fn parse_credential(value: &str) -> Result<VolcengineCredential, CoreError> {
    if let Ok(json) = serde_json::from_str::<Value>(value) {
        let app_id = json
            .get("appId")
            .or_else(|| json.get("appid"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty());
        let token = json
            .get("token")
            .or_else(|| json.get("accessToken"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty());
        if let (Some(app_id), Some(token)) = (app_id, token) {
            return Ok(VolcengineCredential {
                app_id: app_id.to_owned(),
                token: token.to_owned(),
            });
        }
    }
    let (app_id, token) = value
        .split_once(':')
        .ok_or_else(|| tts_error(TtsErrorKind::Configuration, "VOLCENGINE_CREDENTIAL_FORMAT"))?;
    if app_id.trim().is_empty() || token.trim().is_empty() {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "VOLCENGINE_CREDENTIAL_FORMAT",
        ));
    }
    Ok(VolcengineCredential {
        app_id: app_id.to_owned(),
        token: token.to_owned(),
    })
}

pub(super) fn decode_v1_audio(bytes: &[u8]) -> Result<Vec<u8>, CoreError> {
    let body: Value = serde_json::from_slice(bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_INVALID_RESPONSE"))?;
    if body
        .get("code")
        .and_then(Value::as_i64)
        .is_some_and(|code| code != 0 && code != 3000)
    {
        return Err(tts_error(
            TtsErrorKind::InvalidRequest,
            "VOLCENGINE_SYNTHESIS_FAILED",
        ));
    }
    let encoded = body
        .get("data")
        .and_then(Value::as_str)
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_AUDIO_MISSING"))?;
    STANDARD
        .decode(encoded)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_AUDIO_INVALID"))
}

pub(super) fn decode_audio(bytes: &[u8]) -> Result<Vec<u8>, CoreError> {
    let mut audio = Vec::new();
    let mut values = Vec::new();
    if let Ok(iter) = serde_json::Deserializer::from_slice(bytes)
        .into_iter::<Value>()
        .collect::<Result<Vec<_>, _>>()
    {
        values = iter;
    } else {
        for line in bytes.split(|byte| *byte == b'\n') {
            let line = line.trim_ascii();
            let line = line.strip_prefix(b"data:").unwrap_or(line).trim_ascii();
            if !line.starts_with(b"{") {
                continue;
            }
            if line.is_empty() {
                continue;
            }
            values.push(serde_json::from_slice(line).map_err(|_| {
                tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_INVALID_RESPONSE")
            })?);
        }
    }
    for value in values {
        if let Some(encoded) = value.get("data").and_then(Value::as_str) {
            let chunk = STANDARD.decode(encoded).map_err(|_| {
                tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_AUDIO_INVALID")
            })?;
            audio.extend_from_slice(&chunk);
        }
        if value
            .get("code")
            .and_then(Value::as_i64)
            .is_some_and(|code| code != 0 && code != 20_000_000)
        {
            return Err(tts_error(
                TtsErrorKind::InvalidRequest,
                "VOLCENGINE_SYNTHESIS_FAILED",
            ));
        }
    }
    if audio.is_empty() {
        return Err(tts_error(
            TtsErrorKind::InvalidResponse,
            "VOLCENGINE_AUDIO_MISSING",
        ));
    }
    Ok(audio)
}

pub(super) fn format(format: TtsAudioFormat) -> &'static str {
    match format {
        TtsAudioFormat::Opus => "ogg_opus",
        TtsAudioFormat::Mp3 => "mp3",
        TtsAudioFormat::Wav => "wav",
        TtsAudioFormat::Flac => "mp3",
        TtsAudioFormat::Aac => "mp3",
    }
}

pub(super) fn v1_format(format: TtsAudioFormat) -> &'static str {
    match format {
        TtsAudioFormat::Wav => "wav",
        _ => "mp3",
    }
}
