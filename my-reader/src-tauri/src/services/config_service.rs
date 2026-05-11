use std::fs;
use std::path::PathBuf;
use log::{error, info};
use tauri::{AppHandle, Manager};
use crate::error::AppError;
use crate::models::AppConfig;

pub fn config_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    info!("Start to resolve config file path.");
    let result = (|| {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Config(e.to_string()))?;
        fs::create_dir_all(&dir)?;
        Ok(dir.join("config.json"))
    })();

    match &result {
        Ok(path) => info!(
            "Success to resolve config file path. path: \"{}\"",
            path.display()
        ),
        Err(err) => error!("Failed to resolve config file path. error: {err}"),
    }

    result
}

pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), AppError> {
    info!(
        "Start to save application config. library count: {}, active library id: {:?}",
        config.libraries.len(),
        config.active_library_id
    );
    let result = (|| {
        let path = config_path(app)?;
        let json =
            serde_json::to_string_pretty(config).map_err(|e| AppError::Serialize(e.to_string()))?;
        fs::write(&path, json)?;
        Ok(path)
    })();

    match &result {
        Ok(path) => info!(
            "Success to save application config. path: \"{}\"",
            path.display()
        ),
        Err(err) => error!("Failed to save application config. error: {err}"),
    }

    result.map(|_| ())
}
