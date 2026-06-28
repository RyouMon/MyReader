//! Helpers for seeding and inspecting the persisted `config.json` file.
//!
//! Commands like `add_library` / `remove_library` / `switch_library` call
//! `config::save_config` after mutating state. These helpers go through the same code
//! path so tests stay aligned with production behavior.

use my_reader_lib::models::AppConfig;
use my_reader_lib::{config_path, load_config, save_config};

use super::app::TestApp;

/// Write an `AppConfig` to `<app_data_dir>/config.json`, creating the directory if
/// needed. Use this to set up the on-disk state before invoking a command that loads
/// the config (none of our commands currently do, but reserved for future use).
#[allow(dead_code)]
pub fn seed_config_file(app: &TestApp, config: &AppConfig) {
    let dir = app.app_data_dir();
    std::fs::create_dir_all(&dir).expect("create app_data_dir");
    let path = config_path(&dir);
    save_config(&path, config).expect("seed config.json");
}

/// Read whatever is currently persisted at `<app_data_dir>/config.json`. Returns
/// `None` if the file doesn't exist yet (i.e. no mutating command has run).
pub fn read_persisted_config(app: &TestApp) -> Option<AppConfig> {
    let path = config_path(&app.app_data_dir());
    if !path.exists() {
        return None;
    }
    Some(load_config(&path).expect("persisted config.json should be valid"))
}
