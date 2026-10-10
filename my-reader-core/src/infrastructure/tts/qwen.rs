use super::map_reqwest_error;
use crate::TtsErrorKind;
use crate::{
    models::{
        QwenTtsModel, QwenTtsPreset, TtsAudioFormat, TtsProviderOptions, TtsProviderProfile,
        TtsSynthesisRequest, TtsVoice,
    },
    CoreError,
};
use reqwest::StatusCode;
use serde_json::{json, Value};
use url::Url;

use super::{audio_response, client, response_bytes, tts_error, SynthesizedAudio};

mod websocket;

pub(crate) const DEFAULT_MODEL: &str = "qwen-audio-3.0-tts-plus";
pub(crate) const DEFAULT_ENDPOINT: &str =
    "wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference";

pub(crate) fn presets() -> Vec<QwenTtsPreset> {
    [
        ("tokenPlan", DEFAULT_ENDPOINT),
        ("qianwen", "https://maas.qianwenaiapi.com/api/v1"),
        ("dashscope", "https://dashscope.aliyuncs.com/api/v1"),
    ]
    .into_iter()
    .map(|(id, endpoint)| QwenTtsPreset {
        id: id.into(),
        endpoint: endpoint.into(),
        default_model: models_for_endpoint(Some(endpoint)).remove(0),
    })
    .collect()
}

// Official HTTP model/voice catalogs, checked 2026-09-29:
// https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list
// https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list
pub(crate) fn models() -> Vec<QwenTtsModel> {
    let instruct_voices = [
        ("Cherry", "芊悦"),
        ("Serena", "苏瑶"),
        ("Ethan", "晨煦"),
        ("Chelsie", "千雪"),
        ("Momo", "茉兔"),
        ("Vivian", "十三"),
        ("Moon", "月白"),
        ("Maia", "四月"),
        ("Kai", "凯"),
        ("Nofish", "不吃鱼"),
        ("Bella", "萌宝"),
        ("Eldric Sage", "沧明子"),
        ("Mia", "乖小妹"),
        ("Mochi", "沙小弥"),
        ("Bellona", "燕铮莺"),
        ("Vincent", "田叔"),
        ("Bunny", "萌小姬"),
        ("Neil", "阿闻"),
        ("Elias", "墨讲师"),
        ("Arthur", "徐大爷"),
        ("Nini", "邻家妹妹"),
        ("Seren", "小婉"),
        ("Pip", "顽屁小孩"),
        ("Stella", "少女阿月"),
    ]
    .into_iter()
    .map(|(id, name)| voice(id, name, "mul"))
    .collect::<Vec<_>>();
    let mut flash_voices = instruct_voices.clone();
    flash_voices.extend(
        [
            ("Jennifer", "詹妮弗"),
            ("Ryan", "甜茶"),
            ("Katerina", "卡捷琳娜"),
            ("Aiden", "艾登"),
            ("Bodega", "博德加"),
            ("Sonrisa", "索尼莎"),
            ("Alek", "阿列克"),
            ("Dolce", "多尔切"),
            ("Sohee", "素熙"),
            ("Ono Anna", "小野杏"),
            ("Lenn", "莱恩"),
            ("Emilien", "埃米尔安"),
            ("Andre", "安德雷"),
            ("Radio Gol", "拉迪奥·戈尔"),
            ("Jada", "上海-阿珍"),
            ("Dylan", "北京-晓东"),
            ("Li", "南京-老李"),
            ("Marcus", "陕西-秦川"),
            ("Roy", "闽南-阿杰"),
            ("Peter", "天津-李彼得"),
            ("Sunny", "四川-晴儿"),
            ("Eric", "四川-程川"),
            ("Rocky", "粤语-阿强"),
            ("Kiki", "粤语-阿清"),
        ]
        .into_iter()
        .map(|(id, name)| voice(id, name, "mul")),
    );
    vec![
        QwenTtsModel {
            id: DEFAULT_MODEL.into(),
            name: "Qwen-Audio-TTS Plus".into(),
            supports_instructions: true,
            voice_discovery: true,
            audio_formats: vec![
                TtsAudioFormat::Mp3,
                TtsAudioFormat::Wav,
                TtsAudioFormat::Opus,
            ],
            voices: vec![
                voice("longanlingxin", "龙安灵心", "mul"),
                voice("longanlufeng", "龙安鲁风", "mul"),
            ],
        },
        QwenTtsModel {
            id: "qwen3-tts-flash".into(),
            name: "Qwen3-TTS Flash".into(),
            supports_instructions: false,
            voice_discovery: false,
            audio_formats: vec![TtsAudioFormat::Wav],
            voices: flash_voices,
        },
        QwenTtsModel {
            id: "qwen3-tts-instruct-flash".into(),
            name: "Qwen3-TTS Instruct Flash".into(),
            supports_instructions: true,
            voice_discovery: false,
            audio_formats: vec![TtsAudioFormat::Wav],
            voices: instruct_voices,
        },
        QwenTtsModel {
            id: "qwen3-tts-vc-2026-01-22".into(),
            name: "Qwen3-TTS VC".into(),
            supports_instructions: false,
            voice_discovery: true,
            audio_formats: vec![TtsAudioFormat::Wav],
            voices: vec![],
        },
        QwenTtsModel {
            id: "qwen3-tts-vd-2026-01-26".into(),
            name: "Qwen3-TTS VD".into(),
            supports_instructions: false,
            voice_discovery: true,
            audio_formats: vec![TtsAudioFormat::Wav],
            voices: vec![],
        },
    ]
}

pub(crate) fn models_for_endpoint(endpoint: Option<&str>) -> Vec<QwenTtsModel> {
    let mut catalog = models();
    if uses_websocket(
        endpoint
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_ENDPOINT),
    ) {
        // Token Plan only advertises Audio Plus. Its gateway does not expose
        // the account voice customization endpoint (404); manual IDs still work.
        catalog.retain(|model| model.id == DEFAULT_MODEL);
        for model in &mut catalog {
            model.voice_discovery = false;
            model
                .voices
                .insert(0, voice("longanhuan_v3.6", "龙安欢", "mul"));
        }
    }
    catalog
}

pub(crate) fn model(id: &str, endpoint: &str) -> Result<QwenTtsModel, CoreError> {
    models_for_endpoint(Some(endpoint))
        .into_iter()
        .find(|model| model.id == id)
        .ok_or_else(|| super::tts_error(TtsErrorKind::Configuration, "QWEN_MODEL_UNSUPPORTED"))
}

fn voice(id: &str, name: &str, language: &str) -> TtsVoice {
    TtsVoice {
        id: id.into(),
        name: name.into(),
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
    let url = Url::parse(&profile.endpoint)
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    if selected.id == DEFAULT_MODEL
        && url.host_str().is_some_and(|host| {
            host == "dashscope-intl.aliyuncs.com"
                || host.ends_with(".ap-southeast-1.maas.aliyuncs.com")
        })
    {
        return Err(tts_error(
            TtsErrorKind::Configuration,
            "QWEN_AUDIO_REQUIRES_BEIJING",
        ));
    }
    Ok(())
}

pub(crate) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: Option<&str>,
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
    let model = profile.model.as_deref().unwrap_or(DEFAULT_MODEL);
    let audio = model == DEFAULT_MODEL;
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
    if let Some(instructions) = instructions.as_deref().filter(|value| !value.is_empty()) {
        input[if audio { "instruction" } else { "instructions" }] = json!(instructions);
    }
    let endpoint = endpoint(profile, audio)?;
    let http = client()?;
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
    let body = json_response(response).await?;
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
    )
    .await
}

pub(crate) fn uses_websocket(endpoint: &str) -> bool {
    Url::parse(endpoint).is_ok_and(|url| {
        matches!(url.scheme(), "ws" | "wss")
            || url.host_str() == Some("token-plan.maas.qianwenaiapi.com")
    })
}

async fn json_response(response: reqwest::Response) -> Result<Value, CoreError> {
    let status = response.status();
    let bytes = response_bytes(response, "QWEN_RESPONSE_TOO_LARGE").await?;
    let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    if !status.is_success()
        || body
            .get("code")
            .and_then(Value::as_str)
            .is_some_and(|code| !code.is_empty())
    {
        let code = body["code"].as_str().unwrap_or("QWEN_REQUEST_FAILED");
        let kind = match status {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => TtsErrorKind::Unauthorized,
            StatusCode::TOO_MANY_REQUESTS => TtsErrorKind::RateLimited,
            StatusCode::REQUEST_TIMEOUT | StatusCode::GATEWAY_TIMEOUT => TtsErrorKind::Timeout,
            status if status.is_server_error() => TtsErrorKind::Unavailable,
            _ => TtsErrorKind::InvalidRequest,
        };
        let request_id = body["request_id"].as_str().unwrap_or_default();
        // Do not echo provider messages: they can contain the submitted book text.
        return Err(tts_error(
            kind,
            &format!("QWEN_{code} (request_id={request_id})"),
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
    if !selected.voice_discovery {
        return Ok(selected.voices);
    }
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
    let audio = model_id == DEFAULT_MODEL;
    let enrollment_model = if audio {
        "voice-enrollment"
    } else if model_id.starts_with("qwen3-tts-vd-") {
        "qwen-voice-design"
    } else {
        "qwen-voice-enrollment"
    };
    let http = client()?;
    let mut voices = selected.voices;
    let page_size = 100;
    let mut page = 0;
    loop {
        let response = http.post(url.clone()).bearer_auth(credential)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(serde_json::to_vec(&json!({
                "model": enrollment_model,
                "input": { "action": if audio { "list_voice" } else { "list" }, "page_size": page_size, "page_index": page }
            }))?).send().await.map_err(map_reqwest_error)?;
        let body = json_response(response).await?;
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
                voices.push(voice(id, id, entry["language"].as_str().unwrap_or("und")));
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
    api_endpoint(
        &profile.endpoint,
        if audio {
            "/services/audio/tts/SpeechSynthesizer"
        } else {
            "/services/aigc/multimodal-generation/generation"
        },
    )
}
