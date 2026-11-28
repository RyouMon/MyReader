//! Opt-in live verification against real TTS provider accounts or local servers.
//! Never runs in the offline regression suite.
//!
//! Credentials can be passed as environment variables OR stored in the gitignored
//! `<workspace>/.env.tts.local` file (process env vars take precedence).
//!
//! Run every provider configured in `.env.tts.local` (skipping unconfigured ones):
//!   cargo test -p my-reader-core --test tts_providers_live all_configured_live -- --ignored --nocapture
//!
//! Or run a single provider:
//!   cargo test -p my-reader-core --test tts_providers_live minimax_live -- --ignored --nocapture
//!   cargo test -p my-reader-core --test tts_providers_live minimax_global_live -- --ignored --nocapture
//!   cargo test -p my-reader-core --test tts_providers_live volcengine_live -- --ignored --nocapture
//!   cargo test -p my-reader-core --test tts_providers_live elevenlabs_live -- --ignored --nocapture
//!   cargo test -p my-reader-core --test tts_providers_live fish_audio_live -- --ignored --nocapture
//!   cargo test -p my-reader-core --test tts_providers_live gemini_live -- --ignored --nocapture
//!   cargo test -p my-reader-core --test tts_providers_live openai_compatible_live -- --ignored --nocapture

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use my_reader_core::{
    api::tts::TtsService,
    models::{
        TtsAudioFormat, TtsCachePolicy, TtsProviderKind, TtsProviderOptions, TtsProviderProfile,
        TtsSynthesisRequest,
    },
};

fn local_env_map() -> &'static BTreeMap<String, String> {
    static CACHE: OnceLock<BTreeMap<String, String>> = OnceLock::new();
    CACHE.get_or_init(|| {
        let path = std::env::var("TTS_LIVE_ENV_FILE")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env.tts.local"));
        let Ok(content) = std::fs::read_to_string(path) else {
            return BTreeMap::new();
        };
        parse_dotenv(&content)
    })
}

fn parse_dotenv(content: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").map_or(line, str::trim_start);
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = strip_matching_quotes(value.trim());
        if !key.is_empty() && !value.is_empty() {
            map.insert(key.to_owned(), value.to_owned());
        }
    }
    map
}

fn strip_matching_quotes(value: &str) -> &str {
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

fn env_opt(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .or_else(|| local_env_map().get(name).cloned())
}

struct LiveCase {
    label: &'static str,
    prefix: &'static str,
    kind: TtsProviderKind,
    endpoint: String,
    model: Option<String>,
    voice_override: Option<String>,
    fallback_voice: &'static str,
    format: TtsAudioFormat,
    credential: Option<String>,
    language: &'static str,
    text: &'static str,
    check_models: bool,
    check_voices: bool,
}

async fn run_live_case(case: LiveCase) -> Result<String, String> {
    let output = tempfile::Builder::new()
        .prefix(case.prefix)
        .tempdir()
        .map_err(|error| format!("tempdir: {error}"))?;
    let config_path = output.path().join("config.json");
    let cred = case.credential.as_deref();

    let mut profile = TtsProviderProfile {
        id: format!("{}-live", case.kind.as_str()),
        name: format!("{} live verification", case.kind.default_name()),
        kind: case.kind,
        endpoint: case.endpoint,
        model: case
            .model
            .or_else(|| case.kind.default_model().map(str::to_owned)),
        credential_reference: None,
        options: TtsProviderOptions {
            kind: case.kind,
            response_format: case.format,
            instructions: None,
            voices: vec![case.fallback_voice.into()],
        },
        voice_names: BTreeMap::new(),
        revision: 1,
    };

    let mut step_errors = Vec::new();
    if case.check_models {
        match TtsService::discover_models(&profile, cred).await {
            Ok(models) => {
                println!(
                    "[{}] discovered {} models (sample={:?})",
                    case.label,
                    models.len(),
                    models.first()
                );
                if models.is_empty() {
                    step_errors.push("discover_models returned an empty list".into());
                }
            }
            Err(error) => {
                let message = format!("discover_models failed: {error:?}");
                println!("[{}] WARN {message}", case.label);
                step_errors.push(message);
            }
        }
    }

    let discovered_voice = if case.check_voices {
        match TtsService::discover_voices(&profile, cred).await {
            Ok(voices) => {
                println!(
                    "[{}] discovered {} voices (sample={:?})",
                    case.label,
                    voices.len(),
                    voices.first()
                );
                voices.into_iter().next().map(|voice| voice.id)
            }
            Err(error) => {
                let message = format!("discover_voices failed: {error:?}");
                println!("[{}] WARN {message}", case.label);
                step_errors.push(message);
                None
            }
        }
    } else {
        None
    };

    let voice = case
        .voice_override
        .or(discovered_voice)
        .unwrap_or_else(|| case.fallback_voice.into());
    profile.options.voices = vec![voice.clone()];

    TtsService::upsert_profile(&config_path, profile.clone())
        .map_err(|error| format!("upsert_profile failed: {error:?}"))?;

    let artifact = TtsService::synthesize(
        &config_path,
        output.path(),
        TtsSynthesisRequest {
            profile_id: profile.id,
            text: case.text.into(),
            language: Some(case.language.into()),
            voice_id: voice.clone(),
            speed: Some(1.0),
            pitch: None,
            instructions: None,
            accepted_mime_types: vec![case.format.mime_type().into()],
            cache_policy: TtsCachePolicy::Bypass,
        },
        cred,
    )
    .await
    .map_err(|error| {
        let synth = format!("synthesize failed (voice={voice}): {error:?}");
        if step_errors.is_empty() {
            synth
        } else {
            format!("{}; {synth}", step_errors.join("; "))
        }
    })?;

    if artifact.mime_type != case.format.mime_type() {
        return Err(format!(
            "unexpected mime_type: got {}, expected {}",
            artifact.mime_type,
            case.format.mime_type()
        ));
    }
    let size = std::fs::metadata(&artifact.path)
        .map_err(|error| format!("stat artifact failed: {error}"))?
        .len();
    if size <= 1024 {
        return Err(format!(
            "audio artifact too small ({size} bytes): {}",
            artifact.path
        ));
    }

    // Retain only test configuration and audio for manual playback inspection.
    // Credentials are never persisted in config.json or retained artifacts.
    let kept = output.keep();
    let summary = format!(
        "PASS [{}] model={:?} voice={voice} format={} bytes={size} artifact={} dir={}",
        case.label,
        profile.model,
        case.format.as_str(),
        artifact.path,
        kept.display()
    );
    println!("{summary}");
    if !step_errors.is_empty() {
        return Err(format!(
            "synthesis succeeded ({size} bytes), but discovery had errors: {}",
            step_errors.join("; ")
        ));
    }
    Ok(summary)
}

fn build_minimax_cn() -> Option<LiveCase> {
    let key = env_opt("MINIMAX_CN_API_KEY").or_else(|| env_opt("MINIMAX_API_KEY"))?;
    Some(LiveCase {
        label: "minimax_cn",
        prefix: "myreader-minimax-cn-live-",
        kind: TtsProviderKind::MiniMax,
        endpoint: env_opt("MINIMAX_CN_ENDPOINT")
            .or_else(|| env_opt("MINIMAX_ENDPOINT"))
            .unwrap_or_else(|| TtsProviderKind::MiniMax.default_endpoint().into()),
        model: env_opt("MINIMAX_CN_MODEL").or_else(|| env_opt("MINIMAX_MODEL")),
        voice_override: env_opt("MINIMAX_CN_VOICE").or_else(|| env_opt("MINIMAX_VOICE")),
        fallback_voice: "male-qn-qingse",
        format: TtsAudioFormat::Mp3,
        credential: Some(key),
        language: "zh-CN",
        text: "欢迎使用 MyReader。Hello, happy reading!",
        check_models: true,
        check_voices: true,
    })
}

fn build_minimax_global() -> Option<LiveCase> {
    let key = env_opt("MINIMAX_GLOBAL_API_KEY")?;
    Some(LiveCase {
        label: "minimax_global",
        prefix: "myreader-minimax-global-live-",
        kind: TtsProviderKind::MiniMax,
        endpoint: env_opt("MINIMAX_GLOBAL_ENDPOINT")
            .unwrap_or_else(|| "https://api.minimax.io".into()),
        model: env_opt("MINIMAX_GLOBAL_MODEL"),
        voice_override: env_opt("MINIMAX_GLOBAL_VOICE"),
        fallback_voice: "male-qn-qingse",
        format: TtsAudioFormat::Mp3,
        credential: Some(key),
        language: "en-US",
        text: "Hello from MyReader. Happy reading!",
        check_models: true,
        check_voices: true,
    })
}

fn build_volcengine() -> Option<LiveCase> {
    let credential = env_opt("VOLCENGINE_API_KEY").or_else(|| {
        let app_id = env_opt("VOLCENGINE_APP_ID")?;
        let access_key = env_opt("VOLCENGINE_ACCESS_KEY")?;
        Some(format!("{app_id}:{access_key}"))
    })?;
    Some(LiveCase {
        label: "volcengine",
        prefix: "myreader-volcengine-live-",
        kind: TtsProviderKind::Volcengine,
        endpoint: env_opt("VOLCENGINE_ENDPOINT")
            .unwrap_or_else(|| TtsProviderKind::Volcengine.default_endpoint().into()),
        model: env_opt("VOLCENGINE_MODEL"),
        voice_override: env_opt("VOLCENGINE_VOICE"),
        fallback_voice: "zh_female_vv_uranus_bigtts",
        format: TtsAudioFormat::Mp3,
        credential: Some(credential),
        language: "zh-CN",
        text: "欢迎使用 MyReader。Hello, happy reading!",
        check_models: true,
        check_voices: false,
    })
}

fn build_elevenlabs() -> Option<LiveCase> {
    let key = env_opt("ELEVENLABS_API_KEY")?;
    Some(LiveCase {
        label: "elevenlabs",
        prefix: "myreader-elevenlabs-live-",
        kind: TtsProviderKind::ElevenLabs,
        endpoint: env_opt("ELEVENLABS_ENDPOINT")
            .unwrap_or_else(|| TtsProviderKind::ElevenLabs.default_endpoint().into()),
        model: env_opt("ELEVENLABS_MODEL"),
        voice_override: env_opt("ELEVENLABS_VOICE"),
        fallback_voice: "JBFqnCBsd6RMkjVDRZzb",
        format: TtsAudioFormat::Mp3,
        credential: Some(key),
        language: "en-US",
        text: "Hello from MyReader. Happy reading!",
        check_models: true,
        check_voices: true,
    })
}

fn build_fish_audio() -> Option<LiveCase> {
    let key = env_opt("FISH_AUDIO_API_KEY")?;
    Some(LiveCase {
        label: "fish_audio",
        prefix: "myreader-fish-audio-live-",
        kind: TtsProviderKind::FishAudio,
        endpoint: env_opt("FISH_AUDIO_ENDPOINT")
            .unwrap_or_else(|| TtsProviderKind::FishAudio.default_endpoint().into()),
        model: env_opt("FISH_AUDIO_MODEL"),
        voice_override: env_opt("FISH_AUDIO_VOICE"),
        fallback_voice: "7f92f8afb8ec43bf81429cc1c9199cb1",
        format: TtsAudioFormat::Mp3,
        credential: Some(key),
        language: "zh-CN",
        text: "欢迎使用 MyReader。Hello, happy reading!",
        check_models: true,
        check_voices: true,
    })
}

fn build_gemini() -> Option<LiveCase> {
    let key = env_opt("GEMINI_API_KEY")?;
    Some(LiveCase {
        label: "gemini",
        prefix: "myreader-gemini-live-",
        kind: TtsProviderKind::Gemini,
        endpoint: env_opt("GEMINI_ENDPOINT")
            .unwrap_or_else(|| TtsProviderKind::Gemini.default_endpoint().into()),
        model: env_opt("GEMINI_MODEL"),
        voice_override: env_opt("GEMINI_VOICE"),
        fallback_voice: "Kore",
        format: TtsAudioFormat::Wav,
        credential: Some(key),
        language: "en-US",
        text: "Hello from MyReader. Happy reading!",
        check_models: true,
        check_voices: true,
    })
}

fn build_openai_compatible() -> Option<LiveCase> {
    let endpoint = env_opt("OPENAI_TTS_ENDPOINT")?;
    Some(LiveCase {
        label: "openai_compatible",
        prefix: "myreader-openai-live-",
        kind: TtsProviderKind::OpenAiCompatible,
        endpoint,
        model: env_opt("OPENAI_TTS_MODEL"),
        voice_override: env_opt("OPENAI_TTS_VOICE"),
        fallback_voice: "alloy",
        format: TtsAudioFormat::Mp3,
        credential: env_opt("OPENAI_TTS_API_KEY"),
        language: "en-US",
        text: "Hello from MyReader. Happy reading!",
        check_models: true,
        check_voices: false,
    })
}

async fn run_single(name: &str, case: Option<LiveCase>, hint: &str) {
    let case = case.unwrap_or_else(|| {
        panic!("{name} is not configured: set {hint} in .env.tts.local or environment")
    });
    if let Err(error) = run_live_case(case).await {
        panic!("{name} live verification failed: {error}");
    }
}

type CaseBuilder = fn() -> Option<LiveCase>;

#[tokio::test]
#[ignore = "runs every TTS provider configured in .env.tts.local or environment"]
async fn all_configured_live() {
    let builders: [(&str, CaseBuilder); 7] = [
        ("minimax_cn", build_minimax_cn),
        ("minimax_global", build_minimax_global),
        ("volcengine", build_volcengine),
        ("elevenlabs", build_elevenlabs),
        ("fish_audio", build_fish_audio),
        ("gemini", build_gemini),
        ("openai_compatible", build_openai_compatible),
    ];

    let mut passed = Vec::new();
    let mut failed = Vec::new();
    let mut skipped = Vec::new();

    for (name, builder) in builders {
        match builder() {
            Some(case) => match run_live_case(case).await {
                Ok(summary) => passed.push(summary),
                Err(error) => {
                    println!("FAIL [{name}] {error}");
                    failed.push(format!("{name}: {error}"));
                }
            },
            None => {
                println!("SKIP [{name}] not configured");
                skipped.push(name);
            }
        }
    }

    println!(
        "\nSummary: {} passed, {} failed, {} skipped ({:?})",
        passed.len(),
        failed.len(),
        skipped.len(),
        skipped
    );

    assert!(
        !passed.is_empty() || !failed.is_empty(),
        "No TTS providers configured in .env.tts.local or environment"
    );
    assert!(
        failed.is_empty(),
        "Live verification failed:\n{}",
        failed.join("\n")
    );
}

#[tokio::test]
#[ignore = "requires MINIMAX_API_KEY (China) and consumes MiniMax speech quota"]
async fn minimax_live() {
    run_single("minimax_cn", build_minimax_cn(), "MINIMAX_API_KEY").await;
}

#[tokio::test]
#[ignore = "requires MINIMAX_GLOBAL_API_KEY (Global) and consumes MiniMax speech quota"]
async fn minimax_global_live() {
    run_single(
        "minimax_global",
        build_minimax_global(),
        "MINIMAX_GLOBAL_API_KEY",
    )
    .await;
}

#[tokio::test]
#[ignore = "requires VOLCENGINE_API_KEY (or VOLCENGINE_APP_ID + VOLCENGINE_ACCESS_KEY) and consumes Volcengine speech quota"]
async fn volcengine_live() {
    run_single(
        "volcengine",
        build_volcengine(),
        "VOLCENGINE_API_KEY or VOLCENGINE_APP_ID+VOLCENGINE_ACCESS_KEY",
    )
    .await;
}

#[tokio::test]
#[ignore = "requires ELEVENLABS_API_KEY and consumes ElevenLabs speech quota"]
async fn elevenlabs_live() {
    run_single("elevenlabs", build_elevenlabs(), "ELEVENLABS_API_KEY").await;
}

#[tokio::test]
#[ignore = "requires FISH_AUDIO_API_KEY and consumes Fish Audio speech quota"]
async fn fish_audio_live() {
    run_single("fish_audio", build_fish_audio(), "FISH_AUDIO_API_KEY").await;
}

#[tokio::test]
#[ignore = "requires GEMINI_API_KEY and consumes Google Gemini API quota"]
async fn gemini_live() {
    run_single("gemini", build_gemini(), "GEMINI_API_KEY").await;
}

#[tokio::test]
#[ignore = "requires OPENAI_TTS_ENDPOINT (and optional OPENAI_TTS_API_KEY for cloud endpoints)"]
async fn openai_compatible_live() {
    run_single(
        "openai_compatible",
        build_openai_compatible(),
        "OPENAI_TTS_ENDPOINT",
    )
    .await;
}
