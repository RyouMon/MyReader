use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};

use super::{
    audio_format, audio_response, client, map_reqwest_error, provider_url, response_bytes,
    sort_deduplicate_voices, successful, tts_error, SynthesizedAudio, REQUEST_TIMEOUT,
    SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

const FISH_AUDIO_MODELS: &[&str] = &[
    "s1",
    "s2-pro",
    "s2.1-pro",
    "s2.1-pro-free",
    "drama-3",
    "s3-pro",
];

pub(super) fn models() -> Vec<String> {
    FISH_AUDIO_MODELS.iter().map(|id| (*id).into()).collect()
}

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = audio_format(profile)?;
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

pub(super) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<TtsVoice>, CoreError> {
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
        let page = decode_voice_page(&bytes, page_number)?;
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
pub(super) fn decode_voice_list(bytes: &[u8]) -> Result<Vec<TtsVoice>, CoreError> {
    let mut voices = decode_voice_page(bytes, 1)?.voices;
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}

pub(super) struct VoicePage {
    pub(super) voices: Vec<TtsVoice>,
    pub(super) has_more: bool,
}

pub(super) fn decode_voice_page(bytes: &[u8], page_number: u64) -> Result<VoicePage, CoreError> {
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
            (!id.trim().is_empty()).then(|| TtsVoice {
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
    Ok(VoicePage { voices, has_more })
}
