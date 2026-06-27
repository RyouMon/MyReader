//! `TestApp` — a thin wrapper around `tauri::test::mock_builder()` that registers every
//! command in `commands::` and seeds the same state set as `lib::run()`.
//!
//! Usage:
//!
//! ```ignore
//! let app = TestApp::new();
//! let libraries: Vec<LibraryInfo> = invoke_ok(&app, "list_libraries", json!({}));
//! ```
//!
//! Constraints:
//! - `mock_app_handle()` requires the tauri `test` feature (already in `[dev-dependencies]`).
//! - On Windows, integration tests using `mock_builder()` hit
//!   `STATUS_ENTRYPOINT_NOT_FOUND` (tauri-apps/tauri#13419). Run via WSL.
//! - Each `TestApp` gets a fresh in-memory `AppConfig`. The `app_data_dir` returned by
//!   `app.path().app_data_dir()` is the default mock path — tests must use
//!   `seed_config_file` / `read_persisted_config` from `common::config` rather than
//!   poking the path directly.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, OnceLock};

use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::{App, Manager};
use tokio::sync::RwLock;

use my_reader_lib::commands::AppState;
use my_reader_lib::models::AppConfig;
use my_reader_lib::services::download_service::DownloadService;
use my_reader_lib::streamer::StreamerState;

/// `mock_context()` hands every mock app the same `app_data_dir` (its identifier is hardcoded
/// to `com.tauri.dev`), so concurrent tests would race on `config.json`. We serialize TestApp
/// construction + lifetime with a process-wide mutex, and wipe the dir on each acquisition so
/// the previous test's residue doesn't leak in.
fn app_data_dir_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub struct TestApp {
    pub app: App<MockRuntime>,
    // Held for the lifetime of the TestApp so the next test sees a clean dir.
    _dir_guard: MutexGuard<'static, ()>,
}

impl TestApp {
    /// Build an app with an empty `AppConfig` and a fresh mock runtime.
    pub fn new() -> Self {
        Self::with_config(AppConfig::default())
    }

    /// Build an app pre-seeded with the given `AppConfig`. Useful when the test needs
    /// libraries / data sources to already exist before invoking commands.
    pub fn with_config(config: AppConfig) -> Self {
        // Take the global app-data-dir lock for the lifetime of this TestApp. Released
        // when the TestApp drops, letting the next test (in any thread) proceed.
        let dir_guard = app_data_dir_lock()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        // We route through `tauri_specta::collect_commands!` rather than
        // `tauri::generate_handler!` because the former accepts the turbofish
        // (`::<MockRuntime>`) syntax that `tauri::generate_handler!` rejects with
        // "generic arguments in macro path".
        let specta_builder = tauri_specta::Builder::<MockRuntime>::new()
            .dangerously_cast_bigints_to_number()
            .commands(tauri_specta::collect_commands![
                my_reader_lib::commands::library::list_libraries,
                my_reader_lib::commands::library::add_library::<MockRuntime>,
                my_reader_lib::commands::library::add_webdav_library::<MockRuntime>,
                my_reader_lib::commands::library::add_onedrive_library::<MockRuntime>,
                my_reader_lib::commands::library::refresh_library,
                my_reader_lib::commands::library::refresh_webdav_library::<MockRuntime>,
                my_reader_lib::commands::library::refresh_onedrive_library::<MockRuntime>,
                my_reader_lib::commands::library::remove_library::<MockRuntime>,
                my_reader_lib::commands::library::switch_library::<MockRuntime>,
                my_reader_lib::commands::library::get_active_library_id,
                my_reader_lib::commands::source::list_data_sources,
                my_reader_lib::commands::source::test_webdav_connection,
                my_reader_lib::commands::source::add_local_data_source::<MockRuntime>,
                my_reader_lib::commands::source::add_webdav_data_source::<MockRuntime>,
                my_reader_lib::commands::source::remove_data_source::<MockRuntime>,
                my_reader_lib::commands::source::webdav_list_folders,
                my_reader_lib::commands::source::onedrive_start_auth,
                my_reader_lib::commands::source::add_onedrive_data_source::<MockRuntime>,
                my_reader_lib::commands::source::onedrive_list_folders,
                my_reader_lib::commands::book::get_books::<MockRuntime>,
                my_reader_lib::commands::book::get_books_page::<MockRuntime>,
                my_reader_lib::commands::book::get_book_detail::<MockRuntime>,
                my_reader_lib::commands::book::get_series_books::<MockRuntime>,
                my_reader_lib::commands::favorite::list_favorite_book_ids::<MockRuntime>,
                my_reader_lib::commands::favorite::add_favorite_book::<MockRuntime>,
                my_reader_lib::commands::favorite::remove_favorite_book::<MockRuntime>,
                my_reader_lib::commands::progress::get_reading_progress::<MockRuntime>,
                my_reader_lib::commands::progress::set_reading_progress::<MockRuntime>,
                my_reader_lib::commands::reader::get_reader_ui_preferences,
                my_reader_lib::commands::reader::set_reader_ui_preferences::<MockRuntime>,
                my_reader_lib::commands::reader::prepare_book_source::<MockRuntime>,
                my_reader_lib::commands::reader::write_epub_readium_manifest,
                my_reader_lib::commands::reader::close_book_streamer,
                my_reader_lib::commands::cache::get_cache_usage,
                my_reader_lib::commands::cache::clear_cache,
                my_reader_lib::commands::cache::enforce_cache_limit,
                my_reader_lib::commands::sync::sync_db_for_library::<MockRuntime>,
                my_reader_lib::commands::download::check_book_file_state::<MockRuntime>,
                my_reader_lib::commands::download::download_book_file::<MockRuntime>,
                my_reader_lib::commands::download::delete_local_book_file::<MockRuntime>,
                my_reader_lib::commands::download::cancel_book_download,
            ]);

        let app = mock_builder()
            .invoke_handler(specta_builder.invoke_handler())
            .build(mock_context(noop_assets()))
            .expect("mock app should build");

        // Wipe any state left behind by a previous TestApp using the same identifier.
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = std::fs::remove_dir_all(&dir);
        }

        // Mirror `lib::run()`'s manage() set.
        app.manage::<AppState>(Mutex::new(config));
        app.manage(StreamerState::new(RwLock::new(HashMap::new())));
        app.manage(DownloadService::new());

        Self { app, _dir_guard: dir_guard }
    }

    /// Snapshot the current `AppConfig` from the managed state. Tests use this to assert
    /// in-memory mutations after invoking a command.
    pub fn config_snapshot(&self) -> AppConfig {
        self.app
            .state::<AppState>()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Resolve `app_data_dir` exactly as the production code does. The mock runtime
    /// returns a deterministic path under the OS temp dir.
    pub fn app_data_dir(&self) -> std::path::PathBuf {
        self.app
            .path()
            .app_data_dir()
            .expect("mock runtime should resolve app_data_dir")
    }
}

impl Default for TestApp {
    fn default() -> Self {
        Self::new()
    }
}
