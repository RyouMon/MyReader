use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use url::Url;
use uuid::Uuid;

use super::{
    audio_from_bytes, audio_response, client, map_reqwest_error, response_bytes, successful,
    tts_error, SynthesizedAudio, REQUEST_TIMEOUT, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderKind, TtsProviderProfile, TtsSynthesisRequest},
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
const VOLCENGINE_MODELS: &[&str] = &["volcano_tts"];
const DOUBAO_MODELS: &[&str] = &["seed-tts-2.0", "seed-icl-2.0"];
const FISH_AUDIO_MODELS: &[&str] = &[
    "s1",
    "s2-pro",
    "s2.1-pro",
    "s2.1-pro-free",
    "drama-3",
    "s3-pro",
];

pub(crate) async fn discover_models(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    match profile.kind {
        TtsProviderKind::MiniMax => Ok(MINIMAX_MODELS.iter().map(|id| (*id).into()).collect()),
        TtsProviderKind::Volcengine => {
            Ok(VOLCENGINE_MODELS.iter().map(|id| (*id).into()).collect())
        }
        TtsProviderKind::Doubao => Ok(DOUBAO_MODELS.iter().map(|id| (*id).into()).collect()),
        TtsProviderKind::FishAudio => Ok(FISH_AUDIO_MODELS.iter().map(|id| (*id).into()).collect()),
        TtsProviderKind::ElevenLabs => discover_eleven_models(profile, credential).await,
        _ => Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_NATIVE_PROVIDER_UNSUPPORTED",
        )),
    }
}

pub(crate) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<crate::models::TtsVoice>, CoreError> {
    let credential = credential
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))?;
    match profile.kind {
        TtsProviderKind::MiniMax => discover_minimax_voices(profile, credential).await,
        TtsProviderKind::ElevenLabs => discover_eleven_voices(profile, credential).await,
        TtsProviderKind::FishAudio => discover_fish_voices(profile, credential).await,
        _ => Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_NATIVE_VOICE_DISCOVERY_UNSUPPORTED",
        )),
    }
}

pub(crate) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: Option<&str>,
) -> Result<SynthesizedAudio, CoreError> {
    let credential = credential
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))?;
    match profile.kind {
        TtsProviderKind::MiniMax => synthesize_minimax(profile, request, credential).await,
        TtsProviderKind::Volcengine | TtsProviderKind::Doubao => {
            synthesize_volcengine(profile, request, credential).await
        }
        TtsProviderKind::ElevenLabs => synthesize_elevenlabs(profile, request, credential).await,
        TtsProviderKind::FishAudio => synthesize_fish_audio(profile, request, credential).await,
        _ => Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_NATIVE_PROVIDER_UNSUPPORTED",
        )),
    }
}

async fn synthesize_minimax(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let credentials = parse_minimax_credential(profile, credential)?;
    let format = native_format(profile)?;
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

async fn synthesize_volcengine(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = native_format(profile)?;
    if profile.kind == TtsProviderKind::Volcengine {
        return synthesize_volcengine_v1(profile, request, credential, format).await;
    }
    let endpoint = provider_url(profile, "/api/v3/tts/unidirectional")?;
    let credentials = parse_doubao_credential(credential)?;
    let body = doubao_request_body(profile, request, format);
    let mut builder = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .header(
            "X-Api-Resource-Id",
            profile.model.as_deref().unwrap_or("seed-tts-2.0"),
        )
        .header("X-Api-Request-Id", Uuid::new_v4().to_string())
        .header(CONTENT_TYPE, "application/json");
    if let Some(api_key) = credentials.api_key.as_deref() {
        builder = builder.header("X-Api-Key", api_key);
    } else if let (Some(app_id), Some(access_key)) = (
        credentials.app_id.as_deref(),
        credentials.access_key.as_deref(),
    ) {
        builder = builder
            .header("X-Api-App-Id", app_id)
            .header("X-Api-Access-Key", access_key);
    }
    let response = builder
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(credential)).await?;
    let bytes = response_bytes(response, "TTS_RESPONSE_TOO_LARGE").await?;
    let audio = decode_volcengine_audio(&bytes)?;
    audio_from_bytes(audio, Some(format))
}

fn doubao_request_body(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    format: TtsAudioFormat,
) -> Value {
    let mut req_params = json!({
        "text": request.text,
        "speaker": request.voice_id,
        "audio_params": {
            "format": volcengine_format(format),
            "sample_rate": 24000,
        }
    });
    if let Some(speed) = request.speed {
        req_params["audio_params"]["speech_rate"] =
            json!(((speed.clamp(0.5, 2.0) - 1.0) * 100.0) as i32);
    }
    if let Some(instructions) = request
        .instructions
        .as_deref()
        .or(profile.options.instructions.as_deref())
        .filter(|value| !value.is_empty())
    {
        req_params["additions"] = json!(serde_json::to_string(
            &json!({"context_texts": [instructions]})
        )
        .expect("JSON value serialization cannot fail"));
    }
    json!({
        "user": {"uid": "myreader"},
        "req_params": req_params
    })
}

async fn synthesize_volcengine_v1(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
    format: TtsAudioFormat,
) -> Result<SynthesizedAudio, CoreError> {
    let credentials = parse_volcengine_credential(credential)?;
    let endpoint = provider_url(profile, "/api/v1/tts")?;
    let body = json!({
        "app": {
            "appid": credentials.app_id,
            "token": credentials.token,
            "cluster": profile.model.as_deref().unwrap_or("volcano_tts"),
        },
        "user": {"uid": "myreader"},
        "audio": {
            "voice_type": request.voice_id,
            "encoding": volcengine_v1_format(format),
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
    let audio = decode_volcengine_v1_audio(&bytes)?;
    audio_from_bytes(audio, Some(format))
}

fn decode_minimax_audio(bytes: &[u8]) -> Result<Vec<u8>, CoreError> {
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

fn decode_volcengine_v1_audio(bytes: &[u8]) -> Result<Vec<u8>, CoreError> {
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

fn decode_volcengine_audio(bytes: &[u8]) -> Result<Vec<u8>, CoreError> {
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

async fn synthesize_elevenlabs(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = native_format(profile)?;
    if format != TtsAudioFormat::Mp3 {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "ELEVENLABS_MP3_ONLY",
        ));
    }
    let mut endpoint = provider_url(profile, &format!("/v1/text-to-speech/{}", request.voice_id))?;
    endpoint
        .query_pairs_mut()
        .append_pair("output_format", "mp3_44100_128");
    let model = profile.model.as_deref().unwrap_or("eleven_multilingual_v2");
    let mut body = json!({
        "text": request.text,
        "model_id": model,
    });
    if let Some(language) = eleven_language_code(request.language.as_deref(), model) {
        body["language_code"] = json!(language);
    }
    let response = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .header("xi-api-key", credential)
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    audio_response(response, Some(format), Some(credential)).await
}

async fn synthesize_fish_audio(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = native_format(profile)?;
    let endpoint = provider_url(profile, "/v1/tts")?;
    let mut body = json!({
        "text": request.text,
        "format": format.as_str(),
        "prosody": {
            "speed": request.speed.unwrap_or(1.0).clamp(0.5, 2.0),
        },
    });
    if !request.voice_id.trim().is_empty() {
        body["reference_id"] = json!(request.voice_id);
    }
    let response = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .header(AUTHORIZATION, format!("Bearer {credential}"))
        .header("model", profile.model.as_deref().unwrap_or("s2.1-pro-free"))
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    audio_response(response, Some(format), Some(credential)).await
}

async fn discover_eleven_models(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    let credential = credential
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))?;
    let response = client(REQUEST_TIMEOUT)?
        .get(provider_url(profile, "/v1/models")?)
        .header("xi-api-key", credential)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(credential)).await?;
    let bytes = response_bytes(response, "TTS_MODEL_LIST_TOO_LARGE").await?;
    let models: Vec<Value> = serde_json::from_slice(&bytes).map_err(|_| {
        tts_error(
            TtsErrorKind::InvalidResponse,
            "ELEVENLABS_INVALID_MODEL_LIST",
        )
    })?;
    let mut ids = models
        .into_iter()
        .filter(|model| {
            model
                .get("can_do_text_to_speech")
                .and_then(Value::as_bool)
                .unwrap_or(true)
        })
        .filter_map(|model| {
            model
                .get("model_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    Ok(ids)
}

async fn discover_minimax_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<crate::models::TtsVoice>, CoreError> {
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

async fn discover_eleven_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<crate::models::TtsVoice>, CoreError> {
    let mut voices = Vec::new();
    let mut next_page_token = None;
    loop {
        let mut endpoint = provider_url(profile, "/v2/voices")?;
        endpoint
            .query_pairs_mut()
            .append_pair("page_size", "100")
            .append_pair("include_total_count", "false");
        if let Some(token) = next_page_token.as_deref() {
            endpoint
                .query_pairs_mut()
                .append_pair("next_page_token", token);
        }
        let response = client(REQUEST_TIMEOUT)?
            .get(endpoint)
            .header("xi-api-key", credential)
            .send()
            .await
            .map_err(map_reqwest_error)?;
        let response = successful(response, Some(credential)).await?;
        let bytes = response_bytes(response, "TTS_VOICE_LIST_TOO_LARGE").await?;
        let page = decode_eleven_voice_page(&bytes)?;
        voices.extend(page.voices);
        let next = page
            .next_page_token
            .filter(|token| !token.trim().is_empty());
        if !page.has_more || next == next_page_token {
            break;
        }
        next_page_token = next;
        if next_page_token.is_none() {
            break;
        }
    }
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}

async fn discover_fish_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<crate::models::TtsVoice>, CoreError> {
    let mut voices = Vec::new();
    let mut page_number = 1;
    loop {
        let mut endpoint = provider_url(profile, "/model")?;
        endpoint
            .query_pairs_mut()
            .append_pair("page_size", "100")
            .append_pair("page_number", &page_number.to_string());
        let response = client(REQUEST_TIMEOUT)?
            .get(endpoint)
            .header(AUTHORIZATION, format!("Bearer {credential}"))
            .send()
            .await
            .map_err(map_reqwest_error)?;
        let response = successful(response, Some(credential)).await?;
        let bytes = response_bytes(response, "TTS_VOICE_LIST_TOO_LARGE").await?;
        let page = decode_fish_voice_page(&bytes, page_number)?;
        voices.extend(page.voices);
        if !page.has_more {
            break;
        }
        page_number += 1;
    }
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}

#[cfg(test)]
fn decode_eleven_voice_list(bytes: &[u8]) -> Result<Vec<crate::models::TtsVoice>, CoreError> {
    let mut voices = decode_eleven_voice_page(bytes)?.voices;
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}

struct ElevenVoicePage {
    voices: Vec<crate::models::TtsVoice>,
    has_more: bool,
    next_page_token: Option<String>,
}

fn decode_eleven_voice_page(bytes: &[u8]) -> Result<ElevenVoicePage, CoreError> {
    let body: Value = serde_json::from_slice(bytes).map_err(|_| {
        tts_error(
            TtsErrorKind::InvalidResponse,
            "ELEVENLABS_INVALID_VOICE_LIST",
        )
    })?;
    body.get("voices")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            tts_error(
                TtsErrorKind::InvalidResponse,
                "ELEVENLABS_INVALID_VOICE_LIST",
            )
        })
        .map(|items| ElevenVoicePage {
            voices: items
                .iter()
                .filter_map(|item| {
                    let id = item.get("voice_id").and_then(Value::as_str)?;
                    (!id.trim().is_empty()).then(|| crate::models::TtsVoice {
                        id: id.to_owned(),
                        language: "mul".into(),
                        gender: item
                            .pointer("/labels/gender")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                    })
                })
                .collect::<Vec<_>>(),
            has_more: body
                .get("has_more")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            next_page_token: body
                .get("next_page_token")
                .and_then(Value::as_str)
                .map(str::to_owned),
        })
}

#[cfg(test)]
fn decode_fish_voice_list(bytes: &[u8]) -> Result<Vec<crate::models::TtsVoice>, CoreError> {
    let mut voices = decode_fish_voice_page(bytes, 1)?.voices;
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}

struct FishVoicePage {
    voices: Vec<crate::models::TtsVoice>,
    has_more: bool,
}

fn decode_fish_voice_page(bytes: &[u8], page_number: u64) -> Result<FishVoicePage, CoreError> {
    let body: Value = serde_json::from_slice(bytes).map_err(|_| {
        tts_error(
            TtsErrorKind::InvalidResponse,
            "FISH_AUDIO_INVALID_VOICE_LIST",
        )
    })?;
    let items = body.get("items").and_then(Value::as_array).ok_or_else(|| {
        tts_error(
            TtsErrorKind::InvalidResponse,
            "FISH_AUDIO_INVALID_VOICE_LIST",
        )
    })?;
    let voices = items
        .iter()
        .filter_map(|item| {
            if item
                .get("type")
                .and_then(Value::as_str)
                .is_some_and(|kind| kind != "tts")
            {
                return None;
            }
            let id = item.get("_id").and_then(Value::as_str)?;
            (!id.trim().is_empty()).then(|| crate::models::TtsVoice {
                id: id.to_owned(),
                language: item
                    .get("languages")
                    .and_then(Value::as_array)
                    .and_then(|languages| languages.first())
                    .and_then(Value::as_str)
                    .unwrap_or("mul")
                    .into(),
                gender: None,
            })
        })
        .collect::<Vec<_>>();
    let has_more = body
        .get("has_more")
        .and_then(Value::as_bool)
        .unwrap_or_else(|| {
            body.get("total")
                .and_then(Value::as_u64)
                .is_some_and(|total| total > page_number.saturating_mul(100))
        });
    Ok(FishVoicePage { voices, has_more })
}

fn sort_deduplicate_voices(voices: &mut Vec<crate::models::TtsVoice>) {
    voices.sort_by(|left, right| left.id.cmp(&right.id));
    voices.dedup_by(|left, right| left.id == right.id);
}

fn eleven_language_code(language: Option<&str>, model: &str) -> Option<String> {
    if model.contains("multilingual_v2") {
        return None;
    }
    language
        .map(|value| value.split(['-', '_']).next().unwrap_or(value))
        .map(str::trim)
        .filter(|value| {
            value.len() == 2
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphabetic())
        })
        .map(str::to_ascii_lowercase)
}

fn provider_url(profile: &TtsProviderProfile, default_path: &str) -> Result<Url, CoreError> {
    let mut url = Url::parse(profile.endpoint.trim())
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    let path = url.path().trim_end_matches('/');
    if path.is_empty() || path == "/" {
        url.set_path(default_path);
    } else {
        let base_segments = path.trim_start_matches('/').split('/').collect::<Vec<_>>();
        let route_segments = default_path
            .trim_start_matches('/')
            .split('/')
            .collect::<Vec<_>>();
        let shared_segments = (1..=base_segments.len().min(route_segments.len()))
            .rev()
            .find(|length| {
                base_segments[base_segments.len() - length..] == route_segments[..*length]
            })
            .unwrap_or(0);
        if shared_segments == route_segments.len() {
            return Ok(url);
        }
        let suffix = route_segments[shared_segments..].join("/");
        let next_path = if suffix.is_empty() {
            path.to_owned()
        } else {
            format!("{path}/{suffix}")
        };
        url.set_path(&next_path);
    }
    Ok(url)
}

fn native_format(profile: &TtsProviderProfile) -> Result<TtsAudioFormat, CoreError> {
    let format = profile.options.response_format;
    if matches!(
        format,
        TtsAudioFormat::Mp3 | TtsAudioFormat::Flac | TtsAudioFormat::Wav | TtsAudioFormat::Opus
    ) {
        Ok(format)
    } else {
        Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_AUDIO_FORMAT_UNSUPPORTED",
        ))
    }
}

fn volcengine_format(format: TtsAudioFormat) -> &'static str {
    match format {
        TtsAudioFormat::Opus => "ogg_opus",
        TtsAudioFormat::Mp3 => "mp3",
        TtsAudioFormat::Wav => "wav",
        TtsAudioFormat::Flac => "mp3",
        TtsAudioFormat::Aac => "mp3",
    }
}

fn volcengine_v1_format(format: TtsAudioFormat) -> &'static str {
    match format {
        TtsAudioFormat::Wav => "wav",
        _ => "mp3",
    }
}

#[derive(Debug)]
struct VolcengineCredential {
    app_id: String,
    token: String,
}

#[derive(Debug)]
struct MiniMaxCredential {
    api_key: String,
    group_id: Option<String>,
}

#[derive(Debug)]
struct DoubaoCredential {
    api_key: Option<String>,
    app_id: Option<String>,
    access_key: Option<String>,
}

fn parse_minimax_credential(
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

fn minimax_endpoint(
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

fn parse_doubao_credential(value: &str) -> Result<DoubaoCredential, CoreError> {
    let parsed = serde_json::from_str::<Value>(value).ok();
    if let Some(object) = parsed.as_ref().filter(|value| value.is_object()) {
        let credential = DoubaoCredential {
            api_key: json_string(object, &["apiKey", "api_key"]),
            app_id: json_string(object, &["appId", "app_id", "appid"]),
            access_key: json_string(object, &["accessKey", "access_key", "token"]),
        };
        if credential.api_key.is_some()
            || credential.app_id.is_some() && credential.access_key.is_some()
        {
            return Ok(credential);
        }
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "DOUBAO_CREDENTIAL_FORMAT",
        ));
    }
    if value.trim().is_empty() {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "DOUBAO_CREDENTIAL_FORMAT",
        ));
    }
    Ok(DoubaoCredential {
        api_key: Some(value.trim().to_owned()),
        app_id: None,
        access_key: None,
    })
}

fn json_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn parse_volcengine_credential(value: &str) -> Result<VolcengineCredential, CoreError> {
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

#[cfg(test)]
mod tests {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        task::JoinHandle,
    };

    use super::*;

    #[test]
    fn decodes_minimax_hex_audio() {
        let audio =
            decode_minimax_audio(br#"{"base_resp":{"status_code":0},"data":{"audio":"494433"}}"#)
                .unwrap();

        assert_eq!(audio, b"ID3");
    }

    #[tokio::test]
    async fn exposes_only_official_minimax_t2a_models() {
        let profile = profile(TtsProviderKind::MiniMax, "https://api.minimaxi.com/v1");
        let models = discover_models(&profile, None).await.unwrap();

        assert_eq!(
            models,
            [
                "speech-2.8-hd",
                "speech-2.8-turbo",
                "speech-2.6-hd",
                "speech-2.6-turbo",
                "speech-02-hd",
                "speech-02-turbo",
                "speech-01-hd",
                "speech-01-turbo",
            ]
        );
    }

    #[tokio::test]
    async fn discovers_native_models_and_voices_through_provider_contracts() {
        for kind in [
            TtsProviderKind::Volcengine,
            TtsProviderKind::Doubao,
            TtsProviderKind::FishAudio,
        ] {
            assert!(
                !discover_models(&profile(kind, "https://example.test"), None)
                    .await
                    .unwrap()
                    .is_empty()
            );
        }

        let (endpoint, model_server) = test_server(vec![http_response(
            "application/json",
            br#"[{"model_id":"z","can_do_text_to_speech":true},{"model_id":"a","can_do_text_to_speech":false},{"model_id":"a","can_do_text_to_speech":true}]"#,
        )])
        .await;
        let models = discover_models(
            &profile(TtsProviderKind::ElevenLabs, &endpoint),
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(models, ["a", "z"]);
        assert_eq!(model_server.await.unwrap().len(), 1);

        let (endpoint, voice_server) = test_server(vec![http_response(
            "application/json",
            br#"{"base_resp":{"status_code":0},"system_voice":[{"voice_id":"z"},{"voice_id":"a"}],"voice_cloning":[{"voice_id":"a"}]}"#,
        )])
        .await;
        let voices = discover_voices(&profile(TtsProviderKind::MiniMax, &endpoint), Some("key"))
            .await
            .unwrap();
        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(voice_server.await.unwrap().len(), 1);

        let (endpoint, voice_server) = test_server(vec![
            http_response(
                "application/json",
                br#"{"voices":[{"voice_id":"z"}],"has_more":true,"next_page_token":"next"}"#,
            ),
            http_response(
                "application/json",
                br#"{"voices":[{"voice_id":"a"}],"has_more":false}"#,
            ),
        ])
        .await;
        let voices = discover_voices(
            &profile(TtsProviderKind::ElevenLabs, &endpoint),
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(voice_server.await.unwrap().len(), 2);

        let (endpoint, voice_server) = test_server(vec![
            http_response(
                "application/json",
                br#"{"total":101,"items":[{"_id":"z","type":"tts"}],"has_more":null}"#,
            ),
            http_response(
                "application/json",
                br#"{"total":101,"items":[{"_id":"a","type":"tts"}],"has_more":null}"#,
            ),
        ])
        .await;
        let voices = discover_voices(&profile(TtsProviderKind::FishAudio, &endpoint), Some("key"))
            .await
            .unwrap();
        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(voice_server.await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn synthesizes_native_provider_audio_from_official_response_shapes() {
        let request = TtsSynthesisRequest {
            profile_id: "native".into(),
            text: "Hello".into(),
            language: Some("en-US".into()),
            voice_id: "voice".into(),
            instructions: None,
            speed: Some(1.2),
            pitch: None,
            accepted_mime_types: vec!["audio/mpeg".into()],
            cache_policy: crate::models::TtsCachePolicy::Bypass,
        };

        let (endpoint, server) = test_server(vec![http_response(
            "application/json",
            br#"{"base_resp":{"status_code":0},"data":{"audio":"494433"}}"#,
        )])
        .await;
        let audio = synthesize(
            &profile(TtsProviderKind::MiniMax, &endpoint),
            &request,
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);

        let (endpoint, server) = test_server(vec![http_response(
            "application/json",
            br#"{"code":3000,"data":"SUQz"}"#,
        )])
        .await;
        let audio = synthesize(
            &profile(TtsProviderKind::Volcengine, &endpoint),
            &request,
            Some(r#"{"appId":"app","token":"token"}"#),
        )
        .await
        .unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);

        let (endpoint, server) = test_server(vec![http_response(
            "application/json",
            br#"{"code":0,"data":"SUQz"}
{"code":20000000,"data":null}"#,
        )])
        .await;
        let audio = synthesize(
            &profile(TtsProviderKind::Doubao, &endpoint),
            &request,
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);

        let (endpoint, server) = test_server(vec![http_response("audio/mpeg", b"ID3")]).await;
        let mut eleven = profile(TtsProviderKind::ElevenLabs, &endpoint);
        eleven.model = Some("eleven_turbo_v2_5".into());
        let audio = synthesize(&eleven, &request, Some("key")).await.unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);

        let (endpoint, server) = test_server(vec![http_response("audio/mpeg", b"ID3")]).await;
        let audio = synthesize(
            &profile(TtsProviderKind::FishAudio, &endpoint),
            &request,
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn native_dispatch_rejects_missing_credentials_and_unsupported_discovery() {
        let request = TtsSynthesisRequest {
            profile_id: "native".into(),
            text: "Hello".into(),
            language: None,
            voice_id: "voice".into(),
            instructions: None,
            speed: None,
            pitch: None,
            accepted_mime_types: vec![],
            cache_policy: crate::models::TtsCachePolicy::Bypass,
        };
        let native = profile(TtsProviderKind::MiniMax, "https://example.test");
        assert!(synthesize(&native, &request, None).await.is_err());
        assert!(discover_voices(&native, None).await.is_err());

        let openai = profile(TtsProviderKind::OpenAiCompatible, "https://example.test");
        assert!(matches!(
            discover_voices(&openai, Some("key")).await,
            Err(CoreError::Tts {
                kind: TtsErrorKind::Configuration,
                ..
            })
        ));
        assert!(matches!(
            synthesize(&openai, &request, Some("key")).await,
            Err(CoreError::Tts {
                kind: TtsErrorKind::Configuration,
                ..
            })
        ));
    }

    #[test]
    fn rejects_invalid_native_responses_and_maps_all_formats() {
        assert!(decode_minimax_audio(br#"{"base_resp":{"status_code":1}}"#).is_err());
        assert!(decode_minimax_audio(br#"{"base_resp":{"status_code":0}}"#).is_err());
        assert!(decode_volcengine_v1_audio(br#"{"code":1,"data":""}"#).is_err());
        assert!(decode_volcengine_audio(br#"{"code":0,"data":"not-base64"}"#).is_err());
        assert!(decode_volcengine_audio(br#"{"code":0}"#).is_err());
        assert_eq!(volcengine_format(TtsAudioFormat::Opus), "ogg_opus");
        assert_eq!(volcengine_format(TtsAudioFormat::Wav), "wav");
        assert_eq!(volcengine_format(TtsAudioFormat::Flac), "mp3");
        assert_eq!(volcengine_v1_format(TtsAudioFormat::Wav), "wav");
        assert_eq!(volcengine_v1_format(TtsAudioFormat::Opus), "mp3");
        let mut unsupported = profile(TtsProviderKind::MiniMax, "https://example.test");
        unsupported.options.response_format = TtsAudioFormat::Aac;
        assert!(native_format(&unsupported).is_err());
    }

    fn profile(kind: TtsProviderKind, endpoint: &str) -> TtsProviderProfile {
        TtsProviderProfile {
            id: "native".into(),
            name: "Native".into(),
            kind,
            endpoint: endpoint.into(),
            model: Some("seed-tts-2.0".into()),
            credential_reference: None,
            options: crate::models::TtsProviderOptions {
                kind,
                response_format: TtsAudioFormat::Mp3,
                instructions: None,
                voices: vec!["voice".into()],
            },
            voice_names: Default::default(),
            revision: 1,
        }
    }

    #[test]
    fn parses_minimax_group_id_from_json_or_endpoint() {
        let minimax_profile = profile(TtsProviderKind::MiniMax, "https://api.minimaxi.com/v1");
        let credential =
            parse_minimax_credential(&minimax_profile, r#"{"apiKey":"key","groupId":"group"}"#)
                .unwrap();
        assert_eq!(credential.api_key, "key");
        assert_eq!(credential.group_id.as_deref(), Some("group"));

        let endpoint_profile = profile(
            TtsProviderKind::MiniMax,
            "https://api.minimaxi.com/v1?GroupId=query-group",
        );
        let credential = parse_minimax_credential(&endpoint_profile, "key").unwrap();
        assert_eq!(credential.group_id.as_deref(), Some("query-group"));
    }

    #[test]
    fn accepts_plain_minimax_api_keys_without_group_id() {
        let minimax_profile = profile(TtsProviderKind::MiniMax, "https://api.minimaxi.com/v1");
        let credential = parse_minimax_credential(&minimax_profile, "key").unwrap();
        assert_eq!(credential.api_key, "key");
        assert_eq!(credential.group_id, None);
    }

    #[test]
    fn does_not_append_empty_minimax_group_id() {
        let minimax_profile = profile(TtsProviderKind::MiniMax, "https://api.minimaxi.com/v1");
        let endpoint = minimax_endpoint(&minimax_profile, "/v1/t2a_v2", None).unwrap();
        assert_eq!(endpoint.query(), None);
    }

    #[test]
    fn supports_doubao_api_key_and_legacy_credentials() {
        let api_key = parse_doubao_credential(r#"{"api_key":"key"}"#).unwrap();
        assert_eq!(api_key.api_key.as_deref(), Some("key"));
        assert!(api_key.app_id.is_none());

        let legacy = parse_doubao_credential(r#"{"appId":"app","accessKey":"access"}"#).unwrap();
        assert_eq!(legacy.app_id.as_deref(), Some("app"));
        assert_eq!(legacy.access_key.as_deref(), Some("access"));
    }

    #[test]
    fn nests_doubao_context_texts_under_additions() {
        let mut profile = profile(TtsProviderKind::Doubao, "https://openspeech.bytedance.com");
        profile.options.instructions = Some("Speak calmly".into());
        let request = TtsSynthesisRequest {
            profile_id: profile.id.clone(),
            text: "Hello".into(),
            language: None,
            voice_id: "voice".into(),
            instructions: None,
            speed: Some(1.2),
            pitch: None,
            accepted_mime_types: vec![],
            cache_policy: crate::models::TtsCachePolicy::Bypass,
        };
        let body = doubao_request_body(&profile, &request, TtsAudioFormat::Mp3);
        let additions: Value = serde_json::from_str(
            body["req_params"]["additions"]
                .as_str()
                .expect("additions must be a JSON string"),
        )
        .unwrap();
        assert_eq!(additions["context_texts"][0], "Speak calmly");
        assert!(body["req_params"].get("context_texts").is_none());
    }

    #[test]
    fn accepts_volcengine_v1_success_code_3000() {
        let audio = decode_volcengine_v1_audio(br#"{"code":3000,"data":"SUQz"}"#).unwrap();

        assert_eq!(audio, b"ID3");
    }

    #[test]
    fn concatenates_volcengine_v3_base64_chunks() {
        let audio = decode_volcengine_audio(
            br#"{"code":0,"data":"SUQz"}
{"code":20000000,"data":"VFRZ"}"#,
        )
        .unwrap();

        assert_eq!(audio, b"ID3TTY");
    }

    #[test]
    fn skips_sse_event_lines_when_decoding_volcengine_audio() {
        let audio = decode_volcengine_audio(
            br#"event: 352
data: {"code":0,"data":"SUQz"}

event: 152
data: {"code":20000000,"data":null}"#,
        )
        .unwrap();

        assert_eq!(audio, b"ID3");
    }

    #[test]
    fn parses_and_deduplicates_elevenlabs_voices() {
        let voices = decode_eleven_voice_list(
            br#"{"voices":[{"voice_id":"z"},{"voice_id":"a","labels":{"gender":"female"}},{"voice_id":"a"}]}"#,
        )
        .unwrap();

        assert_eq!(voices.len(), 2);
        assert_eq!(voices[0].id, "a");
        assert_eq!(voices[0].gender.as_deref(), Some("female"));
        assert_eq!(voices[1].id, "z");
    }

    #[test]
    fn reads_elevenlabs_pagination_metadata() {
        let page = decode_eleven_voice_page(
            br#"{"voices":[{"voice_id":"a"}],"has_more":true,"next_page_token":"next"}"#,
        )
        .unwrap();

        assert!(page.has_more);
        assert_eq!(page.next_page_token.as_deref(), Some("next"));
        assert_eq!(page.voices[0].id, "a");
    }

    #[test]
    fn omits_elevenlabs_language_for_multilingual_v2() {
        assert_eq!(
            eleven_language_code(Some("zh-CN"), "eleven_multilingual_v2"),
            None
        );
        assert_eq!(
            eleven_language_code(Some("zh-CN"), "eleven_turbo_v2_5").as_deref(),
            Some("zh")
        );
    }

    #[test]
    fn parses_and_deduplicates_fish_audio_voices() {
        let voices =
            decode_fish_voice_list(br#"{"items":[{"_id":"z"},{"_id":"a"},{"_id":"a"}]}"#).unwrap();

        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
    }

    #[test]
    fn filters_fish_audio_service_models_from_voice_catalog() {
        let page = decode_fish_voice_page(
            br#"{"items":[{"_id":"svc","type":"svc"},{"_id":"tts","type":"tts","languages":["zh"]}],"has_more":false}"#,
            1,
        )
        .unwrap();

        assert!(!page.has_more);
        assert_eq!(page.voices.len(), 1);
        assert_eq!(page.voices[0].id, "tts");
        assert_eq!(page.voices[0].language, "zh");
    }

    #[test]
    fn infers_fish_audio_pagination_when_has_more_is_null() {
        let first = decode_fish_voice_page(
            br#"{"total":101,"items":[{"_id":"first"}],"has_more":null}"#,
            1,
        )
        .unwrap();
        let second = decode_fish_voice_page(
            br#"{"total":101,"items":[{"_id":"last"}],"has_more":null}"#,
            2,
        )
        .unwrap();

        assert!(first.has_more);
        assert!(!second.has_more);
    }

    #[test]
    fn preserves_custom_endpoint_path_prefixes() {
        let profile = TtsProviderProfile {
            id: "fish".into(),
            name: "Fish".into(),
            kind: TtsProviderKind::FishAudio,
            endpoint: "https://proxy.example/tts/v1".into(),
            model: Some("s2.1-pro-free".into()),
            credential_reference: None,
            options: crate::models::TtsProviderOptions {
                kind: TtsProviderKind::FishAudio,
                response_format: TtsAudioFormat::Mp3,
                instructions: None,
                voices: vec!["voice".into()],
            },
            voice_names: Default::default(),
            revision: 1,
        };

        assert_eq!(
            provider_url(&profile, "/v1/tts").unwrap().path(),
            "/tts/v1/tts"
        );

        let mut proxy_profile = profile;
        proxy_profile.endpoint = "https://proxy.example/speech/api/v3".into();
        assert_eq!(
            provider_url(&proxy_profile, "/api/v3/tts/unidirectional")
                .unwrap()
                .path(),
            "/speech/api/v3/tts/unidirectional"
        );
        proxy_profile.endpoint = "https://proxy.example".into();
        assert_eq!(
            provider_url(&proxy_profile, "/v1/tts").unwrap().path(),
            "/v1/tts"
        );
        proxy_profile.endpoint = "https://proxy.example/v1/tts".into();
        assert_eq!(
            provider_url(&proxy_profile, "/v1/tts").unwrap().path(),
            "/v1/tts"
        );
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

    fn http_response(content_type: &str, body: &[u8]) -> Vec<u8> {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes()
        .into_iter()
        .chain(body.iter().copied())
        .collect()
    }
}
