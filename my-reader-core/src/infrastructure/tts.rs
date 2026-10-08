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
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

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
            let audio = profile.model.as_deref() == Some(qwen::DEFAULT_MODEL);
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
    let mut voices = configured_voices(profile);
    if profile.kind == TtsProviderKind::Qwen {
        let model = qwen::model(
            profile.model.as_deref().unwrap_or_default(),
            &profile.endpoint,
        )?;
        for voice in &mut voices {
            if let Some(builtin) = model.voices.iter().find(|builtin| builtin.id == voice.id) {
                *voice = builtin.clone();
            }
        }
        if let Ok(discovered) =
            qwen::discover_voices(&profile.endpoint, &model.id, credential).await
        {
            for voice in discovered {
                if !voices.iter().any(|existing| existing.id == voice.id) {
                    voices.push(voice);
                }
            }
        }
    }
    Ok(voices)
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
        return Err(tts_error("configuration", "TTS_PROVIDER_OPTIONS_MISMATCH"));
    };
    let credential = credential
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error("unauthorized", "TTS_CREDENTIAL_REQUIRED"))?;
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
    if let Some(instructions) = instructions.as_deref().filter(|value| !value.is_empty()) {
        body["instructions"] = json!(instructions);
    }

    let response = client()?
        .post(openai_speech_endpoint(profile)?)
        .header(AUTHORIZATION, format!("Bearer {credential}"))
        .header(CONTENT_TYPE, "application/json")
        .header(ACCEPT, response_format.mime_type())
        .body(serde_json::to_vec(&body)?)
        .send()
        .await?;
    audio_response(response, Some(*response_format)).await
}

async fn audio_response(
    response: Response,
    expected_format: Option<TtsAudioFormat>,
) -> Result<SynthesizedAudio, CoreError> {
    let response = successful(response).await?;
    let bytes = response_bytes(response, "TTS_AUDIO_TOO_LARGE").await?;
    audio_from_bytes(bytes, expected_format)
}

fn audio_from_bytes(
    bytes: Vec<u8>,
    expected_format: Option<TtsAudioFormat>,
) -> Result<SynthesizedAudio, CoreError> {
    let (sniffed_mime, extension) =
        sniff_audio(&bytes).ok_or_else(|| tts_error("invalid_audio", "INVALID_TTS_AUDIO"))?;
    if expected_format.is_some_and(|format| format.mime_type() != sniffed_mime) {
        return Err(tts_error("invalid_audio", "UNEXPECTED_TTS_AUDIO_FORMAT"));
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
        return Err(tts_error("payload_too_large", too_large_code));
    }
    let mut bytes = Vec::with_capacity(
        response
            .content_length()
            .unwrap_or_default()
            .min(MAX_AUDIO_BYTES) as usize,
    );
    while let Some(chunk) = response.chunk().await.map_err(map_reqwest_error)? {
        if bytes.len().saturating_add(chunk.len()) as u64 > MAX_AUDIO_BYTES {
            return Err(tts_error("payload_too_large", too_large_code));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn successful(response: Response) -> Result<Response, CoreError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }

    let kind = match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => "unauthorized",
        StatusCode::TOO_MANY_REQUESTS => "rate_limited",
        StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT => "timeout",
        StatusCode::PAYLOAD_TOO_LARGE => "payload_too_large",
        status if status.is_server_error() => "unavailable",
        _ => "invalid_request",
    };
    Err(tts_error(kind, &format!("HTTP_{}", status.as_u16())))
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
        .map_err(|_| tts_error("configuration", "INVALID_TTS_ENDPOINT"))?;
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
            name: id.to_owned(),
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
        tts_error("timeout", "TTS_REQUEST_TIMEOUT")
    } else if error.is_connect() {
        tts_error("unavailable", "TTS_PROVIDER_UNAVAILABLE")
    } else {
        tts_error("network", "TTS_NETWORK_ERROR")
    }
}

impl From<reqwest::Error> for CoreError {
    fn from(error: reqwest::Error) -> Self {
        map_reqwest_error(error)
    }
}

fn tts_error(kind: &str, code: &str) -> CoreError {
    CoreError::Tts(format!("{kind}:{code}"))
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
