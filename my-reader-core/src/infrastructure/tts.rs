use crate::TtsErrorKind;
use std::time::Duration;

use reqwest::{
    header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
    Client, Response, StatusCode,
};
use serde_json::json;
use url::Url;

use crate::{
    models::{
        TtsAudioFormat, TtsProviderCapabilities, TtsProviderKind, TtsProviderOptions,
        TtsProviderProfile, TtsSynthesisRequest, TtsVoice,
    },
    CoreError,
};

pub(crate) mod qwen;

const MAX_AUDIO_BYTES: u64 = 32 * 1024 * 1024;
pub(crate) const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

pub(crate) struct SynthesizedAudio {
    pub bytes: Vec<u8>,
    pub mime_type: String,
    pub extension: &'static str,
}

pub(crate) async fn probe(
    profile: &TtsProviderProfile,
    _credential: Option<&str>,
) -> Result<TtsProviderCapabilities, CoreError> {
    Ok(capabilities(profile))
}

pub(crate) fn capabilities(profile: &TtsProviderProfile) -> TtsProviderCapabilities {
    match profile.kind {
        TtsProviderKind::OpenAiCompatible => TtsProviderCapabilities {
            voice_discovery: false,
            preview: true,
            plain_text: true,
            ssml: false,
            streaming: false,
            word_timings: false,
            synthesis_rate: true,
            synthesis_pitch: false,
            max_input_chars: Some(4096),
            output_mime_types: vec![
                "audio/mpeg".into(),
                "audio/ogg".into(),
                "audio/aac".into(),
                "audio/flac".into(),
                "audio/wav".into(),
            ],
        },
        TtsProviderKind::Qwen => {
            let audio = qwen::is_audio_model(profile.model.as_deref().unwrap_or_default());
            TtsProviderCapabilities {
                voice_discovery: qwen::model(
                    profile.model.as_deref().unwrap_or_default(),
                    &profile.endpoint,
                )
                .is_ok_and(|model| model.voice_discovery),
                preview: true,
                plain_text: true,
                ssml: false,
                streaming: false,
                word_timings: false,
                synthesis_rate: audio,
                synthesis_pitch: audio,
                max_input_chars: if audio { None } else { Some(600) },
                output_mime_types: if audio {
                    vec!["audio/mpeg".into(), "audio/wav".into(), "audio/ogg".into()]
                } else {
                    vec!["audio/wav".into()]
                },
            }
        }
    }
}

pub(crate) async fn list_voices(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<TtsVoice>, CoreError> {
    // Playback uses the user's saved selection. Refreshing the catalog is an
    // explicit settings action and must not restore voices the user removed.
    let _ = credential;
    Ok(configured_voices(profile))
}

pub(crate) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: Option<&str>,
) -> Result<SynthesizedAudio, CoreError> {
    match profile.kind {
        TtsProviderKind::OpenAiCompatible => synthesize_openai(profile, request, credential).await,
        TtsProviderKind::Qwen => qwen::synthesize(profile, request, credential).await,
    }
}

pub(crate) async fn discover_models(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    if profile.kind == TtsProviderKind::Qwen {
        return Ok(qwen::discover_models(&profile.endpoint, credential)
            .await?
            .into_iter()
            .map(|m| m.id)
            .collect());
    }
    let mut url = openai_speech_endpoint(profile)?;
    let path = url.path().trim_end_matches("/audio/speech");
    url.set_path(&format!("{path}/models"));
    let mut request = client()?.get(url);
    if let Some(credential) = credential.filter(|v| !v.trim().is_empty()) {
        request = request.bearer_auth(credential);
    }
    let response = successful(request.send().await.map_err(map_reqwest_error)?, credential).await?;
    let bytes = response_bytes(response, "TTS_MODEL_LIST_TOO_LARGE").await?;
    let body: serde_json::Value = serde_json::from_slice(&bytes)
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

async fn synthesize_openai(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: Option<&str>,
) -> Result<SynthesizedAudio, CoreError> {
    let TtsProviderOptions::OpenAiCompatible {
        response_format,
        instructions,
        ..
    } = &profile.options
    else {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_PROVIDER_OPTIONS_MISMATCH",
        ));
    };
    let credential = credential
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))?;
    let model = profile.model.as_deref().unwrap_or("gpt-4o-mini-tts");
    let mut body = json!({
        "model": model,
        "voice": request.voice_id,
        "input": request.text,
        "response_format": response_format.as_str(),
    });
    if let Some(speed) = request.speed {
        body["speed"] = json!(speed);
    }
    if let Some(instructions) = request
        .instructions
        .as_deref()
        .or(instructions.as_deref())
        .filter(|value| !value.is_empty())
    {
        body["instructions"] = json!(instructions);
    }

    let response = client()?
        .post(openai_speech_endpoint(profile)?)
        .header(AUTHORIZATION, format!("Bearer {credential}"))
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, response_format.mime_type())
        .body(serde_json::to_vec(&body)?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    audio_response(response, Some(*response_format), Some(credential)).await
}

async fn audio_response(
    response: Response,
    expected_format: Option<TtsAudioFormat>,
    credential: Option<&str>,
) -> Result<SynthesizedAudio, CoreError> {
    let response = successful(response, credential).await?;
    let bytes = response_bytes(response, "TTS_AUDIO_TOO_LARGE").await?;
    audio_from_bytes(bytes, expected_format)
}

fn audio_from_bytes(
    bytes: Vec<u8>,
    expected_format: Option<TtsAudioFormat>,
) -> Result<SynthesizedAudio, CoreError> {
    let (sniffed_mime, extension) = sniff_audio(&bytes)
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidAudio, "INVALID_TTS_AUDIO"))?;
    if expected_format.is_some_and(|format| format.mime_type() != sniffed_mime) {
        return Err(tts_error(
            TtsErrorKind::InvalidAudio,
            "UNEXPECTED_TTS_AUDIO_FORMAT",
        ));
    }

    Ok(SynthesizedAudio {
        bytes,
        mime_type: sniffed_mime.into(),
        extension,
    })
}

async fn response_bytes(
    mut response: Response,
    too_large_code: &str,
) -> Result<Vec<u8>, CoreError> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_AUDIO_BYTES)
    {
        return Err(tts_error(TtsErrorKind::PayloadTooLarge, too_large_code));
    }
    let mut bytes = Vec::with_capacity(
        response
            .content_length()
            .unwrap_or_default()
            .min(MAX_AUDIO_BYTES) as usize,
    );
    while let Some(chunk) = response.chunk().await.map_err(map_reqwest_error)? {
        if bytes.len().saturating_add(chunk.len()) as u64 > MAX_AUDIO_BYTES {
            return Err(tts_error(TtsErrorKind::PayloadTooLarge, too_large_code));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn successful(response: Response, credential: Option<&str>) -> Result<Response, CoreError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }

    let request_id = response
        .headers()
        .get("x-request-id")
        .or_else(|| response.headers().get("x-dashscope-request-id"))
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let bytes = response_bytes(response, "TTS_ERROR_RESPONSE_TOO_LARGE").await?;
    Err(tts_error(
        http_error_kind(status),
        &format!(
            "HTTP_{} (request_id={}): {}",
            status.as_u16(),
            request_id,
            redact_credential(&String::from_utf8_lossy(&bytes), credential)
        ),
    ))
}

fn http_error_kind(status: StatusCode) -> TtsErrorKind {
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => TtsErrorKind::Unauthorized,
        StatusCode::TOO_MANY_REQUESTS => TtsErrorKind::RateLimited,
        StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT => TtsErrorKind::Timeout,
        StatusCode::PAYLOAD_TOO_LARGE => TtsErrorKind::PayloadTooLarge,
        status if status.is_server_error() => TtsErrorKind::Unavailable,
        _ => TtsErrorKind::InvalidRequest,
    }
}

fn redact_credential(message: &str, credential: Option<&str>) -> String {
    match credential.filter(|value| !value.is_empty()) {
        Some(credential) => message.replace(credential, "[credential]"),
        None => message.to_owned(),
    }
}

fn client() -> Result<Client, CoreError> {
    super::http::client_builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("MyReader/0.12.0")
        .build()
        .map_err(map_reqwest_error)
}

fn openai_speech_endpoint(profile: &TtsProviderProfile) -> Result<Url, CoreError> {
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

fn configured_voices(profile: &TtsProviderProfile) -> Vec<TtsVoice> {
    let voices = profile.options.voices();
    let default_voice = profile.options.default_voice();
    let mut ordered_ids = Vec::new();
    if let Some(default_voice) =
        default_voice.filter(|default_voice| voices.iter().any(|voice| voice == default_voice))
    {
        ordered_ids.push(default_voice);
    }
    for voice in voices {
        if !ordered_ids.iter().any(|existing| existing == voice) {
            ordered_ids.push(voice);
        }
    }
    ordered_ids
        .into_iter()
        .map(|id| TtsVoice {
            id: id.to_owned(),
            language: "mul".into(),
            gender: None,
        })
        .collect()
}

pub(crate) fn sniff_audio(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(b"ID3")
        || bytes.get(0..2).is_some_and(|prefix| {
            prefix[0] == 0xff && prefix[1] & 0xe0 == 0xe0 && prefix[1] & 0x06 != 0
        })
    {
        Some(("audio/mpeg", "mp3"))
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE") {
        Some(("audio/wav", "wav"))
    } else if bytes.starts_with(b"OggS") {
        Some(("audio/ogg", "ogg"))
    } else if bytes.starts_with(b"fLaC") {
        Some(("audio/flac", "flac"))
    } else if bytes.get(4..8) == Some(b"ftyp") {
        Some(("audio/mp4", "m4a"))
    } else if bytes
        .get(0..2)
        .is_some_and(|prefix| prefix[0] == 0xff && prefix[1] & 0xf6 == 0xf0)
    {
        Some(("audio/aac", "aac"))
    } else {
        None
    }
}

fn map_reqwest_error(error: reqwest::Error) -> CoreError {
    if error.is_timeout() {
        tts_error(TtsErrorKind::Timeout, "TTS_REQUEST_TIMEOUT")
    } else if error.is_connect() {
        tts_error(TtsErrorKind::Unavailable, "TTS_PROVIDER_UNAVAILABLE")
    } else {
        tts_error(TtsErrorKind::Network, "TTS_NETWORK_ERROR")
    }
}

fn tts_error(kind: TtsErrorKind, code: &str) -> CoreError {
    CoreError::Tts {
        kind,
        message: code.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::sniff_audio;

    #[test]
    fn should_recognize_supported_audio_containers() {
        assert_eq!(sniff_audio(b"ID3\x04\x00\x00"), Some(("audio/mpeg", "mp3")));
        assert_eq!(
            sniff_audio(b"RIFF\x10\x00\x00\x00WAVEfmt "),
            Some(("audio/wav", "wav"))
        );
        assert_eq!(sniff_audio(b"not audio"), None);
    }
}
