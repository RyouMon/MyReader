use semver::Version;
use serde::{Deserialize, Serialize};

use super::{update_error, UpdateTarget};
use crate::CoreError;

pub(super) const REPOSITORY: &str = "https://github.com/RyouMon/MyReader";
pub(super) const LATEST_RELEASE: &str =
    "https://api.github.com/repos/RyouMon/MyReader/releases/latest";

#[derive(Debug, Deserialize)]
pub(super) struct GithubRelease {
    pub tag_name: String,
    pub draft: bool,
    pub prerelease: bool,
    pub body: Option<String>,
    pub assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
pub(super) struct GithubAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
    pub digest: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct Release {
    pub version: String,
    pub tag: String,
    pub notes: String,
    pub asset_name: String,
    pub asset_url: String,
    pub size: u64,
    pub sha256: String,
}

pub(super) fn parse_version(value: &str) -> Result<Version, CoreError> {
    Version::parse(value.strip_prefix('v').unwrap_or(value))
        .map_err(|_| update_error("UPDATE_INVALID_VERSION"))
}

impl Release {
    pub fn validate(&self, target: &UpdateTarget) -> Result<(), CoreError> {
        let version = parse_version(&self.tag)?;
        let expected = target.asset_name(&version.to_string())?;
        if self.version != version.to_string()
            || !version.pre.is_empty()
            || self.asset_name != expected
            || self.asset_url != format!("{REPOSITORY}/releases/download/{}/{}", self.tag, expected)
            || self.size == 0
            || self.sha256.len() != 64
            || !self.sha256.bytes().all(|c| c.is_ascii_hexdigit())
        {
            return Err(update_error("UPDATE_INVALID_RELEASE"));
        }
        Ok(())
    }

    pub fn page_url(&self) -> String {
        format!("{REPOSITORY}/releases/tag/{}", self.tag)
    }
}

impl UpdateTarget {
    fn asset_name(&self, version: &str) -> Result<String, CoreError> {
        let arch = match self.arch.as_str() {
            "aarch64" => "aarch64",
            "x86_64" => "x64",
            _ if self.os == "android" => "",
            _ => return Err(update_error("UPDATE_UNSUPPORTED_PACKAGE")),
        };
        let name = match (self.os.as_str(), self.package.as_str()) {
            ("macos", "dmg") => format!("MyReader_{version}_{arch}.dmg"),
            ("windows", "nsis") => format!("MyReader_{version}_{arch}-setup.exe"),
            ("windows", "msi") => format!("MyReader_{version}_{arch}_en-US.msi"),
            ("linux", "appimage") => {
                let arch = if arch == "x64" { "amd64" } else { arch };
                format!("MyReader_{version}_{arch}.AppImage")
            }
            ("linux", "deb") => {
                let arch = if arch == "x64" { "amd64" } else { "arm64" };
                format!("MyReader_{version}_{arch}.deb")
            }
            ("linux", "rpm") => format!("MyReader-{version}-1.{}.rpm", self.arch),
            ("android", "apk") => format!("MyReader-{version}-android.apk"),
            _ => return Err(update_error("UPDATE_UNSUPPORTED_PACKAGE")),
        };
        Ok(name)
    }
}

pub(super) fn select_release(
    release: GithubRelease,
    current: &str,
    target: &UpdateTarget,
) -> Result<Option<Release>, CoreError> {
    if release.draft || release.prerelease {
        return Ok(None);
    }
    let version = parse_version(&release.tag_name)?;
    if !version.pre.is_empty() || version.cmp_precedence(&parse_version(current)?).is_le() {
        return Ok(None);
    }
    let expected = target.asset_name(&version.to_string())?;
    let asset = release
        .assets
        .into_iter()
        .find(|asset| asset.name == expected)
        .ok_or_else(|| update_error("UPDATE_UNSUPPORTED_PACKAGE"))?;
    let result = Release {
        version: version.to_string(),
        tag: release.tag_name,
        notes: release.body.unwrap_or_default(),
        asset_name: asset.name,
        asset_url: asset.browser_download_url,
        size: asset.size,
        sha256: asset
            .digest
            .and_then(|value| value.strip_prefix("sha256:").map(str::to_owned))
            .ok_or_else(|| update_error("UPDATE_INVALID_RELEASE"))?,
    };
    result.validate(target)?;
    Ok(Some(result))
}
