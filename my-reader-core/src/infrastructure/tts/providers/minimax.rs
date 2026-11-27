//! MiniMax T2A v2 HTTP synthesis and `/v1/get_voice` catalog discovery.

use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};
use url::Url;

use super::{
    audio_from_bytes, client, encoding::decode_hex, json_string, map_reqwest_error, provider_url,
    redact_secrets, response_bytes, sort_deduplicate_voices, successful, tts_error,
    SynthesizedAudio, REQUEST_TIMEOUT, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

const MINIMAX_MODELS: &[&str] = &[
    "speech-2.8-hd",
    "speech-2.8-turbo",
    "speech-2.6-hd",
    "speech-2.6-turbo",
    "speech-02-hd",
    "speech-02-turbo",
];

pub(super) const SUPPORTED_FORMATS: &[TtsAudioFormat] = &[
    TtsAudioFormat::Mp3,
    TtsAudioFormat::Wav,
    TtsAudioFormat::Flac,
];

pub(super) fn models() -> Vec<String> {
    MINIMAX_MODELS.iter().map(|id| (*id).into()).collect()
}

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let parsed = parse_credential(credential)?;
    let format = profile.options.response_format;
    if !SUPPORTED_FORMATS.contains(&format) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "MINIMAX_AUDIO_FORMAT_UNSUPPORTED",
        ));
    }
    let endpoint = endpoint_url(profile, "/v1/t2a_v2", parsed.group_id.as_deref())?;
    let pitch = request
        .pitch
        .map(|value| ((value.clamp(0.5, 2.0) - 1.0) * 12.0).round() as i32)
        .unwrap_or(0)
        .clamp(-12, 12);
    let body = json!({
        "model": profile.model.as_deref().unwrap_or("speech-2.8-turbo"),
        "text": request.text,
        "stream": false,
        "output_format": "hex",
        "voice_setting": {
            "voice_id": request.voice_id,
            "speed": request.speed.unwrap_or(1.0).clamp(0.5, 2.0),
            "vol": 1.0,
            "pitch": pitch,
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": format.as_str(),
            "channel": 1,
        }
    });
    let secrets = parsed.secrets();
    let response = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .bearer_auth(&parsed.api_key)
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(&parsed.api_key)).await?;
    let bytes = response_bytes(response, "TTS_AUDIO_TOO_LARGE").await?;
    let audio = decode_audio(&bytes, &secrets)?;
    audio_from_bytes(audio, Some(format))
}

pub(super) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<TtsVoice>, CoreError> {
    let parsed = parse_credential(credential)?;
    let secrets = parsed.secrets();
    let endpoint = endpoint_url(profile, "/v1/get_voice", parsed.group_id.as_deref())?;
    let response = client(REQUEST_TIMEOUT)?
        .post(endpoint)
        .bearer_auth(&parsed.api_key)
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&json!({ "voice_type": "all" }))?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(&parsed.api_key)).await?;
    let bytes = response_bytes(response, "TTS_VOICE_LIST_TOO_LARGE").await?;
    decode_voices(&bytes, &secrets)
}

fn decode_audio(bytes: &[u8], secrets: &[&str]) -> Result<Vec<u8>, CoreError> {
    let body: Value = serde_json::from_slice(bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "MINIMAX_INVALID_RESPONSE"))?;
    check_base_resp(&body, secrets)?;
    let encoded = body
        .pointer("/data/audio")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "MINIMAX_AUDIO_MISSING"))?;
    decode_hex(encoded).map_err(|_| tts_error(TtsErrorKind::InvalidAudio, "MINIMAX_AUDIO_INVALID"))
}

fn decode_voices(bytes: &[u8], secrets: &[&str]) -> Result<Vec<TtsVoice>, CoreError> {
    let body: Value = serde_json::from_slice(bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "MINIMAX_INVALID_VOICE_LIST"))?;
    check_base_resp(&body, secrets)?;
    let mut voices = Vec::new();
    for bucket in ["system_voice", "voice_cloning", "voice_generation"] {
        let Some(entries) = body.get(bucket).and_then(Value::as_array) else {
            continue;
        };
        for entry in entries {
            let Some(id) = json_string(entry, &["voice_id"]) else {
                continue;
            };
            let name = json_string(entry, &["voice_name"]).filter(|value| value != &id);
            voices.push(TtsVoice {
                id,
                name,
                language: "mul".into(),
                gender: None,
            });
        }
    }
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}

fn check_base_resp(body: &Value, secrets: &[&str]) -> Result<(), CoreError> {
    let Some(status_code) = body
        .pointer("/base_resp/status_code")
        .and_then(Value::as_i64)
        .filter(|&code| code != 0)
    else {
        return Ok(());
    };
    let kind = match status_code {
        1004 | 2049 => TtsErrorKind::Unauthorized,
        1002 | 1039 => TtsErrorKind::RateLimited,
        _ => TtsErrorKind::InvalidRequest,
    };
    let detail = body
        .pointer("/base_resp/status_msg")
        .and_then(Value::as_str)
        .unwrap_or("request failed");
    Err(tts_error(
        kind,
        &redact_secrets(&format!("MINIMAX_ERROR_{status_code}: {detail}"), secrets),
    ))
}

fn endpoint_url(
    profile: &TtsProviderProfile,
    suffix: &str,
    group_id: Option<&str>,
) -> Result<Url, CoreError> {
    let mut url = provider_url(profile, suffix, &["/v1/t2a_v2", "/v1/get_voice"])?;
    if let Some(group_id) = group_id {
        let has_group = url
            .query_pairs()
            .any(|(key, _)| key.eq_ignore_ascii_case("groupid"));
        if !has_group {
            url.query_pairs_mut().append_pair("GroupId", group_id);
        }
    }
    Ok(url)
}

struct MiniMaxCredential {
    api_key: String,
    group_id: Option<String>,
}

impl MiniMaxCredential {
    fn secrets(&self) -> Vec<&str> {
        let mut secrets = vec![self.api_key.as_str()];
        if let Some(group_id) = self.group_id.as_deref() {
            secrets.push(group_id);
        }
        secrets
    }
}

fn parse_credential(raw: &str) -> Result<MiniMaxCredential, CoreError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(tts_error(
            TtsErrorKind::Unauthorized,
            "TTS_CREDENTIAL_REQUIRED",
        ));
    }
    if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
        if let Some(api_key) = json_string(&json, &["apiKey", "api_key", "key"]) {
            return Ok(MiniMaxCredential {
                api_key,
                group_id: json_string(&json, &["groupId", "group_id"]),
            });
        }
    }
    if let Some((left, right)) = trimmed.split_once(':') {
        let (left, right) = (left.trim(), right.trim());
        if !left.is_empty() && !right.is_empty() && left.bytes().all(|byte| byte.is_ascii_digit()) {
            return Ok(MiniMaxCredential {
                api_key: right.to_owned(),
                group_id: Some(left.to_owned()),
            });
        }
    }
    Ok(MiniMaxCredential {
        api_key: trimmed.to_owned(),
        group_id: None,
    })
}
