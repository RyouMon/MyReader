mod asset_scope;
pub mod commands;
mod error;
pub mod models;
mod protocols;
mod reader_ui_prefs;
pub mod repositories;
pub mod services;
mod storage_paths;
pub mod streamer;
pub mod sync;

use std::collections::HashMap;
use std::sync::Mutex;

use log::{error, info, LevelFilter};
use tauri::Manager;
use time::{macros::format_description, OffsetDateTime};
use tokio::sync::RwLock;

use commands::AppState;
use repositories::config_repo;
use streamer::StreamerState;

/// 本地日期时间 + 毫秒（无法解析本地时区时回退 UTC）。勿使用错误嵌套的 `[[[year]…]]`。
const LOG_LINE_TIMESTAMP: &[time::format_description::FormatItem<'static>] =
    format_description!("[year]-[month]-[day] [hour]:[minute]:[second].[subsecond digits:3]");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), tauri::Error> {
    let specta_builder = tauri_specta::Builder::<tauri::Wry>::new()
        .dangerously_cast_bigints_to_number()
        .commands(tauri_specta::collect_commands![
            commands::library::list_libraries,
            commands::source::list_data_sources,
            commands::source::test_webdav_connection,
            commands::library::add_library,
            commands::library::refresh_library,
            commands::source::add_local_data_source,
            commands::source::add_webdav_data_source,
            commands::library::remove_library,
            commands::source::remove_data_source,
            commands::library::switch_library,
            commands::library::get_active_library_id,
            commands::book::get_books,
            commands::book::get_books_page,
            commands::book::get_book_detail,
            commands::book::get_series_books,
            commands::progress::get_reading_progress,
            commands::progress::set_reading_progress,
            commands::book::get_book_cover,
            commands::reader::get_reader_ui_preferences,
            commands::reader::set_reader_ui_preferences,
            commands::reader::prepare_book_source,
            commands::reader::write_epub_readium_manifest,
            commands::reader::close_book_streamer,
            commands::cache::get_cache_usage,
            commands::cache::clear_cache,
            commands::cache::enforce_cache_limit,
            sync::commands::sync_list_backends,
            sync::commands::sync_test_backend,
            sync::commands::sync_list_file_states,
            sync::commands::sync_download_file,
            sync::commands::sync_evict_local_file,
            sync::commands::sync_delete_file_everywhere,
            sync::commands::sync_db_now,
            sync::commands::sync_db_for_library,
        ]);

    #[cfg(debug_assertions)]
    specta_builder
        .export(specta_typescript::Typescript::default(), "../src/lib/tauri-specta.ts")
        .unwrap();

    let base = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    LevelFilter::Debug
                } else {
                    LevelFilter::Info
                })
                .format(|out, message, record| {
                    let ts = OffsetDateTime::now_local()
                        .unwrap_or_else(|_| OffsetDateTime::now_utc())
                        .format(LOG_LINE_TIMESTAMP)
                        .unwrap_or_else(|_| "?".into());
                    out.finish(format_args!(
                        "{} [{}] [{}] {}",
                        ts,
                        record.target(),
                        record.level(),
                        message
                    ))
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(debug_assertions)]
    let builder = base.plugin(tauri_plugin_mcp_bridge::init());
    #[cfg(not(debug_assertions))]
    let builder = base;

    builder
        .manage(Mutex::new(models::AppConfig::default()))
        .manage(StreamerState::new(RwLock::new(HashMap::new())))
        .setup(|app| {
            info!("Start to initialize application.");
            let config_path = config_repo::config_path(&app.path().app_data_dir()?);
            let config = config_repo::load_config(&config_path).unwrap_or_default();
            *app.state::<AppState>().lock().unwrap() = config;
            if let Err(e) = asset_scope::sync_for_reader_libraries(&app.handle()) {
                error!(
                    "Failed to extend asset protocol scope for reader file access. error: {}",
                    e
                );
            }
            info!("Success to initialize application.");
            Ok(())
        })
        .register_uri_scheme_protocol("bookcover", protocols::bookcover_handler)
        .register_uri_scheme_protocol("bookfile", protocols::bookfile_handler)
        .invoke_handler(specta_builder.invoke_handler())
        .run(tauri::generate_context!())
}
