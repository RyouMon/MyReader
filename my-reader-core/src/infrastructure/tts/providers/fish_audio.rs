//! Fish Audio `/v1/tts` synthesis and bounded `/model` voice catalog discovery.

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};

use super::{
    audio_response, client, json_string, map_reqwest_error, provider_url, response_bytes,
    sort_deduplicate_voices, successful, tts_error, SynthesizedAudio, REQUEST_TIMEOUT,
    SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

const FISH_AUDIO_MODELS: &[&str] = &["s2.1-pro-free", "s2.1-pro", "s2-pro", "s1"];
const MAX_SELF_PAGES: usize = 5;

pub(super) const SUPPORTED_FORMATS: &[TtsAudioFormat] = &[
    TtsAudioFormat::Mp3,
    TtsAudioFormat::Opus,
    TtsAudioFormat::Wav,
];

pub(super) fn models() -> Vec<String> {
    FISH_AUDIO_MODELS.iter().map(|id| (*id).into()).collect()
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
            "FISH_AUDIO_FORMAT_UNSUPPORTED",
        ));
    }
    let endpoint = provider_url(profile, "/v1/tts", &["/v1/tts", "/model"])?;
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

pub(super) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<TtsVoice>, CoreError> {
    let http = client(REQUEST_TIMEOUT)?;
    let mut voices = fetch_self_voices(&http, profile, credential).await?;
    // Populate popular community voices when the user's own workspace has few models so a newly
    // registered account can select and audition voices immediately without cloning first.
    if voices.len() < 10 {
        let popular = fetch_model_page(&http, profile, credential, false, 50, 1).await?;
        voices.extend(popular.voices);
    }
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}

async fn fetch_self_voices(
    http: &reqwest::Client,
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<TtsVoice>, CoreError> {
    let mut voices = Vec::new();
    for page_number in 1..=MAX_SELF_PAGES {
        let page = fetch_model_page(http, profile, credential, true, 100, page_number).await?;
        voices.extend(page.voices);
        if !page.has_more {
            break;
        }
    }
    Ok(voices)
}

struct ModelPage {
    voices: Vec<TtsVoice>,
    has_more: bool,
}

async fn fetch_model_page(
    http: &reqwest::Client,
    profile: &TtsProviderProfile,
    credential: &str,
    self_only: bool,
    page_size: usize,
    page_number: usize,
) -> Result<ModelPage, CoreError> {
    let mut endpoint = provider_url(profile, "/model", &["/v1/tts", "/model"])?;
    {
        let mut query = endpoint.query_pairs_mut();
        query
            .append_pair("page_size", &page_size.to_string())
            .append_pair("page_number", &page_number.to_string());
        if self_only {
            query.append_pair("self", "true");
        } else {
            query.append_pair("sort_by", "task_count");
        }
    }
    let response = http
        .get(endpoint)
        .header(AUTHORIZATION, format!("Bearer {credential}"))
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(credential)).await?;
    let bytes = response_bytes(response, "TTS_VOICE_LIST_TOO_LARGE").await?;
    decode_model_page(&bytes, page_size, page_number)
}

fn decode_model_page(
    bytes: &[u8],
    page_size: usize,
    page_number: usize,
) -> Result<ModelPage, CoreError> {
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
    let mut voices = Vec::with_capacity(items.len());
    for item in items {
        let Some(id) = json_string(item, &["_id", "id"]) else {
            continue;
        };
        let name = json_string(item, &["title", "name"]).filter(|value| value != &id);
        let language = item
            .get("languages")
            .and_then(Value::as_array)
            .and_then(|languages| languages.first())
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("mul")
            .to_owned();
        voices.push(TtsVoice {
            id,
            name,
            language,
            gender: None,
        });
    }
    let total = body
        .get("total")
        .and_then(Value::as_u64)
        .map(|value| value as usize);
    let has_more = !items.is_empty()
        && items.len() >= page_size
        && total.is_none_or(|total| page_number.saturating_mul(page_size) < total);
    Ok(ModelPage { voices, has_more })
}
