use crate::TtsErrorKind;
use std::time::Duration;

use reqwest::{Client, Response, StatusCode};

use crate::{
    models::{
        TtsAudioFormat, TtsProviderCapabilities, TtsProviderProfile, TtsSynthesisRequest, TtsVoice,
    },
    CoreError,
};

pub(crate) mod providers;
pub(crate) mod qwen;

const MAX_AUDIO_BYTES: u64 = 32 * 1024 * 1024;
pub(crate) const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
pub(crate) const SYNTHESIS_TIMEOUT: Duration = Duration::from_secs(120);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

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
    providers::capabilities(profile)
}

pub(crate) fn synthesis_rate_range(profile: &TtsProviderProfile) -> Option<(f64, f64)> {
    providers::synthesis_rate_range(profile)
}

pub(crate) fn validate_profile(profile: &TtsProviderProfile) -> Result<(), CoreError> {
    providers::validate_profile(profile)
}

pub(crate) fn normalize_profile_options(profile: &mut TtsProviderProfile) -> Result<(), CoreError> {
    providers::normalize_profile_options(profile)
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
    providers::synthesize(profile, request, credential).await
}

pub(crate) async fn discover_models(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    providers::discover_models(profile, credential).await
}

pub(crate) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<TtsVoice>, CoreError> {
    providers::discover_voices(profile, credential).await
}

pub(crate) async fn audio_response(
    response: Response,
    expected_format: Option<TtsAudioFormat>,
    credential: Option<&str>,
) -> Result<SynthesizedAudio, CoreError> {
    let response = successful(response, credential).await?;
    let bytes = response_bytes(response, "TTS_AUDIO_TOO_LARGE").await?;
    audio_from_bytes(bytes, expected_format)
}

pub(crate) fn audio_from_bytes(
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

pub(crate) async fn response_bytes(
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

pub(crate) async fn successful(
    response: Response,
    credential: Option<&str>,
) -> Result<Response, CoreError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }

    let request_id = response
        .headers()
        .get("x-request-id")
        .or_else(|| response.headers().get("x-dashscope-request-id"))
        .or_else(|| response.headers().get("x-tt-logid"))
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

pub(crate) fn client(timeout: Duration) -> Result<Client, CoreError> {
    super::http::client_builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("MyReader/0.12.0")
        .build()
        .map_err(map_reqwest_error)
}

fn configured_voices(profile: &TtsProviderProfile) -> Vec<TtsVoice> {
    profile
        .options
        .voices()
        .iter()
        .map(|id| TtsVoice {
            id: id.clone(),
            name: profile.voice_names.get(id).cloned(),
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

pub(crate) fn map_reqwest_error(error: reqwest::Error) -> CoreError {
    if error.is_timeout() {
        tts_error(TtsErrorKind::Timeout, "TTS_REQUEST_TIMEOUT")
    } else if error.is_connect() {
        tts_error(TtsErrorKind::Unavailable, "TTS_PROVIDER_UNAVAILABLE")
    } else {
        tts_error(TtsErrorKind::Network, "TTS_NETWORK_ERROR")
    }
}

pub(crate) fn tts_error(kind: TtsErrorKind, code: &str) -> CoreError {
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
