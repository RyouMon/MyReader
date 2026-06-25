//! Command-layer integration tests for `src/commands/cache.rs`.
//!
//! These are wire-up smoke tests — `CacheService` operates on a process-global cache
//! root (`std::env::temp_dir().join("myreader")`) which is shared across tests. We
//! assert response shape and `max_bytes` math, not absolute byte counts.

use serde_json::json;

use my_reader_lib::models::AppConfig;

use crate::common::app::TestApp;
use crate::common::ipc::invoke_ok;

// `CacheUsageDto` is `Serialize`-only on the Rust side, so we read it via a
// transparent JSON shape in tests rather than naming the type.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CacheUsageView {
    total_bytes: u64,
    max_bytes: u64,
}

#[tokio::test]
async fn get_cache_usage_should_compute_max_bytes_from_config_when_invoked() {
    let mut config = AppConfig::default();
    config.reader_ui.cache.max_cache_size_mb = 7;
    let app = TestApp::with_config(config);

    let usage: CacheUsageView = invoke_ok(&app, "get_cache_usage", json!({}));

    // 7 MiB = 7 * 1024 * 1024 bytes.
    assert_eq!(usage.max_bytes, 7 * 1024 * 1024);
    // total_bytes is a u64; just ensure it deserialized (any value is fine — the cache
    // root is shared, we don't make claims about its size).
    let _ = usage.total_bytes;
}

#[tokio::test]
async fn clear_cache_should_return_ok_when_invoked() {
    let app = TestApp::new();
    let _: () = invoke_ok(&app, "clear_cache", json!({}));
}

#[tokio::test]
async fn enforce_cache_limit_should_return_ok_when_invoked() {
    let mut config = AppConfig::default();
    config.reader_ui.cache.max_cache_size_mb = 64;
    let app = TestApp::with_config(config);

    let _: () = invoke_ok(&app, "enforce_cache_limit", json!({}));
}
