use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};

use super::{
    audio_format, audio_response, client, map_reqwest_error, provider_url, response_bytes,
    sort_deduplicate_voices, successful, tts_error, SynthesizedAudio, REQUEST_TIMEOUT,
    SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = audio_format(profile)?;
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
    if let Some(language) = language_code(request.language.as_deref(), model) {
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

pub(super) async fn discover_models(
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

pub(super) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<TtsVoice>, CoreError> {
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
        let page = decode_voice_page(&bytes)?;
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

#[cfg(test)]
pub(super) fn decode_voice_list(bytes: &[u8]) -> Result<Vec<TtsVoice>, CoreError> {
    let mut voices = decode_voice_page(bytes)?.voices;
    sort_deduplicate_voices(&mut voices);
    Ok(voices)
}

pub(super) struct VoicePage {
    pub(super) voices: Vec<TtsVoice>,
    pub(super) has_more: bool,
    pub(super) next_page_token: Option<String>,
}

pub(super) fn decode_voice_page(bytes: &[u8]) -> Result<VoicePage, CoreError> {
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
        .map(|items| VoicePage {
            voices: items
                .iter()
                .filter_map(|item| {
                    let id = item.get("voice_id").and_then(Value::as_str)?;
                    (!id.trim().is_empty()).then(|| TtsVoice {
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

pub(super) fn language_code(language: Option<&str>, model: &str) -> Option<String> {
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
