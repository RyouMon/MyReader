use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};
use url::Url;

use super::{
    audio_format, audio_from_bytes, client, json_string, map_reqwest_error, provider_url,
    response_bytes, successful, tts_error, SynthesizedAudio, REQUEST_TIMEOUT, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

const MINIMAX_MODELS: &[&str] = &[
    "speech-2.8-hd",
    "speech-2.8-turbo",
    "speech-2.6-hd",
    "speech-2.6-turbo",
    "speech-02-hd",
    "speech-02-turbo",
    "speech-01-hd",
    "speech-01-turbo",
];

pub(super) fn models() -> Vec<String> {
    MINIMAX_MODELS.iter().map(|id| (*id).into()).collect()
}

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let credentials = parse_minimax_credential(profile, credential)?;
    let format = audio_format(profile)?;
    let endpoint = minimax_endpoint(profile, "/v1/t2a_v2", credentials.group_id.as_deref())?;
    let body = json!({
        "model": profile.model.as_deref().unwrap_or("speech-2.8-turbo"),
        "text": request.text,
        "stream": false,
        "output_format": "hex",
        "voice_setting": {
            "voice_id": request.voice_id,
            "speed": request.speed.unwrap_or(1.0).clamp(0.5, 2.0),
            "vol": 1,
            "pitch": 0,
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": format.as_str(),
            "channel": 1,
        }
    });
    let response = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .bearer_auth(&credentials.api_key)
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(&credentials.api_key)).await?;
    let bytes = response_bytes(response, "TTS_RESPONSE_TOO_LARGE").await?;
    let audio = decode_minimax_audio(&bytes)?;
    audio_from_bytes(audio, Some(format))
}

pub(super) fn decode_minimax_audio(bytes: &[u8]) -> Result<Vec<u8>, CoreError> {
    let body: Value = serde_json::from_slice(bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "MINIMAX_INVALID_RESPONSE"))?;
    if body
        .pointer("/base_resp/status_code")
        .and_then(Value::as_i64)
        .is_some_and(|status| status != 0)
    {
        return Err(tts_error(
            TtsErrorKind::InvalidRequest,
            "MINIMAX_SYNTHESIS_FAILED",
        ));
    }
    let encoded = body
        .pointer("/data/audio")
        .and_then(Value::as_str)
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "MINIMAX_AUDIO_MISSING"))?;
    hex::decode(encoded)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "MINIMAX_AUDIO_INVALID"))
}

pub(super) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<TtsVoice>, CoreError> {
    let credentials = parse_minimax_credential(profile, credential)?;
    let response = client(REQUEST_TIMEOUT)?
        .post(minimax_endpoint(
            profile,
            "/v1/get_voice",
            credentials.group_id.as_deref(),
        )?)
        .bearer_auth(&credentials.api_key)
        .header(CONTENT_TYPE, "application/json")
        .body(br#"{"voice_type":"all"}"#.to_vec())
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(&credentials.api_key)).await?;
    let bytes = response_bytes(response, "TTS_VOICE_LIST_TOO_LARGE").await?;
    let body: Value = serde_json::from_slice(&bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "MINIMAX_INVALID_VOICE_LIST"))?;
    if body
        .pointer("/base_resp/status_code")
        .and_then(Value::as_i64)
        .is_some_and(|status| status != 0)
    {
        return Err(tts_error(
            TtsErrorKind::InvalidRequest,
            "MINIMAX_VOICE_LIST_FAILED",
        ));
    }
    let mut voices = Vec::new();
    for category in ["system_voice", "voice_cloning", "voice_generation"] {
        if let Some(items) = body.get(category).and_then(Value::as_array) {
            voices.extend(items.iter().filter_map(|item| {
                item.get("voice_id")
                    .and_then(Value::as_str)
                    .filter(|id| !id.trim().is_empty())
                    .map(|id| crate::models::TtsVoice {
                        id: id.to_owned(),
                        language: "mul".into(),
                        gender: None,
                    })
            }));
        }
    }
    voices.sort_by(|left, right| left.id.cmp(&right.id));
    voices.dedup_by(|left, right| left.id == right.id);
    Ok(voices)
}

#[derive(Debug)]
pub(super) struct MiniMaxCredential {
    pub(super) api_key: String,
    pub(super) group_id: Option<String>,
}

pub(super) fn parse_minimax_credential(
    profile: &TtsProviderProfile,
    value: &str,
) -> Result<MiniMaxCredential, CoreError> {
    let endpoint = Url::parse(profile.endpoint.trim())
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    let endpoint_group_id = endpoint
        .query_pairs()
        .find(|(key, value)| is_minimax_group_id_key(key) && !value.trim().is_empty())
        .map(|(_, value)| value.into_owned());
    let parsed = serde_json::from_str::<Value>(value).ok();
    let object = parsed.as_ref().filter(|value| value.is_object());
    let api_key = object
        .and_then(|value| json_string(value, &["apiKey", "api_key"]))
        .unwrap_or_else(|| {
            if object.is_some() {
                String::new()
            } else {
                value.trim().to_owned()
            }
        });
    let credential_group_id =
        object.and_then(|value| json_string(value, &["groupId", "group_id", "GroupId"]));
    if api_key.is_empty() {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "MINIMAX_API_KEY_REQUIRED",
        ));
    }
    Ok(MiniMaxCredential {
        api_key,
        group_id: endpoint_group_id.or(credential_group_id),
    })
}

pub(super) fn minimax_endpoint(
    profile: &TtsProviderProfile,
    path: &str,
    group_id: Option<&str>,
) -> Result<Url, CoreError> {
    let mut endpoint = provider_url(profile, path)?;
    if let Some(group_id) = group_id.filter(|value| !value.trim().is_empty()) {
        if endpoint
            .query_pairs()
            .any(|(key, value)| is_minimax_group_id_key(&key) && !value.trim().is_empty())
        {
            return Ok(endpoint);
        }
        endpoint.query_pairs_mut().append_pair("GroupId", group_id);
    }
    Ok(endpoint)
}

fn is_minimax_group_id_key(key: &str) -> bool {
    key.eq_ignore_ascii_case("groupid") || key.eq_ignore_ascii_case("group_id")
}
