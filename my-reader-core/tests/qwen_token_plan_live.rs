//! Opt-in cloud verification. Never runs in the offline regression suite.
//! QWEN_API_KEY=... cargo test -p my-reader-core --test qwen_token_plan_live -- --ignored --nocapture

use my_reader_core::{
    api::tts::TtsService,
    models::{
        TtsAudioFormat, TtsCachePolicy, TtsProviderKind, TtsProviderOptions, TtsProviderProfile,
        TtsSynthesisRequest,
    },
};

#[tokio::test]
#[ignore = "requires an explicitly provided Token Plan key and consumes speech quota"]
async fn token_plan_synthesizes_selected_voices_into_playable_audio() {
    let credential = std::env::var("QWEN_API_KEY").expect("QWEN_API_KEY is required");
    let output = tempfile::Builder::new()
        .prefix("myreader-qwen-token-plan-")
        .tempdir()
        .unwrap();
    let config_path = output.path().join("config.json");
    for (voice, format) in [
        ("longanhuan_v3.6", TtsAudioFormat::Mp3),
        ("longanlingxin", TtsAudioFormat::Wav),
        ("longanlufeng", TtsAudioFormat::Opus),
    ] {
        TtsService::upsert_profile(
            &config_path,
            TtsProviderProfile {
                id: "qwen-live".into(),
                name: "Qwen live verification".into(),
                kind: TtsProviderKind::Qwen,
                enabled: true,
                endpoint: String::new(),
                model: Some("qwen-audio-3.0-tts-plus".into()),
                credential_reference: None,
                options: TtsProviderOptions::Qwen {
                    response_format: format,
                    instructions: None,
                    voices: vec![voice.into()],
                    default_voice: Some(voice.into()),
                },
                revision: 1,
            },
        )
        .unwrap();
        let artifact = TtsService::synthesize(
            &config_path,
            output.path(),
            TtsSynthesisRequest {
                profile_id: "qwen-live".into(),
                text: "欢迎使用 MyReader。Hello, happy reading!".into(),
                language: Some("zh-CN".into()),
                voice_id: voice.into(),
                speed: Some(1.0),
                pitch: None,
                accepted_mime_types: vec![format.mime_type().into()],
                cache_policy: TtsCachePolicy::Bypass,
            },
            Some(credential.trim()),
        )
        .await
        .unwrap();
        assert_eq!(artifact.mime_type, format.mime_type());
        assert!(std::fs::metadata(&artifact.path).unwrap().len() > 1024);
        println!(
            "verified voice={voice} format={} artifact={}",
            format.as_str(),
            artifact.path
        );
    }
    // Retain only test configuration and audio for platform decoder verification.
    // The key is never part of the profile or the retained artifacts.
    println!("audio artifacts: {}", output.keep().display());
}
