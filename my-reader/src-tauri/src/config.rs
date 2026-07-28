use std::fs;
use std::path::{Path, PathBuf};

use tracing::info;

use crate::error::AppError;
use crate::models::AppConfig;

pub fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("config.json")
}

pub fn device_registry_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("device-registry.json")
}

pub fn load_config(path: &Path) -> Result<AppConfig, AppError> {
    info!(
        "Start to load config from disk. path: \"{}\"",
        path.display()
    );
    let mut config = if !path.exists() {
        info!("Config file not found, using default.");
        AppConfig::default()
    } else {
        let json = fs::read_to_string(path)?;
        serde_json::from_str(&json)?
    };
    let registry = my_reader_core::api::registry::load_or_initialize(
        &device_registry_path(path.parent().unwrap_or_else(|| Path::new("."))),
        Some(config.device_registry()),
    )?;
    config.apply_device_registry(&registry);
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
        my_reader_core::api::registry::load_or_initialize(
            &device_registry_path(parent),
            Some(config.device_registry()),
        )?;
    }
    let json = serde_json::to_string_pretty(config)?;
    fs::write(path, json)?;
    info!(
        "Success to save application config. path: \"{}\"",
        path.display()
    );
    Ok(())
}
