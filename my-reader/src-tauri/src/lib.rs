mod asset_scope;
pub mod auth;
pub mod cache;
pub mod clients;
pub mod commands;
mod config;
mod constants;
mod db;
pub mod entities;
mod error;
pub mod models;
mod protocols;
mod reader_ui_prefs;
pub mod repositories;
pub mod services;
mod storage;
pub mod streamer;
pub mod sync;
mod utils;

// Re-exports for integration tests under `src-tauri/tests/`.
// Curated; do not grow this list without a use-case (hard cap at 8 names).
pub use config::{config_path, load_config, save_config};
pub use error::AppError;

use std::collections::HashMap;

use log::LevelFilter;
use tauri::Manager;
use time::{macros::format_description, OffsetDateTime};
use tokio::sync::RwLock;
use tracing::{error, info};

use commands::AppState;
use services::download_service::DownloadService;
use streamer::StreamerState;

/// Local datetime with millisecond precision. Falls back to UTC when the local
/// timezone cannot be resolved. Do not use incorrectly nested `[[[year]…]]`.
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
            commands::library::add_library::<tauri::Wry>,
            commands::library::add_webdav_library::<tauri::Wry>,
            commands::library::add_onedrive_library::<tauri::Wry>,
            commands::library::refresh_library,
            commands::library::refresh_webdav_library::<tauri::Wry>,
            commands::library::refresh_onedrive_library::<tauri::Wry>,
            commands::source::add_local_data_source::<tauri::Wry>,
            commands::source::add_webdav_data_source::<tauri::Wry>,
            commands::library::remove_library::<tauri::Wry>,
            commands::source::remove_data_source::<tauri::Wry>,
            commands::library::switch_library::<tauri::Wry>,
            commands::library::get_active_library_id,
            commands::source::webdav_list_folders,
            commands::source::onedrive_start_auth,
            commands::source::add_onedrive_data_source::<tauri::Wry>,
            commands::source::onedrive_list_folders,
            commands::book::get_books::<tauri::Wry>,
            commands::book::get_books_page::<tauri::Wry>,
            commands::book::get_book_detail::<tauri::Wry>,
            commands::book::get_series_books::<tauri::Wry>,
            commands::book_reading_format::list_book_reading_formats::<tauri::Wry>,
            commands::book_reading_format::set_book_reading_format::<tauri::Wry>,
            commands::favorite::list_favorite_book_ids::<tauri::Wry>,
            commands::favorite::add_favorite_book::<tauri::Wry>,
            commands::favorite::remove_favorite_book::<tauri::Wry>,
            commands::progress::get_reading_progress::<tauri::Wry>,
            commands::progress::set_reading_progress::<tauri::Wry>,
            commands::reader::get_reader_ui_preferences,
            commands::reader::set_reader_ui_preferences::<tauri::Wry>,
            commands::reader::prepare_book_source::<tauri::Wry>,
            commands::reader::write_epub_readium_manifest,
            commands::reader::close_book_streamer,
            commands::cache::get_cache_usage,
            commands::cache::clear_cache,
            commands::cache::enforce_cache_limit,
            commands::sync::sync_db_for_library::<tauri::Wry>,
            commands::download::check_book_file_state::<tauri::Wry>,
            commands::download::download_book_file::<tauri::Wry>,
            commands::download::delete_local_book_file::<tauri::Wry>,
            commands::download::cancel_book_download::<tauri::Wry>,
        ]);

    #[cfg(debug_assertions)]
    if let Err(e) = specta_builder.export(
        specta_typescript::Typescript::default(),
        "../src/lib/tauri-specta.ts",
    ) {
        eprintln!("Failed to export tauri-specta types: {e}");
    }

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
                    ));
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(debug_assertions)]
    let builder = base.plugin(tauri_plugin_mcp_bridge::init());
    #[cfg(not(debug_assertions))]
    let builder = base;

    builder
        .manage(std::sync::Mutex::new(models::AppConfig::default()))
        .manage(StreamerState::new(RwLock::new(HashMap::new())))
        .manage(DownloadService::new())
        .setup(|app| {
            info!("Start to initialize application.");
            let config_path = config::config_path(&app.path().app_data_dir()?);
            let config = config::load_config(&config_path).unwrap_or_default();
            *app.state::<AppState>()
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = config.clone();
            if let Err(e) = asset_scope::sync_for_reader_libraries(app.handle(), &config.libraries)
            {
                error!(
                    "Failed to extend asset protocol scope for reader file access. error: {}",
                    e
                );
            }
            info!("Success to initialize application.");
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("bookcover", protocols::bookcover_handler)
        .register_asynchronous_uri_scheme_protocol("bookfile", protocols::bookfile_handler)
        .invoke_handler(specta_builder.invoke_handler())
        .run(tauri::generate_context!())
}
