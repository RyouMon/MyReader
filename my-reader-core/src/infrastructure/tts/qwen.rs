use super::map_reqwest_error;
use crate::TtsErrorKind;
use crate::{
    models::{
        QwenTtsModel, TtsAudioFormat, TtsProviderOptions, TtsProviderProfile, TtsSynthesisRequest,
        TtsVoice,
    },
    CoreError,
};
use serde_json::{json, Value};
use url::Url;

use super::{
    audio_response, client, response_bytes, tts_error, SynthesizedAudio, REQUEST_TIMEOUT,
    SYNTHESIS_TIMEOUT,
};

mod catalog;
mod websocket;
pub(crate) use catalog::discover_models;

pub(crate) fn is_audio_model(id: &str) -> bool {
    id.starts_with("qwen-audio-") && id.contains("-tts-")
}

pub(crate) fn model(id: &str, endpoint: &str) -> Result<QwenTtsModel, CoreError> {
    let audio = is_audio_model(id);
    let multimodal = id.starts_with("qwen3-tts-") && !id.contains("realtime");
    if !audio && (!multimodal || uses_websocket(endpoint)) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            &format!("QWEN_MODEL_UNSUPPORTED: {id}"),
        ));
    }
    Ok(QwenTtsModel {
        id: id.into(),
        supports_instructions: audio || id.contains("-instruct-"),
        voice_discovery: !uses_websocket(endpoint),
        audio_formats: if audio {
            vec![
                TtsAudioFormat::Mp3,
                TtsAudioFormat::Wav,
                TtsAudioFormat::Opus,
            ]
        } else {
            vec![TtsAudioFormat::Wav]
        },
        voices: vec![],
    })
}

fn voice(id: &str, language: &str) -> TtsVoice {
    TtsVoice {
        id: id.into(),
        language: language.into(),
        gender: None,
    }
}

pub(crate) fn validate_profile(profile: &TtsProviderProfile) -> Result<(), CoreError> {
    let selected = model(
        profile.model.as_deref().unwrap_or_default(),
        &profile.endpoint,
    )?;
    let TtsProviderOptions::Qwen {
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
    if !selected.audio_formats.contains(response_format) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "QWEN_AUDIO_FORMAT_UNSUPPORTED",
        ));
    }
    if instructions
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty())
        && !selected.supports_instructions
    {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "QWEN_INSTRUCTIONS_UNSUPPORTED",
        ));
    }
    Ok(())
}

pub(crate) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: Option<&str>,
) -> Result<SynthesizedAudio, CoreError> {
    model(
        profile.model.as_deref().unwrap_or_default(),
        &profile.endpoint,
    )?;
    let TtsProviderOptions::Qwen {
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
    if uses_websocket(&profile.endpoint) {
        return websocket::synthesize(profile, request, credential).await;
    }
    if credential.starts_with("sk-sp-") {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "QWEN_TOKEN_PLAN_WEBSOCKET_REQUIRED",
        ));
    }
    let model = profile.model.as_deref().unwrap_or_default();
    let audio = is_audio_model(model);
    let mut input = json!({ "text": request.text, "voice": request.voice_id });
    if audio {
        input["format"] = json!(response_format.as_str());
        if let Some(rate) = request.speed {
            input["rate"] = json!(rate.clamp(0.5, 2.0));
        }
        if let Some(pitch) = request.pitch {
            input["pitch"] = json!(pitch);
        }
    } else {
        // Publication language is not a per-utterance language: an English quote
        // in a Chinese book must retain its own pronunciation.
        input["language_type"] = json!("Auto");
    }
    if let Some(instructions) = request
        .instructions
        .as_deref()
        .or(instructions.as_deref())
        .filter(|value| !value.is_empty())
        .filter(|_| {
            self::model(model, &profile.endpoint).is_ok_and(|model| model.supports_instructions)
        })
    {
        input[if audio { "instruction" } else { "instructions" }] = json!(instructions);
    }
    let endpoint = endpoint(profile, audio)?;
    let http = client(SYNTHESIS_TIMEOUT)?;
    let response = http
        .post(endpoint.clone())
        .bearer_auth(credential)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(serde_json::to_vec(
            &json!({ "model": model, "input": input }),
        )?)
        .send()
        .await
        .map_err(map_reqwest_error)?;
    let body = json_response(response, credential, model).await?;
    let audio_url = body
        .pointer("/output/audio/url")
        .and_then(Value::as_str)
        .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "QWEN_AUDIO_URL_MISSING"))?;
    let mut url = Url::parse(audio_url)
        .map_err(|_| tts_error(TtsErrorKind::InvalidResponse, "INVALID_QWEN_AUDIO_URL"))?;
    // DashScope examples return signed OSS URLs with an http scheme. OSS serves
    // the same signature over TLS; never send the API credential to this host.
    if url.scheme() == "http"
        && url
            .host_str()
            .is_some_and(|host| host.ends_with(".aliyuncs.com"))
    {
        let _ = url.set_scheme("https");
    }
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(tts_error(
            TtsErrorKind::InvalidResponse,
            "INVALID_QWEN_AUDIO_URL",
        ));
    }
    audio_response(
        http.get(url).send().await.map_err(map_reqwest_error)?,
        Some(*response_format),
        Some(credential),
    )
    .await
}

pub(crate) fn uses_websocket(endpoint: &str) -> bool {
    Url::parse(endpoint).is_ok_and(|url| {
        matches!(url.scheme(), "ws" | "wss")
            || url.host_str() == Some("token-plan.maas.qianwenaiapi.com")
    })
}

async fn json_response(
    response: reqwest::Response,
    credential: &str,
    model: &str,
) -> Result<Value, CoreError> {
    let status = response.status();
    let endpoint = format!(
        "{}{}",
        response.url().origin().ascii_serialization(),
        response.url().path()
    );
    let request_id = response
        .headers()
        .get("x-request-id")
        .or_else(|| response.headers().get("x-dashscope-request-id"))
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let bytes = response_bytes(response, "QWEN_RESPONSE_TOO_LARGE").await?;
    let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    if !status.is_success()
        || body
            .get("code")
            .and_then(Value::as_str)
            .is_some_and(|code| !code.is_empty())
    {
        let code = body["code"]
            .as_str()
            .filter(|code| !code.is_empty())
            .unwrap_or("REQUEST_FAILED");
        let request_id = if request_id.is_empty() {
            body["request_id"].as_str().unwrap_or("unavailable")
        } else {
            &request_id
        };
        let raw = String::from_utf8_lossy(&bytes);
        let detail = if raw.trim().is_empty() {
            "Provider returned an empty response body."
        } else if body.as_object().is_some_and(|object| object.is_empty()) {
            "Provider returned no error details (body: {})."
        } else {
            &raw
        };
        return Err(tts_error(
            super::http_error_kind(status),
            &super::redact_credential(
                &format!(
                    "QWEN_{code} (HTTP_{}; request_id={request_id}; model={model}; endpoint={endpoint}): {detail}",
                    status.as_u16()
                ),
                Some(credential),
            ),
        ));
    }
    if body.is_null() {
        return Err(tts_error(
            TtsErrorKind::InvalidResponse,
            "INVALID_QWEN_RESPONSE",
        ));
    }
    Ok(body)
}

pub(crate) async fn discover_voices(
    base: &str,
    model_id: &str,
    credential: Option<&str>,
) -> Result<Vec<TtsVoice>, CoreError> {
    let selected = model(model_id, base)?;
    if credential.is_some_and(|key| key.starts_with("sk-sp-")) && !uses_websocket(base) {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "QWEN_TOKEN_PLAN_WEBSOCKET_REQUIRED",
        ));
    }
    if !selected.voice_discovery {
        return Ok(vec![]);
    }
    discover_account_voices(base, model_id, credential).await
}

pub(crate) async fn discover_account_voices(
    base: &str,
    model_id: &str,
    credential: Option<&str>,
) -> Result<Vec<TtsVoice>, CoreError> {
    let credential = credential
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))?;
    if credential.starts_with("sk-sp-") {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "QWEN_TOKEN_PLAN_WEBSOCKET_REQUIRED",
        ));
    }
    let url = api_endpoint(base, "/services/audio/tts/customization")?;
    let audio = is_audio_model(model_id);
    let enrollment_model = if audio {
        "voice-enrollment"
    } else if model_id.starts_with("qwen3-tts-vd-") {
        "qwen-voice-design"
    } else {
        "qwen-voice-enrollment"
    };
    let http = client(REQUEST_TIMEOUT)?;
    let mut voices: Vec<TtsVoice> = Vec::new();
    let page_size = 100;
    let mut page = 0;
    loop {
        let response = http.post(url.clone()).bearer_auth(credential)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(serde_json::to_vec(&json!({
                "model": enrollment_model,
                "input": { "action": if audio { "list_voice" } else { "list" }, "page_size": page_size, "page_index": page }
            }))?).send().await.map_err(map_reqwest_error)?;
        let body = json_response(response, credential, model_id).await?;
        let list = body
            .pointer("/output/voice_list")
            .and_then(Value::as_array)
            .ok_or_else(|| tts_error(TtsErrorKind::InvalidResponse, "INVALID_QWEN_VOICE_LIST"))?;
        for entry in list {
            let id = entry[if audio { "voice_id" } else { "voice" }]
                .as_str()
                .unwrap_or_default();
            let matches_model = if audio {
                id.starts_with(&format!("{model_id}-")) && entry["status"] == "OK"
            } else {
                entry["target_model"] == model_id
            };
            if matches_model && !id.is_empty() && !voices.iter().any(|voice| voice.id == id) {
                voices.push(voice(id, entry["language"].as_str().unwrap_or("und")));
            }
        }
        page += 1;
        if list.len() < page_size
            || body
                .pointer("/output/total_count")
                .and_then(Value::as_u64)
                .is_some_and(|total| page * page_size >= total as usize)
        {
            break;
        }
    }
    Ok(voices)
}

fn api_endpoint(base: &str, suffix: &str) -> Result<Url, CoreError> {
    let mut url = Url::parse(base)
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "INVALID_TTS_ENDPOINT",
        ));
    }
    let base = url.path().trim_end_matches('/');
    if !base.ends_with(suffix) {
        let base = base
            .strip_suffix("/services/audio/tts/SpeechSynthesizer")
            .or_else(|| base.strip_suffix("/services/aigc/multimodal-generation/generation"))
            .unwrap_or(base);
        let base = if base.is_empty() { "/api/v1" } else { base };
        url.set_path(&format!("{base}{suffix}"));
    }
    Ok(url)
}

fn endpoint(profile: &TtsProviderProfile, audio: bool) -> Result<Url, CoreError> {
    let mut url = api_endpoint(
        &profile.endpoint,
        if audio {
            "/services/audio/tts/SpeechSynthesizer"
        } else {
            "/services/aigc/multimodal-generation/generation"
        },
    )?;
    // Qianwen's Qwen3-TTS HTTP reference uses DashScope. The generic MaaS
    // gateway returns HTTP 400 with only {} for this model.
    // https://platform.qianwenai.com/docs/api-reference/speech-synthesis/qwen-tts
    if !audio
        && url.host_str() == Some("maas.qianwenaiapi.com")
        && url.scheme() == "https"
        && url.port().is_none()
        && url.path() == "/api/v1/services/aigc/multimodal-generation/generation"
    {
        url.set_host(Some("dashscope.aliyuncs.com"))
            .expect("static DashScope hostname is valid");
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TtsProviderKind;

    #[test]
    fn qianwen_flash_uses_its_documented_http_endpoint() {
        let mut profile = TtsProviderProfile {
            voice_names: Default::default(),
            id: "qwen".into(),
            name: "Qwen".into(),
            kind: TtsProviderKind::Qwen,
            endpoint: String::new(),
            model: Some("qwen3-tts-flash".into()),
            credential_reference: None,
            options: TtsProviderOptions::Qwen {
                response_format: TtsAudioFormat::Wav,
                instructions: None,
                voices: vec!["Bunny".into()],
                default_voice: Some("Bunny".into()),
            },
            revision: 1,
        };
        let path = "/api/v1/services/aigc/multimodal-generation/generation";
        for base in [
            "https://maas.qianwenaiapi.com",
            "https://maas.qianwenaiapi.com/api/v1/",
            &format!("https://maas.qianwenaiapi.com{path}"),
        ] {
            profile.endpoint = base.into();
            assert_eq!(
                endpoint(&profile, false).unwrap().as_str(),
                format!("https://dashscope.aliyuncs.com{path}")
            );
        }
        for base in [
            "https://custom.example/api/v1",
            "https://dashscope-intl.aliyuncs.com/api/v1",
            "http://maas.qianwenaiapi.com/api/v1",
            "https://maas.qianwenaiapi.com:8443/api/v1",
            "https://maas.qianwenaiapi.com/custom",
        ] {
            profile.endpoint = base.into();
            assert_eq!(
                endpoint(&profile, false).unwrap(),
                api_endpoint(base, "/services/aigc/multimodal-generation/generation").unwrap()
            );
        }
        profile.endpoint = "https://maas.qianwenaiapi.com/api/v1".into();
        profile.model = Some("qwen-audio-3.0-tts-plus".into());
        assert_eq!(
            endpoint(&profile, true).unwrap().as_str(),
            "https://maas.qianwenaiapi.com/api/v1/services/audio/tts/SpeechSynthesizer"
        );
    }
}
