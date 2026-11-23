//! Provider-specific TTS adapters and their shared dispatch boundary.

mod doubao;
mod elevenlabs;
mod fish_audio;
mod minimax;
mod volcengine;

use serde_json::Value;
use url::Url;

use super::tts_error;
use crate::{
    models::{TtsAudioFormat, TtsProviderKind, TtsProviderProfile, TtsSynthesisRequest, TtsVoice},
    CoreError, TtsErrorKind,
};

pub(crate) async fn discover_models(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<String>, CoreError> {
    match profile.kind {
        TtsProviderKind::MiniMax => Ok(minimax::models()),
        TtsProviderKind::Volcengine => Ok(volcengine::models()),
        TtsProviderKind::Doubao => Ok(doubao::models()),
        TtsProviderKind::ElevenLabs => elevenlabs::discover_models(profile, credential).await,
        TtsProviderKind::FishAudio => Ok(fish_audio::models()),
        _ => Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_NATIVE_PROVIDER_UNSUPPORTED",
        )),
    }
}

pub(crate) async fn discover_voices(
    profile: &TtsProviderProfile,
    credential: Option<&str>,
) -> Result<Vec<TtsVoice>, CoreError> {
    let credential = credential
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))?;
    match profile.kind {
        TtsProviderKind::MiniMax => minimax::discover_voices(profile, credential).await,
        TtsProviderKind::ElevenLabs => elevenlabs::discover_voices(profile, credential).await,
        TtsProviderKind::FishAudio => fish_audio::discover_voices(profile, credential).await,
        _ => Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_NATIVE_VOICE_DISCOVERY_UNSUPPORTED",
        )),
    }
}

pub(crate) async fn synthesize(
    profile: &TtsProviderProfile,
    request: &TtsSynthesisRequest,
    credential: Option<&str>,
) -> Result<super::SynthesizedAudio, CoreError> {
    let credential = credential
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| tts_error(TtsErrorKind::Unauthorized, "TTS_CREDENTIAL_REQUIRED"))?;
    match profile.kind {
        TtsProviderKind::MiniMax => minimax::synthesize(profile, request, credential).await,
        TtsProviderKind::Volcengine => volcengine::synthesize(profile, request, credential).await,
        TtsProviderKind::Doubao => doubao::synthesize(profile, request, credential).await,
        TtsProviderKind::ElevenLabs => elevenlabs::synthesize(profile, request, credential).await,
        TtsProviderKind::FishAudio => fish_audio::synthesize(profile, request, credential).await,
        _ => Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_NATIVE_PROVIDER_UNSUPPORTED",
        )),
    }
}

pub(super) fn json_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub(super) fn provider_url(
    profile: &TtsProviderProfile,
    default_path: &str,
) -> Result<Url, CoreError> {
    let mut url = Url::parse(profile.endpoint.trim())
        .map_err(|_| tts_error(TtsErrorKind::Configuration, "INVALID_TTS_ENDPOINT"))?;
    let path = url.path().trim_end_matches('/');
    if path.is_empty() || path == "/" {
        url.set_path(default_path);
    } else {
        let base_segments = path.trim_start_matches('/').split('/').collect::<Vec<_>>();
        let route_segments = default_path
            .trim_start_matches('/')
            .split('/')
            .collect::<Vec<_>>();
        let shared_segments = (1..=base_segments.len().min(route_segments.len()))
            .rev()
            .find(|length| {
                base_segments[base_segments.len() - length..] == route_segments[..*length]
            })
            .unwrap_or(0);
        if shared_segments == route_segments.len() {
            return Ok(url);
        }
        let suffix = route_segments[shared_segments..].join("/");
        let next_path = if suffix.is_empty() {
            path.to_owned()
        } else {
            format!("{path}/{suffix}")
        };
        url.set_path(&next_path);
    }
    Ok(url)
}

pub(super) fn audio_format(profile: &TtsProviderProfile) -> Result<TtsAudioFormat, CoreError> {
    let format = profile.options.response_format;
    if matches!(
        format,
        TtsAudioFormat::Mp3 | TtsAudioFormat::Flac | TtsAudioFormat::Wav | TtsAudioFormat::Opus
    ) {
        Ok(format)
    } else {
        Err(tts_error(
            TtsErrorKind::Configuration,
            "TTS_AUDIO_FORMAT_UNSUPPORTED",
        ))
    }
}

pub(super) fn sort_deduplicate_voices(voices: &mut Vec<TtsVoice>) {
    voices.sort_by(|left, right| left.id.cmp(&right.id));
    voices.dedup_by(|left, right| left.id == right.id);
}

// Keep the shared HTTP helpers available to provider modules without making
// provider implementations depend on unrelated infrastructure details.
pub(super) use super::{
    audio_from_bytes, audio_response, client, map_reqwest_error, response_bytes, successful,
    SynthesizedAudio, REQUEST_TIMEOUT, SYNTHESIS_TIMEOUT,
};

#[cfg(test)]
use doubao::{parse_credential as parse_doubao_credential, request_body as doubao_request_body};
#[cfg(test)]
use elevenlabs::{
    decode_voice_list as decode_eleven_voice_list, decode_voice_page as decode_eleven_voice_page,
    language_code as eleven_language_code,
};
#[cfg(test)]
use fish_audio::{
    decode_voice_list as decode_fish_voice_list, decode_voice_page as decode_fish_voice_page,
};
#[cfg(test)]
use minimax::{decode_minimax_audio, minimax_endpoint, parse_minimax_credential};
#[cfg(test)]
use volcengine::{
    decode_audio as decode_volcengine_audio, decode_v1_audio as decode_volcengine_v1_audio,
    format as volcengine_format, v1_format as volcengine_v1_format,
};

#[cfg(test)]
mod tests {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        task::JoinHandle,
    };

    use super::*;

    #[test]
    fn decodes_minimax_hex_audio() {
        let audio =
            decode_minimax_audio(br#"{"base_resp":{"status_code":0},"data":{"audio":"494433"}}"#)
                .unwrap();

        assert_eq!(audio, b"ID3");
    }

    #[tokio::test]
    async fn exposes_only_official_minimax_t2a_models() {
        let profile = profile(TtsProviderKind::MiniMax, "https://api.minimaxi.com/v1");
        let models = discover_models(&profile, None).await.unwrap();

        assert_eq!(
            models,
            [
                "speech-2.8-hd",
                "speech-2.8-turbo",
                "speech-2.6-hd",
                "speech-2.6-turbo",
                "speech-02-hd",
                "speech-02-turbo",
                "speech-01-hd",
                "speech-01-turbo",
            ]
        );
    }

    #[tokio::test]
    async fn discovers_provider_models_and_voices_through_provider_contracts() {
        for kind in [
            TtsProviderKind::Volcengine,
            TtsProviderKind::Doubao,
            TtsProviderKind::FishAudio,
        ] {
            assert!(
                !discover_models(&profile(kind, "https://example.test"), None)
                    .await
                    .unwrap()
                    .is_empty()
            );
        }

        let (endpoint, model_server) = test_server(vec![http_response(
            "application/json",
            br#"[{"model_id":"z","can_do_text_to_speech":true},{"model_id":"a","can_do_text_to_speech":false},{"model_id":"a","can_do_text_to_speech":true}]"#,
        )])
        .await;
        let models = discover_models(
            &profile(TtsProviderKind::ElevenLabs, &endpoint),
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(models, ["a", "z"]);
        assert_eq!(model_server.await.unwrap().len(), 1);

        let (endpoint, voice_server) = test_server(vec![http_response(
            "application/json",
            br#"{"base_resp":{"status_code":0},"system_voice":[{"voice_id":"z"},{"voice_id":"a"}],"voice_cloning":[{"voice_id":"a"}]}"#,
        )])
        .await;
        let voices = discover_voices(&profile(TtsProviderKind::MiniMax, &endpoint), Some("key"))
            .await
            .unwrap();
        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(voice_server.await.unwrap().len(), 1);

        let (endpoint, voice_server) = test_server(vec![
            http_response(
                "application/json",
                br#"{"voices":[{"voice_id":"z"}],"has_more":true,"next_page_token":"next"}"#,
            ),
            http_response(
                "application/json",
                br#"{"voices":[{"voice_id":"a"}],"has_more":false}"#,
            ),
        ])
        .await;
        let voices = discover_voices(
            &profile(TtsProviderKind::ElevenLabs, &endpoint),
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(voice_server.await.unwrap().len(), 2);

        let (endpoint, voice_server) = test_server(vec![
            http_response(
                "application/json",
                br#"{"total":101,"items":[{"_id":"z","type":"tts"}],"has_more":null}"#,
            ),
            http_response(
                "application/json",
                br#"{"total":101,"items":[{"_id":"a","type":"tts"}],"has_more":null}"#,
            ),
        ])
        .await;
        let voices = discover_voices(&profile(TtsProviderKind::FishAudio, &endpoint), Some("key"))
            .await
            .unwrap();
        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
        assert_eq!(voice_server.await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn synthesizes_provider_audio_from_official_response_shapes() {
        let request = TtsSynthesisRequest {
            profile_id: "provider".into(),
            text: "Hello".into(),
            language: Some("en-US".into()),
            voice_id: "voice".into(),
            instructions: None,
            speed: Some(1.2),
            pitch: None,
            accepted_mime_types: vec!["audio/mpeg".into()],
            cache_policy: crate::models::TtsCachePolicy::Bypass,
        };

        let (endpoint, server) = test_server(vec![http_response(
            "application/json",
            br#"{"base_resp":{"status_code":0},"data":{"audio":"494433"}}"#,
        )])
        .await;
        let audio = synthesize(
            &profile(TtsProviderKind::MiniMax, &endpoint),
            &request,
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);

        let (endpoint, server) = test_server(vec![http_response(
            "application/json",
            br#"{"code":3000,"data":"SUQz"}"#,
        )])
        .await;
        let audio = synthesize(
            &profile(TtsProviderKind::Volcengine, &endpoint),
            &request,
            Some(r#"{"appId":"app","token":"token"}"#),
        )
        .await
        .unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);

        let (endpoint, server) = test_server(vec![http_response(
            "application/json",
            br#"{"code":0,"data":"SUQz"}
{"code":20000000,"data":null}"#,
        )])
        .await;
        let audio = synthesize(
            &profile(TtsProviderKind::Doubao, &endpoint),
            &request,
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);

        let (endpoint, server) = test_server(vec![http_response("audio/mpeg", b"ID3")]).await;
        let mut eleven = profile(TtsProviderKind::ElevenLabs, &endpoint);
        eleven.model = Some("eleven_turbo_v2_5".into());
        let audio = synthesize(&eleven, &request, Some("key")).await.unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);

        let (endpoint, server) = test_server(vec![http_response("audio/mpeg", b"ID3")]).await;
        let audio = synthesize(
            &profile(TtsProviderKind::FishAudio, &endpoint),
            &request,
            Some("key"),
        )
        .await
        .unwrap();
        assert_eq!(audio.bytes, b"ID3");
        assert_eq!(server.await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn provider_dispatch_rejects_missing_credentials_and_unsupported_discovery() {
        let request = TtsSynthesisRequest {
            profile_id: "provider".into(),
            text: "Hello".into(),
            language: None,
            voice_id: "voice".into(),
            instructions: None,
            speed: None,
            pitch: None,
            accepted_mime_types: vec![],
            cache_policy: crate::models::TtsCachePolicy::Bypass,
        };
        let provider = profile(TtsProviderKind::MiniMax, "https://example.test");
        assert!(synthesize(&provider, &request, None).await.is_err());
        assert!(discover_voices(&provider, None).await.is_err());

        let openai = profile(TtsProviderKind::OpenAiCompatible, "https://example.test");
        assert!(matches!(
            discover_voices(&openai, Some("key")).await,
            Err(CoreError::Tts {
                kind: TtsErrorKind::Configuration,
                ..
            })
        ));
        assert!(matches!(
            synthesize(&openai, &request, Some("key")).await,
            Err(CoreError::Tts {
                kind: TtsErrorKind::Configuration,
                ..
            })
        ));
    }

    #[test]
    fn rejects_invalid_provider_responses_and_maps_all_formats() {
        assert!(decode_minimax_audio(br#"{"base_resp":{"status_code":1}}"#).is_err());
        assert!(decode_minimax_audio(br#"{"base_resp":{"status_code":0}}"#).is_err());
        assert!(decode_volcengine_v1_audio(br#"{"code":1,"data":""}"#).is_err());
        assert!(decode_volcengine_audio(br#"{"code":0,"data":"not-base64"}"#).is_err());
        assert!(decode_volcengine_audio(br#"{"code":0}"#).is_err());
        assert_eq!(volcengine_format(TtsAudioFormat::Opus), "ogg_opus");
        assert_eq!(volcengine_format(TtsAudioFormat::Wav), "wav");
        assert_eq!(volcengine_format(TtsAudioFormat::Flac), "mp3");
        assert_eq!(volcengine_v1_format(TtsAudioFormat::Wav), "wav");
        assert_eq!(volcengine_v1_format(TtsAudioFormat::Opus), "mp3");
        let mut unsupported = profile(TtsProviderKind::MiniMax, "https://example.test");
        unsupported.options.response_format = TtsAudioFormat::Aac;
        assert!(audio_format(&unsupported).is_err());
    }

    fn profile(kind: TtsProviderKind, endpoint: &str) -> TtsProviderProfile {
        TtsProviderProfile {
            id: "provider".into(),
            name: "Native".into(),
            kind,
            endpoint: endpoint.into(),
            model: Some("seed-tts-2.0".into()),
            credential_reference: None,
            options: crate::models::TtsProviderOptions {
                kind,
                response_format: TtsAudioFormat::Mp3,
                instructions: None,
                voices: vec!["voice".into()],
            },
            voice_names: Default::default(),
            revision: 1,
        }
    }

    #[test]
    fn parses_minimax_group_id_from_json_or_endpoint() {
        let minimax_profile = profile(TtsProviderKind::MiniMax, "https://api.minimaxi.com/v1");
        let credential =
            parse_minimax_credential(&minimax_profile, r#"{"apiKey":"key","groupId":"group"}"#)
                .unwrap();
        assert_eq!(credential.api_key, "key");
        assert_eq!(credential.group_id.as_deref(), Some("group"));

        let endpoint_profile = profile(
            TtsProviderKind::MiniMax,
            "https://api.minimaxi.com/v1?GroupId=query-group",
        );
        let credential = parse_minimax_credential(&endpoint_profile, "key").unwrap();
        assert_eq!(credential.group_id.as_deref(), Some("query-group"));
    }

    #[test]
    fn accepts_plain_minimax_api_keys_without_group_id() {
        let minimax_profile = profile(TtsProviderKind::MiniMax, "https://api.minimaxi.com/v1");
        let credential = parse_minimax_credential(&minimax_profile, "key").unwrap();
        assert_eq!(credential.api_key, "key");
        assert_eq!(credential.group_id, None);
    }

    #[test]
    fn does_not_append_empty_minimax_group_id() {
        let minimax_profile = profile(TtsProviderKind::MiniMax, "https://api.minimaxi.com/v1");
        let endpoint = minimax_endpoint(&minimax_profile, "/v1/t2a_v2", None).unwrap();
        assert_eq!(endpoint.query(), None);
    }

    #[test]
    fn supports_doubao_api_key_and_legacy_credentials() {
        let api_key = parse_doubao_credential(r#"{"api_key":"key"}"#).unwrap();
        assert_eq!(api_key.api_key.as_deref(), Some("key"));
        assert!(api_key.app_id.is_none());

        let legacy = parse_doubao_credential(r#"{"appId":"app","accessKey":"access"}"#).unwrap();
        assert_eq!(legacy.app_id.as_deref(), Some("app"));
        assert_eq!(legacy.access_key.as_deref(), Some("access"));
    }

    #[test]
    fn nests_doubao_context_texts_under_additions() {
        let mut profile = profile(TtsProviderKind::Doubao, "https://openspeech.bytedance.com");
        profile.options.instructions = Some("Speak calmly".into());
        let request = TtsSynthesisRequest {
            profile_id: profile.id.clone(),
            text: "Hello".into(),
            language: None,
            voice_id: "voice".into(),
            instructions: None,
            speed: Some(1.2),
            pitch: None,
            accepted_mime_types: vec![],
            cache_policy: crate::models::TtsCachePolicy::Bypass,
        };
        let body = doubao_request_body(&profile, &request, TtsAudioFormat::Mp3);
        let additions: Value = serde_json::from_str(
            body["req_params"]["additions"]
                .as_str()
                .expect("additions must be a JSON string"),
        )
        .unwrap();
        assert_eq!(additions["context_texts"][0], "Speak calmly");
        assert!(body["req_params"].get("context_texts").is_none());
    }

    #[test]
    fn accepts_volcengine_v1_success_code_3000() {
        let audio = decode_volcengine_v1_audio(br#"{"code":3000,"data":"SUQz"}"#).unwrap();

        assert_eq!(audio, b"ID3");
    }

    #[test]
    fn concatenates_volcengine_v3_base64_chunks() {
        let audio = decode_volcengine_audio(
            br#"{"code":0,"data":"SUQz"}
{"code":20000000,"data":"VFRZ"}"#,
        )
        .unwrap();

        assert_eq!(audio, b"ID3TTY");
    }

    #[test]
    fn skips_sse_event_lines_when_decoding_volcengine_audio() {
        let audio = decode_volcengine_audio(
            br#"event: 352
data: {"code":0,"data":"SUQz"}

event: 152
data: {"code":20000000,"data":null}"#,
        )
        .unwrap();

        assert_eq!(audio, b"ID3");
    }

    #[test]
    fn parses_and_deduplicates_elevenlabs_voices() {
        let voices = decode_eleven_voice_list(
            br#"{"voices":[{"voice_id":"z"},{"voice_id":"a","labels":{"gender":"female"}},{"voice_id":"a"}]}"#,
        )
        .unwrap();

        assert_eq!(voices.len(), 2);
        assert_eq!(voices[0].id, "a");
        assert_eq!(voices[0].gender.as_deref(), Some("female"));
        assert_eq!(voices[1].id, "z");
    }

    #[test]
    fn reads_elevenlabs_pagination_metadata() {
        let page = decode_eleven_voice_page(
            br#"{"voices":[{"voice_id":"a"}],"has_more":true,"next_page_token":"next"}"#,
        )
        .unwrap();

        assert!(page.has_more);
        assert_eq!(page.next_page_token.as_deref(), Some("next"));
        assert_eq!(page.voices[0].id, "a");
    }

    #[test]
    fn omits_elevenlabs_language_for_multilingual_v2() {
        assert_eq!(
            eleven_language_code(Some("zh-CN"), "eleven_multilingual_v2"),
            None
        );
        assert_eq!(
            eleven_language_code(Some("zh-CN"), "eleven_turbo_v2_5").as_deref(),
            Some("zh")
        );
    }

    #[test]
    fn parses_and_deduplicates_fish_audio_voices() {
        let voices =
            decode_fish_voice_list(br#"{"items":[{"_id":"z"},{"_id":"a"},{"_id":"a"}]}"#).unwrap();

        assert_eq!(
            voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["a", "z"]
        );
    }

    #[test]
    fn filters_fish_audio_service_models_from_voice_catalog() {
        let page = decode_fish_voice_page(
            br#"{"items":[{"_id":"svc","type":"svc"},{"_id":"tts","type":"tts","languages":["zh"]}],"has_more":false}"#,
            1,
        )
        .unwrap();

        assert!(!page.has_more);
        assert_eq!(page.voices.len(), 1);
        assert_eq!(page.voices[0].id, "tts");
        assert_eq!(page.voices[0].language, "zh");
    }

    #[test]
    fn infers_fish_audio_pagination_when_has_more_is_null() {
        let first = decode_fish_voice_page(
            br#"{"total":101,"items":[{"_id":"first"}],"has_more":null}"#,
            1,
        )
        .unwrap();
        let second = decode_fish_voice_page(
            br#"{"total":101,"items":[{"_id":"last"}],"has_more":null}"#,
            2,
        )
        .unwrap();

        assert!(first.has_more);
        assert!(!second.has_more);
    }

    #[test]
    fn preserves_custom_endpoint_path_prefixes() {
        let profile = TtsProviderProfile {
            id: "fish".into(),
            name: "Fish".into(),
            kind: TtsProviderKind::FishAudio,
            endpoint: "https://proxy.example/tts/v1".into(),
            model: Some("s2.1-pro-free".into()),
            credential_reference: None,
            options: crate::models::TtsProviderOptions {
                kind: TtsProviderKind::FishAudio,
                response_format: TtsAudioFormat::Mp3,
                instructions: None,
                voices: vec!["voice".into()],
            },
            voice_names: Default::default(),
            revision: 1,
        };

        assert_eq!(
            provider_url(&profile, "/v1/tts").unwrap().path(),
            "/tts/v1/tts"
        );

        let mut proxy_profile = profile;
        proxy_profile.endpoint = "https://proxy.example/speech/api/v3".into();
        assert_eq!(
            provider_url(&proxy_profile, "/api/v3/tts/unidirectional")
                .unwrap()
                .path(),
            "/speech/api/v3/tts/unidirectional"
        );
        proxy_profile.endpoint = "https://proxy.example".into();
        assert_eq!(
            provider_url(&proxy_profile, "/v1/tts").unwrap().path(),
            "/v1/tts"
        );
        proxy_profile.endpoint = "https://proxy.example/v1/tts".into();
        assert_eq!(
            provider_url(&proxy_profile, "/v1/tts").unwrap().path(),
            "/v1/tts"
        );
    }

    async fn test_server(responses: Vec<Vec<u8>>) -> (String, JoinHandle<Vec<Vec<u8>>>) {
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
                    if request_complete(&request) {
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

    fn request_complete(request: &[u8]) -> bool {
        let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n") else {
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

    fn http_response(content_type: &str, body: &[u8]) -> Vec<u8> {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes()
        .into_iter()
        .chain(body.iter().copied())
        .collect()
    }
}
