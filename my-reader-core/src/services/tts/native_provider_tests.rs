//! Golden contract tests for all native TTS providers and local OpenAI-compatible extensions.

use serde_json::{json, Value};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinHandle,
};

use super::*;
use crate::models::{TtsAudioFormat, TtsProviderKind, TtsProviderOptions};

fn make_profile(
    kind: TtsProviderKind,
    endpoint: String,
    model: &str,
    format: TtsAudioFormat,
    voice: &str,
) -> TtsProviderProfile {
    TtsProviderProfile {
        id: format!("{}-profile", kind.as_str()),
        name: kind.default_name().into(),
        kind,
        endpoint,
        model: Some(model.into()),
        credential_reference: Some(format!("tts:{}:api-key", kind.as_str())),
        options: TtsProviderOptions {
            kind,
            response_format: format,
            instructions: None,
            voices: vec![voice.into()],
        },
        voice_names: Default::default(),
        revision: 1,
    }
}

fn make_request(profile_id: &str, voice_id: &str, mime: &str) -> TtsSynthesisRequest {
    TtsSynthesisRequest {
        profile_id: profile_id.into(),
        text: "Hello from MyReader.".into(),
        language: Some("en-US".into()),
        voice_id: voice_id.into(),
        instructions: None,
        speed: Some(1.0),
        pitch: None,
        accepted_mime_types: vec![mime.into()],
        cache_policy: TtsCachePolicy::Bypass,
    }
}

async fn mock_server(responses: Vec<Vec<u8>>) -> (String, JoinHandle<Vec<Vec<u8>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let handle = tokio::spawn(async move {
        let mut requests = Vec::new();
        for response in responses {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            loop {
                let mut chunk = [0_u8; 4096];
                let count = stream.read(&mut chunk).await.unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..count]);
                if is_http_complete(&request) {
                    break;
                }
            }
            requests.push(request);
            stream.write_all(&response).await.unwrap();
            stream.shutdown().await.unwrap();
        }
        requests
    });
    (format!("http://{address}"), handle)
}

fn is_http_complete(request: &[u8]) -> bool {
    let Some(header_end) = request.windows(4).position(|w| w == b"\r\n\r\n") else {
        return false;
    };
    let headers = String::from_utf8_lossy(&request[..header_end]);
    let content_length = headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length")
            .then(|| value.trim().parse::<usize>().ok())
            .flatten()
    });
    request.len() >= header_end + 4 + content_length.unwrap_or(0)
}

fn http_ok(content_type: &str, body: &[u8]) -> Vec<u8> {
    let mut bytes = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    bytes.extend_from_slice(body);
    bytes
}

fn http_status(status: &str, content_type: &str, body: &[u8]) -> Vec<u8> {
    let mut bytes = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    bytes.extend_from_slice(body);
    bytes
}

fn split_request(raw: &[u8]) -> (String, Vec<u8>) {
    let offset = raw.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
    (
        String::from_utf8_lossy(&raw[..offset]).into_owned(),
        raw[offset + 4..].to_vec(),
    )
}

#[tokio::test]
async fn openai_compatible_supports_keyless_local_synthesis_and_voice_discovery() {
    let (endpoint, server) = mock_server(vec![
        http_ok("audio/mpeg", b"ID3\x04\x00\x00local-kokoro"),
        http_ok("application/json", br#"{"voices":["af_heart","zm_yunxi"]}"#),
        http_status("404 Not Found", "application/json", b"{}"),
        http_ok(
            "application/json",
            br#"[{"id":"piper-en","name":"Piper English","language":"en-US"}]"#,
        ),
    ])
    .await;
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("config.json");
    let profile = make_profile(
        TtsProviderKind::OpenAiCompatible,
        endpoint,
        "kokoro",
        TtsAudioFormat::Mp3,
        "af_heart",
    );
    TtsService::upsert_profile(&config, profile.clone()).unwrap();

    let artifact = TtsService::synthesize(
        &config,
        dir.path(),
        make_request(&profile.id, "af_heart", "audio/mpeg"),
        None,
    )
    .await
    .unwrap();
    assert_eq!(
        std::fs::read(&artifact.path).unwrap(),
        b"ID3\x04\x00\x00local-kokoro"
    );

    let kokoro_voices = TtsService::discover_voices(&profile, None).await.unwrap();
    assert_eq!(
        kokoro_voices
            .iter()
            .map(|v| v.id.as_str())
            .collect::<Vec<_>>(),
        vec!["af_heart", "zm_yunxi"]
    );

    let speaches_voices = TtsService::discover_voices(&profile, None).await.unwrap();
    assert_eq!(speaches_voices.len(), 1);
    assert_eq!(speaches_voices[0].id, "piper-en");
    assert_eq!(speaches_voices[0].name.as_deref(), Some("Piper English"));

    let requests = server.await.unwrap();
    let (headers, _) = split_request(&requests[0]);
    assert!(headers.starts_with("POST /v1/audio/speech HTTP/1.1"));
    assert!(!headers.to_ascii_lowercase().contains("authorization:"));
    assert!(split_request(&requests[1])
        .0
        .starts_with("GET /v1/audio/voices "));
    assert!(split_request(&requests[3])
        .0
        .starts_with("GET /v1/audio/speech/voices "));
}

#[tokio::test]
async fn minimax_synthesizes_hex_audio_discovers_voices_and_redacts_errors() {
    let hex_mp3 = "4944330400006d696e69"; // "ID3\x04\x00\x00mini"
    let synth_body = serde_json::to_vec(&json!({
        "base_resp": {"status_code": 0, "status_msg": "success"},
        "data": {"audio": hex_mp3}
    }))
    .unwrap();
    let voices_body = serde_json::to_vec(&json!({
        "base_resp": {"status_code": 0, "status_msg": "success"},
        "system_voice": [{"voice_id": "male-qn-qingse", "voice_name": "青涩青年"}],
        "voice_cloning": [{"voice_id": "clone-1", "voice_name": "My Clone"}],
        "voice_generation": []
    }))
    .unwrap();
    let err_body = serde_json::to_vec(&json!({
        "base_resp": {"status_code": 1004, "status_msg": "invalid secret-key for 998877"}
    }))
    .unwrap();
    let (endpoint, server) = mock_server(vec![
        http_ok("application/json", &synth_body),
        http_ok("application/json", &voices_body),
        http_ok("application/json", &err_body),
    ])
    .await;
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("config.json");
    let profile = make_profile(
        TtsProviderKind::MiniMax,
        endpoint,
        "speech-2.8-turbo",
        TtsAudioFormat::Mp3,
        "male-qn-qingse",
    );
    TtsService::upsert_profile(&config, profile.clone()).unwrap();

    let mut req = make_request(&profile.id, "male-qn-qingse", "audio/mpeg");
    req.speed = Some(3.0);
    req.pitch = Some(1.5);
    let artifact = TtsService::synthesize(&config, dir.path(), req, Some("998877:secret-key"))
        .await
        .unwrap();
    assert_eq!(
        std::fs::read(&artifact.path).unwrap(),
        b"ID3\x04\x00\x00mini"
    );
    assert_eq!(artifact.playback_rate, Some(1.5));

    let voices = TtsService::discover_voices(&profile, Some("secret-key"))
        .await
        .unwrap();
    assert_eq!(voices.len(), 2);
    assert_eq!(voices[0].id, "male-qn-qingse");
    assert_eq!(voices[0].name.as_deref(), Some("青涩青年"));
    assert_eq!(voices[1].id, "clone-1");

    let err = TtsService::discover_voices(&profile, Some("998877:secret-key"))
        .await
        .unwrap_err();
    assert!(matches!(
        err,
        CoreError::Tts {
            kind: TtsErrorKind::Unauthorized,
            ..
        }
    ));
    let message = err.to_string();
    assert!(!message.contains("secret-key"));
    assert!(!message.contains("998877"));

    let requests = server.await.unwrap();
    let (headers, body) = split_request(&requests[0]);
    assert!(headers.starts_with("POST /v1/t2a_v2?GroupId=998877 HTTP/1.1"));
    assert!(headers
        .to_ascii_lowercase()
        .contains("authorization: bearer secret-key"));
    let parsed: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(parsed["model"], "speech-2.8-turbo");
    assert_eq!(parsed["voice_setting"]["speed"], 2.0);
    assert_eq!(parsed["voice_setting"]["pitch"], 6);
    assert_eq!(parsed["audio_setting"]["format"], "mp3");
}

#[tokio::test]
async fn volcengine_supports_v3_single_key_legacy_pair_wav_framing_and_v1_compat() {
    // "ID3\x04\x00\x00" = "SUQzBAAA", "volc" = "dm9sYw=="
    let v3_stream = concat!(
        r#"{"code":0,"message":"","data":"SUQzBAAA"}"#,
        "\n",
        r#"data: {"code":0,"message":"","data":"dm9sYw=="}"#,
        "\n",
        r#"{"code":20000000,"message":"OK","data":null}"#,
        "\n"
    );
    // 4 raw PCM bytes: [1, 2, 3, 4] = "AQIDBA=="
    let v3_pcm_stream = r#"{"code":0,"message":"","data":"AQIDBA=="}"#;
    let v1_json = serde_json::to_vec(&json!({"code": 3000, "data": "SUQzBAAA"})).unwrap();

    let (endpoint, server) = mock_server(vec![
        http_ok("application/json", v3_stream.as_bytes()),
        http_ok("application/json", v3_pcm_stream.as_bytes()),
        http_ok("application/json", &v1_json),
    ])
    .await;
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("config.json");

    // 1. V3 with single X-Api-Key + instructions -> additions.context_texts
    let profile = make_profile(
        TtsProviderKind::Volcengine,
        endpoint.clone(),
        "seed-tts-2.0",
        TtsAudioFormat::Mp3,
        "zh_female_vv_uranus_bigtts",
    );
    TtsService::upsert_profile(&config, profile.clone()).unwrap();
    let mut req = make_request(&profile.id, "zh_female_vv_uranus_bigtts", "audio/mpeg");
    req.instructions = Some("温柔地说".into());
    req.speed = Some(1.5);
    let artifact = TtsService::synthesize(&config, dir.path(), req, Some("single-api-key"))
        .await
        .unwrap();
    assert_eq!(
        std::fs::read(&artifact.path).unwrap(),
        b"ID3\x04\x00\x00volc"
    );

    // 2. V3 with legacy appId:accessKey and WAV framing from PCM
    let mut wav_profile = make_profile(
        TtsProviderKind::Volcengine,
        endpoint.clone(),
        "volc.service_type.10029",
        TtsAudioFormat::Wav,
        "zh_female_cancan_mars_bigtts",
    );
    wav_profile.id = "volc-wav".into();
    TtsService::upsert_profile(&config, wav_profile.clone()).unwrap();
    let wav_artifact = TtsService::synthesize(
        &config,
        dir.path(),
        make_request(&wav_profile.id, "zh_female_cancan_mars_bigtts", "audio/wav"),
        Some("app123:tok456"),
    )
    .await
    .unwrap();
    let wav_bytes = std::fs::read(&wav_artifact.path).unwrap();
    assert_eq!(&wav_bytes[0..4], b"RIFF");
    assert_eq!(&wav_bytes[8..12], b"WAVE");
    assert_eq!(&wav_bytes[44..], &[1, 2, 3, 4]);

    // 3. V1 endpoint routing
    let mut v1_profile = make_profile(
        TtsProviderKind::Volcengine,
        format!("{endpoint}/api/v1/tts"),
        "volcano_tts",
        TtsAudioFormat::Mp3,
        "BV700_V2_streaming",
    );
    v1_profile.id = "volc-v1".into();
    TtsService::upsert_profile(&config, v1_profile.clone()).unwrap();
    let v1_artifact = TtsService::synthesize(
        &config,
        dir.path(),
        make_request(&v1_profile.id, "BV700_V2_streaming", "audio/mpeg"),
        Some("app123:tok456"),
    )
    .await
    .unwrap();
    assert_eq!(
        std::fs::read(&v1_artifact.path).unwrap(),
        b"ID3\x04\x00\x00"
    );

    let requests = server.await.unwrap();
    let (h0, b0) = split_request(&requests[0]);
    assert!(h0.starts_with("POST /api/v3/tts/unidirectional HTTP/1.1"));
    assert!(h0
        .to_ascii_lowercase()
        .contains("x-api-key: single-api-key"));
    assert!(!h0.to_ascii_lowercase().contains("x-api-app-id:"));
    assert!(h0
        .to_ascii_lowercase()
        .contains("x-api-resource-id: seed-tts-2.0"));
    let parsed0: Value = serde_json::from_slice(&b0).unwrap();
    assert_eq!(parsed0["req_params"]["audio_params"]["speech_rate"], 50);
    let additions: Value =
        serde_json::from_str(parsed0["req_params"]["additions"].as_str().unwrap()).unwrap();
    assert_eq!(additions["context_texts"][0], "温柔地说");

    let (h1, b1) = split_request(&requests[1]);
    assert!(h1.to_ascii_lowercase().contains("x-api-app-id: app123"));
    assert!(h1.to_ascii_lowercase().contains("x-api-access-key: tok456"));
    assert!(!h1.to_ascii_lowercase().contains("x-api-key:"));
    let parsed1: Value = serde_json::from_slice(&b1).unwrap();
    assert_eq!(parsed1["req_params"]["audio_params"]["format"], "pcm");

    let (h2, b2) = split_request(&requests[2]);
    assert!(h2.starts_with("POST /api/v1/tts HTTP/1.1"));
    assert!(h2
        .to_ascii_lowercase()
        .contains("authorization: bearer;tok456"));
    let parsed2: Value = serde_json::from_slice(&b2).unwrap();
    assert_eq!(parsed2["app"]["appid"], "app123");
    assert_eq!(parsed2["audio"]["voice_type"], "BV700_V2_streaming");
}

#[tokio::test]
async fn elevenlabs_handles_v3_speed_fallback_model_filter_and_paginated_voices() {
    let models_json = serde_json::to_vec(&json!([
        {"model_id": "eleven_v3", "can_do_text_to_speech": true},
        {"model_id": "eleven_multilingual_v2", "can_do_text_to_speech": true},
        {"model_id": "scribe_v1", "can_do_text_to_speech": false}
    ]))
    .unwrap();
    let page1 = serde_json::to_vec(&json!({
        "voices": [{"voice_id": "v1", "name": "Rachel", "labels": {"language": "en", "gender": "female"}}],
        "has_more": true,
        "next_page_token": "tok-2"
    }))
    .unwrap();
    let page2 = serde_json::to_vec(&json!({
        "voices": [{"voice_id": "v2", "name": "Adam", "labels": {"language": "en", "gender": "male"}}],
        "has_more": false,
        "next_page_token": null
    }))
    .unwrap();

    let (endpoint, server) = mock_server(vec![
        http_ok("audio/mpeg", b"ID3\x04\x00\x00v2"),
        http_ok("audio/mpeg", b"ID3\x04\x00\x00v3"),
        http_ok("application/json", &models_json),
        http_ok("application/json", &page1),
        http_ok("application/json", &page2),
    ])
    .await;
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("config.json");

    let v2 = make_profile(
        TtsProviderKind::ElevenLabs,
        endpoint.clone(),
        "eleven_multilingual_v2",
        TtsAudioFormat::Mp3,
        "v1",
    );
    TtsService::upsert_profile(&config, v2.clone()).unwrap();
    let mut req = make_request(&v2.id, "v1", "audio/mpeg");
    req.speed = Some(1.5);
    let art_v2 = TtsService::synthesize(&config, dir.path(), req, Some("xi-key"))
        .await
        .unwrap();
    assert_eq!(art_v2.playback_rate, Some(1.5 / 1.2));

    let mut v3 = make_profile(
        TtsProviderKind::ElevenLabs,
        endpoint,
        "eleven_v3",
        TtsAudioFormat::Mp3,
        "v1",
    );
    v3.id = "eleven-v3".into();
    TtsService::upsert_profile(&config, v3.clone()).unwrap();
    let mut req_v3 = make_request(&v3.id, "v1", "audio/mpeg");
    req_v3.speed = Some(1.5);
    let art_v3 = TtsService::synthesize(&config, dir.path(), req_v3, Some("xi-key"))
        .await
        .unwrap();
    assert_eq!(art_v3.playback_rate, Some(1.5));

    let models = TtsService::discover_models(&v2, Some("xi-key"))
        .await
        .unwrap();
    assert_eq!(models, vec!["eleven_multilingual_v2", "eleven_v3"]);

    let voices = TtsService::discover_voices(&v2, Some("xi-key"))
        .await
        .unwrap();
    assert_eq!(voices.len(), 2);
    assert_eq!(voices[0].name.as_deref(), Some("Rachel"));
    assert_eq!(voices[1].name.as_deref(), Some("Adam"));

    let requests = server.await.unwrap();
    let (h0, b0) = split_request(&requests[0]);
    assert!(h0.starts_with("POST /v1/text-to-speech/v1?output_format=mp3_44100_128 HTTP/1.1"));
    assert!(h0.to_ascii_lowercase().contains("xi-api-key: xi-key"));
    let parsed0: Value = serde_json::from_slice(&b0).unwrap();
    assert_eq!(parsed0["voice_settings"]["speed"], 1.2);

    let (_, b1) = split_request(&requests[1]);
    let parsed1: Value = serde_json::from_slice(&b1).unwrap();
    assert!(parsed1.get("voice_settings").is_none());
}

#[tokio::test]
async fn elevenlabs_falls_back_to_known_models_when_scoped_key_lacks_models_read() {
    let missing_perm = serde_json::to_vec(&json!({
        "detail": {
            "status": "missing_permissions",
            "message": "The API key you used is missing the permission models_read to execute this operation."
        }
    }))
    .unwrap();
    let invalid_key = serde_json::to_vec(&json!({
        "detail": {
            "status": "invalid_api_key",
            "message": "Invalid API key"
        }
    }))
    .unwrap();
    let (endpoint, _server) = mock_server(vec![
        http_status("401 Unauthorized", "application/json", &missing_perm),
        http_status("401 Unauthorized", "application/json", &invalid_key),
    ])
    .await;
    let profile = make_profile(
        TtsProviderKind::ElevenLabs,
        endpoint,
        "eleven_multilingual_v2",
        TtsAudioFormat::Mp3,
        "v1",
    );

    let fallback = TtsService::discover_models(&profile, Some("scoped-key"))
        .await
        .unwrap();
    assert!(fallback.contains(&"eleven_multilingual_v2".to_owned()));
    assert!(fallback.contains(&"eleven_v3".to_owned()));

    let err = TtsService::discover_models(&profile, Some("bad-key"))
        .await
        .unwrap_err();
    assert!(matches!(
        err,
        CoreError::Tts {
            kind: TtsErrorKind::Unauthorized,
            ..
        }
    ));
}

#[tokio::test]
async fn fish_audio_sends_model_header_and_discovers_workspace_and_popular_voices() {
    let self_page = serde_json::to_vec(&json!({
        "total": 1,
        "items": [{"_id": "my-clone", "title": "My Voice", "languages": ["zh"]}]
    }))
    .unwrap();
    let popular_page = serde_json::to_vec(&json!({
        "total": 1000,
        "items": [{"_id": "popular-1", "title": "Popular Narrator", "languages": ["en"]}]
    }))
    .unwrap();
    let (endpoint, server) = mock_server(vec![
        http_ok("audio/mpeg", b"ID3\x04\x00\x00fish"),
        http_ok("application/json", &self_page),
        http_ok("application/json", &popular_page),
    ])
    .await;
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("config.json");
    let profile = make_profile(
        TtsProviderKind::FishAudio,
        endpoint,
        "s2.1-pro-free",
        TtsAudioFormat::Mp3,
        "my-clone",
    );
    TtsService::upsert_profile(&config, profile.clone()).unwrap();

    let artifact = TtsService::synthesize(
        &config,
        dir.path(),
        make_request(&profile.id, "my-clone", "audio/mpeg"),
        Some("fish-key"),
    )
    .await
    .unwrap();
    assert_eq!(
        std::fs::read(&artifact.path).unwrap(),
        b"ID3\x04\x00\x00fish"
    );

    let voices = TtsService::discover_voices(&profile, Some("fish-key"))
        .await
        .unwrap();
    assert_eq!(voices.len(), 2);
    assert_eq!(voices[0].id, "my-clone");
    assert_eq!(voices[0].name.as_deref(), Some("My Voice"));
    assert_eq!(voices[1].id, "popular-1");
    assert_eq!(voices[1].name.as_deref(), Some("Popular Narrator"));

    let requests = server.await.unwrap();
    let (headers, body) = split_request(&requests[0]);
    assert!(headers.starts_with("POST /v1/tts HTTP/1.1"));
    assert!(headers
        .to_ascii_lowercase()
        .contains("model: s2.1-pro-free"));
    assert!(headers
        .to_ascii_lowercase()
        .contains("authorization: bearer fish-key"));
    let parsed: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(parsed["reference_id"], "my-clone");
    assert_eq!(parsed["format"], "mp3");
}

#[tokio::test]
async fn gemini_frames_pcm_to_wav_passes_instructions_and_discovers_models_and_voices() {
    let synth_json = serde_json::to_vec(&json!({
        "candidates": [{
            "content": {
                "parts": [{
                    "inlineData": {
                        "mimeType": "audio/L16;codec=pcm;rate=24000",
                        "data": "AQIDBA=="
                    }
                }]
            }
        }]
    }))
    .unwrap();
    let models_json = serde_json::to_vec(&json!({
        "models": [
            {"name": "models/gemini-2.5-flash"},
            {"name": "models/gemini-2.5-flash-preview-tts"},
            {"name": "models/gemini-2.5-pro-preview-tts"}
        ]
    }))
    .unwrap();
    let (endpoint, server) = mock_server(vec![
        http_ok("application/json", &synth_json),
        http_ok("application/json", &models_json),
    ])
    .await;
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("config.json");
    let profile = make_profile(
        TtsProviderKind::Gemini,
        endpoint,
        "gemini-2.5-flash-preview-tts",
        TtsAudioFormat::Wav,
        "Kore",
    );
    TtsService::upsert_profile(&config, profile.clone()).unwrap();

    let mut req = make_request(&profile.id, "Kore", "audio/wav");
    req.instructions = Some("Speak warmly".into());
    req.speed = Some(1.4);
    let artifact = TtsService::synthesize(&config, dir.path(), req, Some("gem-key"))
        .await
        .unwrap();
    assert_eq!(artifact.mime_type, "audio/wav");
    assert_eq!(artifact.playback_rate, Some(1.4));
    let wav = std::fs::read(&artifact.path).unwrap();
    assert_eq!(&wav[0..4], b"RIFF");
    assert_eq!(&wav[8..12], b"WAVE");
    assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 24_000);
    assert_eq!(&wav[44..], &[1, 2, 3, 4]);

    let models = TtsService::discover_models(&profile, Some("gem-key"))
        .await
        .unwrap();
    assert_eq!(
        models,
        vec!["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]
    );
    let voices = TtsService::discover_voices(&profile, Some("gem-key"))
        .await
        .unwrap();
    assert_eq!(voices.len(), 30);
    assert!(voices.iter().any(|voice| voice.id == "Kore"));

    let requests = server.await.unwrap();
    let (headers, body) = split_request(&requests[0]);
    assert!(headers
        .starts_with("POST /v1beta/models/gemini-2.5-flash-preview-tts:generateContent HTTP/1.1"));
    assert!(headers
        .to_ascii_lowercase()
        .contains("x-goog-api-key: gem-key"));
    let parsed: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        parsed["contents"][0]["parts"][0]["text"],
        "Speak warmly:\nHello from MyReader."
    );
    assert_eq!(
        parsed["generationConfig"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]
            ["voiceName"],
        "Kore"
    );
}
