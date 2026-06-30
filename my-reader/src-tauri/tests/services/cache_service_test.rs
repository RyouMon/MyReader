use std::sync::{Mutex, OnceLock};

use my_reader_lib::cache;
use my_reader_lib::models::AppConfig;
use my_reader_lib::services::cache_service::CacheService;

fn cache_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[test]
fn get_cache_usage_should_derive_max_bytes_from_config() {
    let _guard = cache_lock().lock().unwrap_or_else(|e| e.into_inner());
    let mut config = AppConfig::default();
    config.reader_ui.cache.max_cache_size_mb = 100;

    let usage = CacheService::get_cache_usage(&config).expect("should compute usage");

    assert_eq!(usage.max_bytes, 100 * 1024 * 1024);
}

#[test]
fn clear_cache_should_remove_existing_cache_and_recreate_extracted_root() {
    let _guard = cache_lock().lock().unwrap_or_else(|e| e.into_inner());
    let root = cache::reader_cache_root();
    let file_path = root.join("service-clear.txt");
    std::fs::create_dir_all(&root).expect("create cache root");
    std::fs::write(&file_path, b"cached").expect("write cache file");

    CacheService::clear_cache().expect("clear should succeed");

    assert!(!file_path.exists());
    assert!(cache::reader_cache_extracted_root().is_dir());
}

#[test]
fn enforce_cache_limit_should_clear_cache_when_limit_is_zero_or_negative() {
    let _guard = cache_lock().lock().unwrap_or_else(|e| e.into_inner());
    let root = cache::reader_cache_root();
    let file_path = root.join("service-enforce-zero.txt");
    std::fs::create_dir_all(&root).expect("create cache root");
    std::fs::write(&file_path, b"cached").expect("write cache file");
    let mut config = AppConfig::default();
    config.reader_ui.cache.max_cache_size_mb = 0;

    CacheService::enforce_cache_limit(&config).expect("enforce should succeed");

    assert!(!file_path.exists());
    assert!(cache::reader_cache_extracted_root().is_dir());
}

#[test]
fn enforce_cache_limit_should_remove_old_files_until_under_non_zero_limit() {
    let _guard = cache_lock().lock().unwrap_or_else(|e| e.into_inner());
    CacheService::clear_cache().expect("clear should succeed");
    let root = cache::reader_cache_root();
    let first = root.join("service-enforce-first.bin");
    let second = root.join("service-enforce-second.bin");
    std::fs::write(&first, vec![1; 700 * 1024]).expect("write first cache file");
    std::thread::sleep(std::time::Duration::from_millis(5));
    std::fs::write(&second, vec![2; 700 * 1024]).expect("write second cache file");
    let mut config = AppConfig::default();
    config.reader_ui.cache.max_cache_size_mb = 1;

    CacheService::enforce_cache_limit(&config).expect("enforce should succeed");

    let remaining = [first.exists(), second.exists()]
        .into_iter()
        .filter(|exists| *exists)
        .count();
    assert_eq!(remaining, 1);
    CacheService::clear_cache().expect("clear should succeed");
}
