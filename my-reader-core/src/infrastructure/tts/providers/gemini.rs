//! Google Gemini TTS (`generateContent` AUDIO modality) adapter with PCM-to-WAV framing.

use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};

use super::{
    audio_from_bytes, client,
    encoding::{decode_base64, encode_wav_pcm16},
    map_reqwest_error, provider_url, response_bytes, sniff_audio, successful, tts_error,
    SynthesizedAudio, REQUEST_TIMEOUT, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

const KNOWN_MODELS: &[&str] = &[
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-3.1-flash-tts-preview",
];

// Official Gemini Developer API prebuilt studio voices (30 voices).
const PREBUILT_VOICES: &[(&str, &str)] = &[
    ("Zephyr", "female"),
    ("Puck", "male"),
    ("Charon", "male"),
    ("Kore", "female"),
    ("Fenrir", "male"),
    ("Leda", "female"),
    ("Orus", "male"),
    ("Aoede", "female"),
    ("Callirrhoe", "female"),
    ("Autonoe", "female"),
    ("Enceladus", "male"),
    ("Iapetus", "male"),
    ("Umbriel", "male"),
    ("Algieba", "male"),
    ("Despina", "female"),
    ("Erinome", "female"),
    ("Algenib", "male"),
    ("Rasalgethi", "male"),
    ("Laomedeia", "female"),
    ("Achernar", "female"),
    ("Alnilam", "male"),
    ("Schedar", "male"),
    ("Gacrux", "female"),
    ("Pulcherrima", "female"),
    ("Achird", "male"),
    ("Zubenelgenubi", "male"),
    ("Vindemiatrix", "female"),
    ("Sadachbia", "male"),
    ("Sadaltager", "male"),
    ("Sulafat", "female"),
];

pub(super) const SUPPORTED_FORMATS: &[TtsAudioFormat] = &[TtsAudioFormat::Wav];

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = profile.options.response_format;
    if !SUPPORTED_FORMATS.contains(&format) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "GEMINI_AUDIO_FORMAT_UNSUPPORTED",
        ));
    }
    let model = profile
        .model
        .as_deref()
        .unwrap_or("gemini-2.5-flash-preview-tts")
        .trim_start_matches("models/");
    let endpoint = provider_url(
        profile,
        &format!("/v1beta/models/{model}:generateContent"),
        &["/v1beta/models", "/v1beta"],
    )?;
    let prompt = match request
        .instructions
        .as_deref()
        .or(profile.options.instructions.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(instructions) => format!("{instructions}:\n{}", request.text),
        None => request.text.clone(),
    };
    let body = json!({
        "contents": [{
            "parts": [{ "text": prompt }]
        }],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": request.voice_id
                    }
                }
            }
        }
    });
    let response = client(SYNTHESIS_TIMEOUT)?
        .post(endpoint)
        .header("x-goog-api-key", credential)
        .header(CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(credential)).await?;
    let bytes = response_bytes(response, "TTS_AUDIO_TOO_LARGE").await?;
    let wav = decode_inline_audio(&bytes)?;
    audio_from_bytes(wav, Some(TtsAudioFormat::Wav))
}

pub(super) async fn discover_models(
    profile: &TtsProviderProfile,
    credential: &str,
) -> Result<Vec<String>, CoreError> {
    let mut endpoint = provider_url(profile, "/v1beta/models", &["/v1beta/models", "/v1beta"])?;
    endpoint.query_pairs_mut().append_pair("pageSize", "100");
    let response = client(REQUEST_TIMEOUT)?
        .get(endpoint)
        .header("x-goog-api-key", credential)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let response = successful(response, Some(credential)).await?;
    let bytes = response_bytes(response, "TTS_MODEL_LIST_TOO_LARGE").await?;
    let body: Value = serde_json::from_slice(&bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "GEMINI_INVALID_MODEL_LIST"))?;
    let mut ids: Vec<String> = body
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.get("name").and_then(Value::as_str))
        .map(|name| name.trim_start_matches("models/"))
        .filter(|id| id.contains("-tts"))
        .map(str::to_owned)
        .collect();
    if ids.is_empty() {
        ids = KNOWN_MODELS.iter().map(|id| (*id).into()).collect();
    }
    ids.sort();
    ids.dedup();
    Ok(ids)
}

pub(super) fn discover_voices() -> Vec<TtsVoice> {
    PREBUILT_VOICES
        .iter()
        .map(|(id, gender)| TtsVoice {
            id: (*id).into(),
            name: None,
            language: "mul".into(),
            gender: Some((*gender).into()),
        })
        .collect()
}

fn decode_inline_audio(bytes: &[u8]) -> Result<Vec<u8>, CoreError> {
    let body: Value = serde_json::from_slice(bytes)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "GEMINI_INVALID_RESPONSE"))?;
    let parts = body
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "GEMINI_AUDIO_MISSING"))?;
    let inline = parts
        .iter()
        .find_map(|part| part.get("inlineData").or_else(|| part.get("inline_data")))
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "GEMINI_AUDIO_MISSING"))?;
    let encoded = inline
        .get("data")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "GEMINI_AUDIO_MISSING"))?;
    let decoded = decode_base64(encoded)
        .map_err(|_| tts_error(TtsErrorKind::InvalidAudio, "GEMINI_AUDIO_INVALID"))?;
    if sniff_audio(&decoded).is_some() {
        return Ok(decoded);
    }
    let mime = inline
        .get("mimeType")
        .or_else(|| inline.get("mime_type"))
        .and_then(Value::as_str)
        .unwrap_or("audio/L16;codec=pcm;rate=24000");
    let (sample_rate, channels) = parse_pcm_params(mime);
    Ok(encode_wav_pcm16(&decoded, sample_rate, channels))
}

fn parse_pcm_params(mime: &str) -> (u32, u16) {
    let mut sample_rate = 24_000_u32;
    let mut channels = 1_u16;
    for part in mime.split(';').skip(1) {
        if let Some((key, value)) = part.split_once('=') {
            let key = key.trim();
            let value = value.trim();
            if key.eq_ignore_ascii_case("rate") {
                if let Ok(parsed) = value.parse::<u32>() {
                    if (8_000..=192_000).contains(&parsed) {
                        sample_rate = parsed;
                    }
                }
            } else if key.eq_ignore_ascii_case("channels") {
                if let Ok(parsed) = value.parse::<u16>() {
                    if (1..=2).contains(&parsed) {
                        channels = parsed;
                    }
                }
            }
        }
    }
    (sample_rate, channels)
}
