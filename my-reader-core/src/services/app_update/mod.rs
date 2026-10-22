mod download;
mod release;
#[cfg(test)]
mod tests;

use std::{path::PathBuf, sync::Mutex, time::Duration};

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex as AsyncMutex;

use crate::{
    infrastructure::{file::sha256_file, http},
    CoreError,
};
use release::{parse_version, select_release, GithubRelease, Release, LATEST_RELEASE};

const CHECK_INTERVAL_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone)]
pub struct UpdateTarget {
    pub os: String,
    pub arch: String,
    pub package: String,
}

#[derive(Debug, Clone)]
pub struct UpdateSnapshot {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedState {
    auto_check: bool,
    auto_download: bool,
    last_checked: Option<i64>,
    release: Option<Release>,
}

impl Default for SavedState {
    fn default() -> Self {
        Self {
            auto_check: true,
            auto_download: false,
            last_checked: None,
            release: None,
        }
    }
}

struct State {
    saved: SavedState,
    status: &'static str,
    downloaded_bytes: u64,
    error: Option<String>,
}

pub struct AppUpdateService {
    directory: PathBuf,
    current_version: String,
    target: UpdateTarget,
    client: reqwest::Client,
    state: Mutex<State>,
    operation: AsyncMutex<()>,
}

pub(super) fn update_error(code: &str) -> CoreError {
    CoreError::Config(code.to_owned())
}

impl AppUpdateService {
    pub async fn new(
        directory: PathBuf,
        current_version: String,
        target: UpdateTarget,
    ) -> Result<Self, CoreError> {
        parse_version(&current_version)?;
        tokio::fs::create_dir_all(&directory).await?;
        let saved = match tokio::fs::read(directory.join("state.json")).await {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => SavedState::default(),
            Err(error) => return Err(error.into()),
        };
        let service = Self {
            directory,
            current_version,
            target,
            client: http::client_builder()
                .user_agent("MyReader-update-check")
                .connect_timeout(Duration::from_secs(15))
                .read_timeout(Duration::from_secs(60))
                .https_only(true)
                .build()?,
            state: Mutex::new(State {
                saved,
                status: "idle",
                downloaded_bytes: 0,
                error: None,
            }),
            operation: AsyncMutex::new(()),
        };
        service.restore().await?;
        Ok(service)
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|error| error.into_inner())
    }

    pub fn snapshot(&self) -> UpdateSnapshot {
        let state = self.state();
        self.snapshot_unlocked(&state)
    }

    async fn save(&self) -> Result<(), CoreError> {
        let bytes = serde_json::to_vec(&self.state().saved)?;
        let path = self.directory.join("state.json");
        // Atomic replacement also works when the destination exists on Windows.
        tokio::task::spawn_blocking(move || {
            use std::io::Write;
            let mut file = tempfile::NamedTempFile::new_in(path.parent().unwrap())?;
            file.write_all(&bytes)?;
            file.as_file().sync_all()?;
            file.persist(path).map_err(|error| error.error)?;
            Ok::<_, std::io::Error>(())
        })
        .await
        .map_err(|_| update_error("UPDATE_SAVE_FAILED"))??;
        Ok(())
    }

    async fn restore(&self) -> Result<(), CoreError> {
        let release = self.state().saved.release.clone();
        if let Some(release) = release {
            if release.validate(&self.target).is_err() {
                let mut state = self.state();
                state.saved.release = None;
                state.saved.last_checked = None;
                return Ok(());
            }
            if parse_version(&release.version)?
                .cmp_precedence(&parse_version(&self.current_version)?)
                .is_le()
            {
                let _ = tokio::fs::remove_file(self.directory.join(&release.asset_name)).await;
                let mut state = self.state();
                state.saved.release = None;
                state.saved.last_checked = None;
            } else {
                let valid = self.verified_file(&release).await.is_ok();
                let mut state = self.state();
                state.status = if valid { "downloaded" } else { "available" };
                state.downloaded_bytes = if valid { release.size } else { 0 };
            }
        }
        Ok(())
    }

    async fn verified_file(&self, release: &Release) -> Result<PathBuf, CoreError> {
        release.validate(&self.target)?;
        let path = self.directory.join(&release.asset_name);
        let digest = sha256_file(&path).await?;
        if digest.size as u64 != release.size
            || !digest.sha256.eq_ignore_ascii_case(&release.sha256)
        {
            return Err(update_error("UPDATE_INTEGRITY_FAILED"));
        }
        Ok(path)
    }

    pub async fn installer_path(&self) -> Result<PathBuf, CoreError> {
        let _operation = self.operation.lock().await;
        let release = self
            .state()
            .saved
            .release
            .clone()
            .ok_or_else(|| update_error("UPDATE_NOT_DOWNLOADED"))?;
        match self.verified_file(&release).await {
            Ok(path) => Ok(path),
            Err(error) => {
                self.fail("UPDATE_INTEGRITY_FAILED");
                Err(error)
            }
        }
    }

    pub async fn set_preferences(
        &self,
        auto_check: bool,
        auto_download: bool,
    ) -> Result<UpdateSnapshot, CoreError> {
        let _operation = self.operation.lock().await;
        let previous = self.state().saved.clone();
        {
            let mut state = self.state();
            state.saved.auto_check = auto_check;
            state.saved.auto_download = auto_download;
            if auto_check && !previous.auto_check {
                state.saved.last_checked = None;
            }
        }
        if let Err(error) = self.save().await {
            self.state().saved = previous;
            return Err(error);
        }
        if auto_download && self.state().saved.release.is_some() {
            self.download_locked().await;
        }
        Ok(self.snapshot())
    }

    pub async fn check(&self, manual: bool, now_ms: i64) -> Result<UpdateSnapshot, CoreError> {
        self.check_from(manual, now_ms, LATEST_RELEASE).await
    }

    async fn check_from(
        &self,
        manual: bool,
        now_ms: i64,
        endpoint: &str,
    ) -> Result<UpdateSnapshot, CoreError> {
        let Ok(_operation) = self.operation.try_lock() else {
            return Ok(self.snapshot());
        };
        if !manual {
            let state = self.state();
            if !state.saved.auto_check
                || state.saved.last_checked.is_some_and(|last| {
                    now_ms.saturating_sub(last) < CHECK_INTERVAL_MS && now_ms >= last
                })
            {
                return Ok(self.snapshot_unlocked(&state));
            }
        }
        {
            let mut state = self.state();
            state.status = "checking";
            state.error = None;
            state.saved.last_checked = Some(now_ms);
        }
        match self.fetch_release(endpoint).await {
            Ok(release) => {
                {
                    let mut state = self.state();
                    state.status = if release.is_some() {
                        "available"
                    } else {
                        "upToDate"
                    };
                    state.saved.release = release;
                    state.downloaded_bytes = 0;
                }
                self.restore().await?;
                self.save().await?;
                if self.state().saved.auto_download {
                    self.download_locked().await;
                }
            }
            Err(error) => {
                let code = match &error {
                    CoreError::Config(code) => code.as_str(),
                    _ => "UPDATE_CHECK_FAILED",
                };
                self.fail(code);
                self.save().await?;
            }
        }
        Ok(self.snapshot())
    }

    fn snapshot_unlocked(&self, state: &State) -> UpdateSnapshot {
        let release = state.saved.release.as_ref();
        UpdateSnapshot {
            current_version: self.current_version.clone(),
            auto_check: state.saved.auto_check,
            auto_download: state.saved.auto_download,
            status: state.status.into(),
            version: release.map(|r| r.version.clone()),
            release_url: release.map(Release::page_url),
            notes: release.map(|r| r.notes.clone()),
            asset_name: release.map(|r| r.asset_name.clone()),
            downloaded_bytes: state.downloaded_bytes as f64,
            total_bytes: release.map_or(0., |r| r.size as f64),
            error: state.error.clone(),
        }
    }

    async fn fetch_release(&self, endpoint: &str) -> Result<Option<Release>, CoreError> {
        let response = self
            .client
            .get(endpoint)
            .header("Accept", "application/vnd.github+json")
            .timeout(Duration::from_secs(30))
            .send()
            .await?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let release: GithubRelease = response.error_for_status()?.json().await?;
        select_release(release, &self.current_version, &self.target)
    }

    fn fail(&self, code: &str) {
        let mut state = self.state();
        state.status = "error";
        state.error = Some(code.into());
    }

    pub async fn download(&self) -> Result<UpdateSnapshot, CoreError> {
        let Ok(_operation) = self.operation.try_lock() else {
            return Ok(self.snapshot());
        };
        self.download_locked().await;
        Ok(self.snapshot())
    }

    async fn download_locked(&self) {
        let release = self.state().saved.release.clone();
        let Some(release) = release else {
            return;
        };
        if self.verified_file(&release).await.is_ok() {
            let mut state = self.state();
            state.status = "downloaded";
            state.error = None;
            state.downloaded_bytes = release.size;
            return;
        }
        {
            let mut state = self.state();
            state.status = "downloading";
            state.downloaded_bytes = 0;
            state.error = None;
        }
        let result = download::download(&self.client, &self.directory, &release, |bytes| {
            self.state().downloaded_bytes = bytes;
        })
        .await;
        match result {
            Ok(()) => {
                self.state().status = "downloaded";
            }
            Err(CoreError::Config(code)) => self.fail(&code),
            Err(_) => self.fail("UPDATE_DOWNLOAD_FAILED"),
        }
    }
}
