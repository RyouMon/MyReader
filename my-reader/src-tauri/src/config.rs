use std::fs;
use std::path::{Path, PathBuf};

use tracing::info;

use crate::error::AppError;
use crate::models::AppConfig;

pub fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("config.json")
}

pub fn load_config(path: &Path) -> Result<AppConfig, AppError> {
    info!("Start to load config from disk. path: \"{}\"", path.display());
    if !path.exists() {
        info!("Config file not found, using default.");
        return Ok(AppConfig::default());
    }
    let json = fs::read_to_string(path)?;
    let config: AppConfig = serde_json::from_str(&json)?;
    info!(
        "Success to load config from disk. library count: {}, active library id: {:?}",
        config.libraries.len(),
        config.active_library_id
    );
    Ok(config)
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<(), AppError> {
    info!(
        "Start to save application config. library count: {}, active library id: {:?}",
        config.libraries.len(),
        config.active_library_id
    );
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(config)?;
    fs::write(path, json)?;
    info!("Success to save application config. path: \"{}\"", path.display());
    Ok(())
}
