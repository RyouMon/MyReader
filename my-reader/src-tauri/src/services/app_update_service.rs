use my_reader_core::api::app_update::{AppUpdateService, UpdateSnapshot, UpdateTarget};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::OnceCell;

use crate::error::AppError;

#[derive(Default)]
pub struct DesktopAppUpdater(OnceCell<AppUpdateService>);

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateSnapshot {
    pub current_version: String,
    pub auto_check: bool,
    pub auto_download: bool,
    pub status: String,
    pub version: Option<String>,
    pub release_url: Option<String>,
    pub notes: Option<String>,
    pub asset_name: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
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
            downloaded_bytes: value.downloaded_bytes as u64,
            total_bytes: value.total_bytes as u64,
            error: value.error,
        }
    }
}

impl DesktopAppUpdater {
    pub async fn get<R: Runtime>(&self, app: &AppHandle<R>) -> Result<&AppUpdateService, AppError> {
        self.0
            .get_or_try_init(|| async {
                let package = package_format();
                AppUpdateService::new(
                    app.path()
                        .app_data_dir()
                        .map_err(|e| AppError::Config(e.to_string()))?
                        .join("updates"),
                    app.package_info().version.to_string(),
                    UpdateTarget {
                        os: std::env::consts::OS.into(),
                        arch: std::env::consts::ARCH.into(),
                        package: package.into(),
                    },
                )
                .await
                .map_err(AppError::from)
            })
            .await
    }

    pub async fn open_installer<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), AppError> {
        let path = self.get(app).await?.installer_path().await?;
        tauri::async_runtime::spawn_blocking(move || open_installer(&path))
            .await
            .map_err(|error| AppError::Config(error.to_string()))?
    }
}

fn open_installer(path: &std::path::Path) -> Result<(), AppError> {
    #[cfg(target_os = "linux")]
    if path
        .extension()
        .is_some_and(|extension| extension == "AppImage")
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path)?.permissions();
        permissions.set_mode(permissions.mode() | 0o100);
        std::fs::set_permissions(path, permissions)?;
        let mut child = std::process::Command::new(path).spawn()?;
        std::thread::spawn(move || child.wait());
        return Ok(());
    }
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|error| AppError::Config(error.to_string()))
}

fn package_format() -> &'static str {
    use tauri::utils::config::BundleType;
    match tauri::utils::platform::bundle_type() {
        Some(BundleType::Deb) => "deb",
        Some(BundleType::Rpm) => "rpm",
        Some(BundleType::Msi) => "msi",
        _ => match std::env::consts::OS {
            "macos" => "dmg",
            "windows" => "nsis",
            _ => "appimage",
        },
    }
}
