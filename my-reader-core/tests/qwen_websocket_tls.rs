use my_reader_core::{
    api::tts::TtsService,
    models::{
        TtsAudioFormat, TtsCachePolicy, TtsProviderKind, TtsProviderOptions, TtsProviderProfile,
        TtsSynthesisRequest,
    },
    CoreError, TtsErrorKind,
};
use tokio::{io::AsyncReadExt, net::TcpListener};

// Keep this in its own test process: another client installing a global rustls
// provider would hide the desktop's mixed ring/aws-lc feature regression.
#[tokio::test]
async fn websocket_tls_reports_handshake_errors_without_a_global_crypto_provider() {
    assert!(rustls::crypto::CryptoProvider::get_default().is_none());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!(
        "wss://{}/api-ws/v1/inference",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut record = [0; 5];
        // Close after ClientHello to force an ordinary TLS transport error.
        socket.read_exact(&mut record).await.map(|_| record)
    });
    let dir = tempfile::tempdir().unwrap();
    let config_path = dir.path().join("config.json");
    TtsService::upsert_profile(
        &config_path,
        TtsProviderProfile {
            id: "qwen-tls".into(),
            name: "Qwen TLS regression".into(),
            kind: TtsProviderKind::Qwen,
            enabled: true,
            endpoint,
            model: Some("qwen-audio-3.0-tts-plus".into()),
            credential_reference: None,
            options: TtsProviderOptions::Qwen {
                response_format: TtsAudioFormat::Mp3,
                instructions: None,
                voices: vec!["longanhuan_v3.6".into()],
                default_voice: Some("longanhuan_v3.6".into()),
            },
            revision: 1,
        },
    )
    .unwrap();
    let client = tokio::spawn(async move {
        TtsService::synthesize(
            &config_path,
            dir.path(),
            TtsSynthesisRequest {
                profile_id: "qwen-tls".into(),
                text: "Hello".into(),
                language: None,
                voice_id: "longanhuan_v3.6".into(),
                speed: None,
                pitch: None,
                accepted_mime_types: vec!["audio/mpeg".into()],
                cache_policy: TtsCachePolicy::Bypass,
            },
            Some("test-credential"),
        )
        .await
    });
    let result = tokio::time::timeout(std::time::Duration::from_secs(5), client)
        .await
        .expect("a failed TLS handshake must finish promptly")
        .expect("TLS initialization must return an error instead of panicking");
    assert!(matches!(
        result,
        Err(CoreError::Tts {
            kind: TtsErrorKind::Network,
            ..
        })
    ));
    assert_eq!(server.await.unwrap().unwrap()[0], 0x16);
    assert!(rustls::crypto::CryptoProvider::get_default().is_none());
}
