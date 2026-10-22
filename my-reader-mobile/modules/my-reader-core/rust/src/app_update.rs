use my_reader_core::api::app_update::{AppUpdateService, UpdateSnapshot, UpdateTarget};
use tokio::sync::OnceCell;

use crate::CoreFfiError;

static UPDATER: OnceCell<AppUpdateService> = OnceCell::const_new();

#[derive(Debug, Clone, uniffi::Record)]
pub struct AppUpdateSnapshot {
    pub current_version: String,
    pub auto_check: bool,
    pub auto_download: bool,
    pub status: String,
    pub version: Option<String>,
    pub release_url: Option<String>,
    pub notes: Option<String>,
    pub asset_name: Option<String>,
    pub downloaded_bytes: f64,
    pub total_bytes: f64,
    pub error: Option<String>,
}

impl From<UpdateSnapshot> for AppUpdateSnapshot {
    fn from(value: UpdateSnapshot) -> Self {
        Self {
            current_version: value.current_version,
            auto_check: value.auto_check,
            auto_download: value.auto_download,
            status: value.status,
            version: value.version,
            release_url: value.release_url,
            notes: value.notes,
            asset_name: value.asset_name,
            downloaded_bytes: value.downloaded_bytes,
            total_bytes: value.total_bytes,
            error: value.error,
        }
    }
}

fn updater() -> Result<&'static AppUpdateService, CoreFfiError> {
    UPDATER
        .get()
        .ok_or_else(|| CoreFfiError::core("UPDATE_NOT_INITIALIZED"))
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn app_update_initialize(
    directory: String,
    current_version: String,
) -> Result<AppUpdateSnapshot, CoreFfiError> {
    if !cfg!(target_os = "android") {
        return Err(CoreFfiError::core("UPDATE_UNSUPPORTED_PLATFORM"));
    }
    let service = UPDATER
        .get_or_try_init(|| async {
            AppUpdateService::new(
                directory.into(),
                current_version,
                UpdateTarget {
                    os: "android".into(),
                    arch: std::env::consts::ARCH.into(),
                    package: "apk".into(),
                },
            )
            .await
            .map_err(CoreFfiError::from_core)
        })
        .await?;
    Ok(service.snapshot().into())
}

#[uniffi::export]
pub fn app_update_snapshot() -> Result<AppUpdateSnapshot, CoreFfiError> {
    Ok(updater()?.snapshot().into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn app_update_check(
    manual: bool,
    now_ms: i64,
) -> Result<AppUpdateSnapshot, CoreFfiError> {
    Ok(updater()?
        .check(manual, now_ms)
        .await
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn app_update_download() -> Result<AppUpdateSnapshot, CoreFfiError> {
    Ok(updater()?
        .download()
        .await
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn app_update_set_preferences(
    auto_check: bool,
    auto_download: bool,
) -> Result<AppUpdateSnapshot, CoreFfiError> {
    Ok(updater()?
        .set_preferences(auto_check, auto_download)
        .await
        .map_err(CoreFfiError::from_core)?
        .into())
}

#[uniffi::export(async_runtime = "tokio")]
pub async fn app_update_installer_path() -> Result<String, CoreFfiError> {
    Ok(updater()?
        .installer_path()
        .await
        .map_err(CoreFfiError::from_core)?
        .to_string_lossy()
        .into_owned())
}
