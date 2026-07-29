use std::path::Path;

use my_reader_core::api::config::ConfigService;

use crate::{
    types::{AppConfig, AppPreferences},
    CoreFfiError,
};

#[uniffi::export(async_runtime = "tokio")]
pub async fn app_config_initialize(
    config_path: String,
    initial_config: Option<AppConfig>,
) -> Result<AppConfig, CoreFfiError> {
    Ok(ConfigService::load_or_initialize(
        Path::new(&config_path),
        initial_config.map(TryInto::try_into).transpose()?,
    )
    .map_err(CoreFfiError::from_core)?
    .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn app_config_write_mobile(
    config_path: String,
    preferences: AppPreferences,
    mobile_json: Option<String>,
) -> Result<AppConfig, CoreFfiError> {
    Ok(ConfigService::write_mobile_state(
        Path::new(&config_path),
        preferences.into(),
        mobile_json.as_deref(),
    )
    .map_err(CoreFfiError::from_core)?
    .into())
}
