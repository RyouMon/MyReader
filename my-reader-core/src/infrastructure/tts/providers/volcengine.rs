//! Unified Volcengine / Doubao TTS adapter supporting V3 unidirectional HTTP (default) and V1 HTTP.

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use uuid::Uuid;

use super::{
    audio_from_bytes, client,
    encoding::{decode_base64, encode_wav_pcm16},
    json_string, map_reqwest_error, provider_url, redact_secrets, response_bytes, successful,
    tts_error, SynthesizedAudio, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderProfile, TtsSynthesisRequest},
    CoreError, TtsErrorKind,
};

const VOLCENGINE_MODELS: &[&str] = &[
    "seed-tts-2.0",
    "seed-icl-2.0",
    "seed-tts-1.0",
    "volc.service_type.10029",
    "volc.megatts.default",
];

pub(super) const SUPPORTED_FORMATS: &[TtsAudioFormat] = &[
    TtsAudioFormat::Mp3,
    TtsAudioFormat::Opus,
    TtsAudioFormat::Wav,
];

const V3_SAMPLE_RATE: u32 = 24_000;

pub(super) fn models() -> Vec<String> {
    VOLCENGINE_MODELS.iter().map(|id| (*id).into()).collect()
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
            "VOLCENGINE_AUDIO_FORMAT_UNSUPPORTED",
        ));
    }
    if is_v1_endpoint(&profile.endpoint) {
        synthesize_v1(profile, request, credential, format).await
    } else {
        synthesize_v3(profile, request, credential, format).await
    }
}

fn is_v1_endpoint(endpoint: &str) -> bool {
    let path = endpoint.trim().trim_end_matches('/');
    path.ends_with("/api/v1/tts") || path.ends_with("/v1/tts")
}

async fn synthesize_v3(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
    format: TtsAudioFormat,
) -> Result<SynthesizedAudio, CoreError> {
    let parsed = parse_v3_credential(credential)?;
    let endpoint = provider_url(
        profile,
        "/api/v3/tts/unidirectional",
        &[
            "/api/v3/tts/unidirectional",
            "/api/v3/tts/unidirectional/sse",
        ],
    )?;
    let resource_id = profile.model.as_deref().unwrap_or("seed-tts-2.0");
    let wire_format = match format {
        TtsAudioFormat::Mp3 => "mp3",
        TtsAudioFormat::Opus => "ogg_opus",
        TtsAudioFormat::Wav => "pcm",
        _ => "mp3",
    };
    let mut audio_params = json!({
        "format": wire_format,
        "sample_rate": V3_SAMPLE_RATE,
    });
    if let Some(speed) = request.speed {
        let speech_rate = ((speed.clamp(0.5, 2.0) - 1.0) * 100.0).round() as i32;
        audio_params["speech_rate"] = json!(speech_rate.clamp(-50, 100));
    }
    let mut req_params = json!({
        "text": request.text,
        "speaker": request.voice_id,
        "audio_params": audio_params,
    });
    if let Some(instructions) = request
        .instructions
        .as_deref()
        .or(profile.options.instructions.as_deref())
        .filter(|value| !value.is_empty())
    {
        let additions = serde_json::to_string(&json!({ "context_texts": [instructions] }))?;
        req_params["additions"] = json!(additions);
    }
    let body = json!({
        "user": { "uid": "myreader" },
        "req_params": req_params,
    });

    let mut builder = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .header("X-Api-Resource-Id", resource_id)
        .header("X-Api-Request-Id", Uuid::new_v4().to_string())
        .header(CONTENT_TYPE, "application/json");
    // Never mix X-Api-Key with legacy X-Api-App-Id / X-Api-Access-Key headers.
    match &parsed {
        VolcengineCredential::ApiKey(key) => {
            builder = builder.header("X-Api-Key", key);
        }
        VolcengineCredential::AppToken { app_id, access_key } => {
            builder = builder
                .header("X-Api-App-Id", app_id)
                .header("X-Api-Access-Key", access_key);
        }
    }

    let secrets = parsed.secrets();
    let response = builder
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(credential)).await?;
    let bytes = response_bytes(response, "TTS_AUDIO_TOO_LARGE").await?;
    let raw_audio = decode_v3_stream(&bytes, &secrets)?;
    let audio = if format == TtsAudioFormat::Wav {
        encode_wav_pcm16(&raw_audio, V3_SAMPLE_RATE, 1)
    } else {
        raw_audio
    };
    audio_from_bytes(audio, Some(format))
}

async fn synthesize_v1(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
    format: TtsAudioFormat,
) -> Result<SynthesizedAudio, CoreError> {
    let VolcengineCredential::AppToken { app_id, access_key } = parse_v3_credential(credential)?
    else {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "VOLCENGINE_V1_APP_ID_AND_TOKEN_REQUIRED",
        ));
    };
    let endpoint = provider_url(profile, "/api/v1/tts", &["/api/v1/tts", "/v1/tts"])?;
    let encoding = match format {
        TtsAudioFormat::Mp3 => "mp3",
        TtsAudioFormat::Opus => "ogg_opus",
        TtsAudioFormat::Wav => "wav",
        _ => "mp3",
    };
    let cluster = profile
        .model
        .as_deref()
        .filter(|value| value.starts_with("volcano_"))
        .unwrap_or("volcano_tts");
    let body = json!({
        "app": {
            "appid": app_id,
            "token": access_key,
            "cluster": cluster,
        },
        "user": { "uid": "myreader" },
        "audio": {
            "voice_type": request.voice_id,
            "encoding": encoding,
            "speed_ratio": request.speed.unwrap_or(1.0).clamp(0.5, 2.0),
        },
        "request": {
            "reqid": Uuid::new_v4().to_string(),
            "text": request.text,
            "text_type": "plain",
            "operation": "query",
        }
    });
    let secrets = [app_id.as_str(), access_key.as_str()];
    let response = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .header(AUTHORIZATION, format!("Bearer;{access_key}"))
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(&access_key)).await?;
    let bytes = response_bytes(response, "TTS_AUDIO_TOO_LARGE").await?;
    let body: Value = serde_json::from_slice(&bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_INVALID_RESPONSE"))?;
    let code = body.get("code").and_then(Value::as_i64).unwrap_or(-1);
    if code != 3000 {
        let message = body
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("request failed");
        let kind = match code {
            3001 | 3003 | 3010 => TtsErrorKind::Unauthorized,
            3005 | 3006 => TtsErrorKind::RateLimited,
            _ => TtsErrorKind::InvalidRequest,
        };
        return Err(tts_error(
            kind,
            &redact_secrets(&format!("VOLCENGINE_V1_{code}: {message}"), &secrets),
        ));
    }
    let encoded = body
        .get("data")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_AUDIO_MISSING"))?;
    let audio = decode_base64(encoded)
        .map_err(|_| tts_error(TtsErrorKind::InvalidAudio, "VOLCENGINE_AUDIO_INVALID"))?;
    audio_from_bytes(audio, Some(format))
}

fn decode_v3_stream(bytes: &[u8], secrets: &[&str]) -> Result<Vec<u8>, CoreError> {
    let text = std::str::from_utf8(bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_INVALID_RESPONSE"))?;
    let mut audio = Vec::new();
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        let payload = line.strip_prefix("data:").map(str::trim).unwrap_or(line);
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        let chunk: Value = serde_json::from_str(payload)
            .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "VOLCENGINE_INVALID_RESPONSE"))?;
        let code = chunk.get("code").and_then(Value::as_i64).unwrap_or(0);
        if code != 0 && code != 20_000_000 {
            let message = chunk
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("request failed");
            let kind = match code {
                45_000_000..=45_000_999 | 401 | 403 => TtsErrorKind::Unauthorized,
                429 | 55_000_000..=55_000_999 => TtsErrorKind::RateLimited,
                _ => TtsErrorKind::InvalidRequest,
            };
            return Err(tts_error(
                kind,
                &redact_secrets(&format!("VOLCENGINE_V3_{code}: {message}"), secrets),
            ));
        }
        if let Some(encoded) = chunk
            .get("data")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        {
            let decoded = decode_base64(encoded)
                .map_err(|_| tts_error(TtsErrorKind::InvalidAudio, "VOLCENGINE_AUDIO_INVALID"))?;
            audio.extend_from_slice(&decoded);
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

enum VolcengineCredential {
    ApiKey(String),
    AppToken { app_id: String, access_key: String },
}

impl VolcengineCredential {
    fn secrets(&self) -> Vec<&str> {
        match self {
            Self::ApiKey(key) => vec![key.as_str()],
            Self::AppToken { app_id, access_key } => vec![app_id.as_str(), access_key.as_str()],
        }
    }
}

fn parse_v3_credential(raw: &str) -> Result<VolcengineCredential, CoreError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(tts_error(
            TtsErrorKind::Unauthorized,
            "TTS_CREDENTIAL_REQUIRED",
        ));
    }
    if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
        if let Some(api_key) = json_string(&json, &["apiKey", "api_key", "key"]) {
            return Ok(VolcengineCredential::ApiKey(api_key));
        }
        let app_id = json_string(&json, &["appId", "appid", "app_id"]);
        let access_key = json_string(&json, &["accessKey", "access_key", "accessToken", "token"]);
        if let (Some(app_id), Some(access_key)) = (app_id, access_key) {
            return Ok(VolcengineCredential::AppToken { app_id, access_key });
        }
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "VOLCENGINE_CREDENTIAL_FORMAT",
        ));
    }
    if let Some((left, right)) = trimmed.split_once(':') {
        let (app_id, access_key) = (left.trim(), right.trim());
        if app_id.is_empty() || access_key.is_empty() {
            return Err(tts_error(
                TtsErrorKind::Configuration,
                "VOLCENGINE_CREDENTIAL_FORMAT",
            ));
        }
        return Ok(VolcengineCredential::AppToken {
            app_id: app_id.to_owned(),
            access_key: access_key.to_owned(),
        });
    }
    Ok(VolcengineCredential::ApiKey(trimmed.to_owned()))
}
