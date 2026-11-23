use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};
use uuid::Uuid;

use super::{
    audio_format, audio_from_bytes, client, json_string, map_reqwest_error, provider_url,
    response_bytes, successful, tts_error, SynthesizedAudio, SYNTHESIS_TIMEOUT,
};
use crate::{
    models::{TtsAudioFormat, TtsProviderProfile, TtsSynthesisRequest},
    CoreError, TtsErrorKind,
};

const DOUBAO_MODELS: &[&str] = &["seed-tts-2.0", "seed-icl-2.0"];

pub(super) fn models() -> Vec<String> {
    DOUBAO_MODELS.iter().map(|id| (*id).into()).collect()
}

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    let format = audio_format(profile)?;
    let endpoint = provider_url(profile, "/api/v3/tts/unidirectional")?;
    let credentials = parse_credential(credential)?;
    let body = request_body(profile, request, format);
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
    let audio = super::volcengine::decode_audio(&bytes)?;
    audio_from_bytes(audio, Some(format))
}

pub(super) fn request_body(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    format: TtsAudioFormat,
) -> Value {
    let mut req_params = json!({
        "text": request.text,
        "speaker": request.voice_id,
        "audio_params": {
            "format": super::volcengine::format(format),
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

#[derive(Debug)]
pub(super) struct DoubaoCredential {
    pub(super) api_key: Option<String>,
    pub(super) app_id: Option<String>,
    pub(super) access_key: Option<String>,
}

pub(super) fn parse_credential(value: &str) -> Result<DoubaoCredential, CoreError> {
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
