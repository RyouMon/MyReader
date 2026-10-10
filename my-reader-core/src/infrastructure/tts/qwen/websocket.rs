//! Token Plan protocol from the official DashScope tts_v2 SDK.
//! https://platform.qianwenai.com/docs/token-plan/best-practices/multimodal-generation
//! https://github.com/dashscope/dashscope-sdk-python/blob/main/dashscope/audio/tts_v2/speech_synthesizer.py

use crate::TtsErrorKind;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{client::IntoClientRequest, protocol::WebSocketConfig, Error, Message},
};
use url::Url;
use uuid::Uuid;

use super::super::{
    audio_from_bytes, tts_error, SynthesizedAudio, MAX_AUDIO_BYTES, REQUEST_TIMEOUT,
};
use crate::{
    models::{TtsProviderOptions, TtsProviderProfile, TtsSynthesisRequest},
    CoreError,
};

pub(super) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
    // Dropping this future (navigation, stop or provider change) also drops the
    // socket. No detached reader keeps synthesizing or writing a stale artifact.
    tokio::time::timeout(
        REQUEST_TIMEOUT,
        synthesize_task(profile, request, credential),
    )
    .await
    .map_err(|_| tts_error(TtsErrorKind::Timeout, "TTS_REQUEST_TIMEOUT"))?
}

async fn synthesize_task(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: &str,
) -> Result<SynthesizedAudio, CoreError> {
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
    let mut url = Url::parse(&profile.endpoint)
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    if !matches!(url.scheme(), "ws" | "wss") {
        url.set_scheme("wss")
            .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
        url.set_path("/api-ws/v1/inference");
    }
    let mut upgrade = url.as_str().into_client_request().map_err(network_error)?;
    let mut authorization = format!("Bearer {credential}")
        .parse::<http::HeaderValue>()
        .map_err(|_| tts_error(TtsErrorKind::Unauthorized, "INVALID_TTS_CREDENTIAL"))?;
    authorization.set_sensitive(true);
    upgrade
        .headers_mut()
        .insert(http::header::AUTHORIZATION, authorization);
    let mut config = WebSocketConfig::default();
    config.max_message_size = Some(MAX_AUDIO_BYTES as usize);
    config.max_frame_size = Some(MAX_AUDIO_BYTES as usize);
    let (mut socket, _) = connect_async_with_config(upgrade, Some(config), false)
        .await
        .map_err(network_error)?;
    let task_id = Uuid::new_v4().simple().to_string();
    let header =
        |action: &str| json!({"action": action, "task_id": task_id, "streaming": "duplex"});
    let mut parameters = json!({
        "text_type": "PlainText", "voice": request.voice_id,
        "format": response_format.as_str(), "sample_rate": 24000,
        "rate": request.speed.unwrap_or(1.0).clamp(0.5, 2.0),
        "pitch": request.pitch.unwrap_or(1.0),
    });
    if let Some(value) = instructions.as_deref().filter(|value| !value.is_empty()) {
        parameters["instruction"] = json!(value);
    }
    socket
        .send(Message::text(
            json!({
                "header": header("run-task"),
                "payload": {
                    "model": profile.model, "task_group": "audio", "task": "tts",
                    "function": "SpeechSynthesizer", "parameters": parameters, "input": {},
                },
            })
            .to_string(),
        ))
        .await
        .map_err(network_error)?;

    let mut started = false;
    let mut bytes = Vec::new();
    while let Some(message) = socket.next().await {
        match message.map_err(network_error)? {
            Message::Text(text) => {
                let body: Value = serde_json::from_str(&text).map_err(|_| {
                    tts_error(TtsErrorKind::InvalidResponse, "INVALID_QWEN_RESPONSE")
                })?;
                if body["header"]["task_id"].as_str() != Some(&task_id) {
                    return Err(tts_error(
                        TtsErrorKind::InvalidResponse,
                        "QWEN_TASK_ID_MISMATCH",
                    ));
                }
                match body["header"]["event"].as_str() {
                    Some("task-started") if !started => {
                        started = true;
                        socket.send(Message::text(json!({
                            "header": header("continue-task"),
                            "payload": {"model": profile.model, "task_group": "audio", "task": "tts",
                                "function": "SpeechSynthesizer", "input": {"text": request.text}},
                        }).to_string())).await.map_err(network_error)?;
                        socket
                            .send(Message::text(
                                json!({
                                    "header": header("finish-task"), "payload": {"input": {}},
                                })
                                .to_string(),
                            ))
                            .await
                            .map_err(network_error)?;
                    }
                    Some("task-finished") if started => {
                        let audio = audio_from_bytes(bytes, Some(*response_format))?;
                        let _ = socket.close(None).await;
                        return Ok(audio);
                    }
                    Some("task-failed") => {
                        let code = body["header"]["error_code"]
                            .as_str()
                            .unwrap_or("TaskFailed");
                        let kind = match code {
                            "InvalidApiKey" | "AccessDenied" | "Unauthorized" => {
                                TtsErrorKind::Unauthorized
                            }
                            "Throttling" | "Throttling.RateQuota" => TtsErrorKind::RateLimited,
                            "RequestTimeout" => TtsErrorKind::Timeout,
                            _ => TtsErrorKind::InvalidRequest,
                        };
                        // Never include error_message: it may echo a book or credential.
                        return Err(tts_error(
                            kind,
                            &format!("QWEN_{code} (request_id={task_id})"),
                        ));
                    }
                    _ => {}
                }
            }
            Message::Binary(chunk) if started => {
                if bytes.len().saturating_add(chunk.len()) as u64 > MAX_AUDIO_BYTES {
                    return Err(tts_error(
                        TtsErrorKind::PayloadTooLarge,
                        "TTS_AUDIO_TOO_LARGE",
                    ));
                }
                bytes.extend_from_slice(&chunk);
            }
            Message::Close(_) => break,
            Message::Ping(_) => socket.flush().await.map_err(network_error)?,
            _ => {}
        }
    }
    Err(tts_error(TtsErrorKind::Network, "QWEN_TASK_INTERRUPTED"))
}

fn network_error(error: Error) -> CoreError {
    match error {
        Error::Http(response) => {
            let status = response.status().as_u16();
            let kind = match status {
                401 | 403 => TtsErrorKind::Unauthorized,
                429 => TtsErrorKind::RateLimited,
                408 | 504 => TtsErrorKind::Timeout,
                _ => TtsErrorKind::Unavailable,
            };
            tts_error(kind, &format!("HTTP_{status}"))
        }
        Error::Capacity(_) => tts_error(TtsErrorKind::PayloadTooLarge, "TTS_AUDIO_TOO_LARGE"),
        _ => tts_error(TtsErrorKind::Network, "TTS_NETWORK_ERROR"),
    }
}
