use super::*;
use release::{GithubAsset, REPOSITORY};
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

fn target(os: &str, arch: &str, package: &str) -> UpdateTarget {
    UpdateTarget {
        os: os.into(),
        arch: arch.into(),
        package: package.into(),
    }
}

fn github_release(tag: &str, names: &[&str]) -> GithubRelease {
    GithubRelease {
        tag_name: tag.into(),
        draft: false,
        prerelease: false,
        body: Some("Release notes".into()),
        assets: names
            .iter()
            .map(|name| GithubAsset {
                name: (*name).into(),
                browser_download_url: format!("{REPOSITORY}/releases/download/{tag}/{name}"),
                size: 3,
                digest: Some(format!("sha256:{:x}", Sha256::digest(b"apk"))),
            })
            .collect(),
    }
}

fn android_release() -> Release {
    select_release(
        github_release("v1.10.0", &["MyReader-1.10.0-android.apk"]),
        "1.9.0",
        &target("android", "aarch64", "apk"),
    )
    .unwrap()
    .unwrap()
}

#[test]
fn selects_the_installed_package_format_and_architecture() {
    let cases = [
        ("macos", "aarch64", "dmg", "MyReader_1.10.0_aarch64.dmg"),
        ("macos", "x86_64", "dmg", "MyReader_1.10.0_x64.dmg"),
        ("windows", "x86_64", "nsis", "MyReader_1.10.0_x64-setup.exe"),
        ("windows", "x86_64", "msi", "MyReader_1.10.0_x64_en-US.msi"),
        (
            "linux",
            "x86_64",
            "appimage",
            "MyReader_1.10.0_amd64.AppImage",
        ),
        ("linux", "x86_64", "deb", "MyReader_1.10.0_amd64.deb"),
        ("linux", "x86_64", "rpm", "MyReader-1.10.0-1.x86_64.rpm"),
        ("android", "arm", "apk", "MyReader-1.10.0-android.apk"),
    ];
    let names: Vec<_> = cases.iter().map(|(_, _, _, name)| *name).collect();
    for (os, arch, package, expected) in cases {
        let selected = select_release(
            github_release("v1.10.0", &names),
            "1.9.0",
            &target(os, arch, package),
        )
        .unwrap()
        .unwrap();
        assert_eq!(selected.asset_name, expected);
    }
}

#[test]
fn excludes_downgrades_prereleases_drafts_and_build_metadata_only_changes() {
    let platform = target("android", "aarch64", "apk");
    for current in ["1.10.0", "1.11.0", "1.10.0+build.3"] {
        assert!(
            select_release(github_release("v1.10.0", &[]), current, &platform)
                .unwrap()
                .is_none()
        );
    }
    for (draft, prerelease, tag) in [
        (true, false, "v2.0.0"),
        (false, true, "nightly"),
        (false, false, "v2.0.0-beta.1"),
    ] {
        let mut release = github_release(tag, &[]);
        release.draft = draft;
        release.prerelease = prerelease;
        assert!(select_release(release, "1.9.0", &platform)
            .unwrap()
            .is_none());
    }
    assert!(select_release(
        github_release("v1.10.0", &["MyReader-1.10.0-android.apk"]),
        "1.10.0-rc.1",
        &platform
    )
    .unwrap()
    .is_some());
}

#[test]
fn rejects_missing_or_untrusted_installers_and_digests() {
    let platform = target("android", "aarch64", "apk");
    assert!(select_release(github_release("v1.10.0", &[]), "1.9.0", &platform).is_err());
    assert!(select_release(github_release("not-a-version", &[]), "1.9.0", &platform).is_err());
    assert!(select_release(
        github_release("v1.10.0", &[]),
        "1.9.0",
        &target("ios", "aarch64", "ipa")
    )
    .is_err());
    for (url, digest) in [
        ("https://evil.example/installer.apk", Some(format!("sha256:{}", "a".repeat(64)))),
        ("https://github.com/RyouMon/MyReader/releases/download/v1.10.0/MyReader-1.10.0-android.apk", None),
        ("https://github.com/RyouMon/MyReader/releases/download/v1.10.0/MyReader-1.10.0-android.apk", Some("sha256:bad".into())),
    ] {
        let mut release = github_release("v1.10.0", &["MyReader-1.10.0-android.apk"]);
        release.assets[0].browser_download_url = url.into();
        release.assets[0].digest = digest;
        assert!(select_release(release, "1.9.0", &platform).is_err());
    }
}

async fn service(directory: &Path, version: &str) -> AppUpdateService {
    AppUpdateService::new(
        directory.to_path_buf(),
        version.into(),
        target("android", "aarch64", "apk"),
    )
    .await
    .unwrap()
}

use std::path::Path;

#[tokio::test]
async fn preferences_survive_restart_and_automatic_checks_respect_opt_out_and_interval() {
    let dir = tempfile::tempdir().unwrap();
    let updater = service(dir.path(), "1.9.0").await;
    assert!(updater.snapshot().auto_check);
    assert!(!updater.snapshot().auto_download);
    updater.set_preferences(false, true).await.unwrap();
    assert_eq!(updater.check(false, 1000).await.unwrap().status, "idle");
    let restarted = service(dir.path(), "1.9.0").await;
    assert!(!restarted.snapshot().auto_check);
    assert!(restarted.snapshot().auto_download);
    restarted.set_preferences(true, false).await.unwrap();
    restarted.state().saved.last_checked = Some(1000);
    assert_eq!(restarted.check(false, 2000).await.unwrap().status, "idle");
}

#[tokio::test]
async fn restores_only_verified_downloads_and_rechecks_before_opening() {
    let dir = tempfile::tempdir().unwrap();
    let updater = service(dir.path(), "1.9.0").await;
    let release = android_release();
    updater.state().saved.release = Some(release.clone());
    updater.save().await.unwrap();
    let path = dir.path().join(&release.asset_name);
    tokio::fs::write(&path, b"apk").await.unwrap();
    let restarted = service(dir.path(), "1.9.0").await;
    assert_eq!(restarted.snapshot().status, "downloaded");
    assert_eq!(restarted.installer_path().await.unwrap(), path);
    tokio::fs::write(&path, b"bad").await.unwrap();
    assert!(restarted.installer_path().await.is_err());
    assert_eq!(
        restarted.snapshot().error.as_deref(),
        Some("UPDATE_INTEGRITY_FAILED")
    );
    assert_eq!(
        service(dir.path(), "1.9.0").await.snapshot().status,
        "available"
    );
    let updated = service(dir.path(), "1.10.0").await;
    assert!(updated.snapshot().version.is_none());
    assert!(!path.exists());
}

#[tokio::test]
async fn enabling_automatic_download_reuses_a_verified_installer_without_network() {
    let dir = tempfile::tempdir().unwrap();
    let updater = service(dir.path(), "1.9.0").await;
    let release = android_release();
    tokio::fs::write(dir.path().join(&release.asset_name), b"apk")
        .await
        .unwrap();
    updater.state().saved.release = Some(release);
    assert_eq!(
        updater.set_preferences(true, true).await.unwrap().status,
        "downloaded"
    );
}

#[tokio::test]
async fn concurrent_actions_do_not_start_a_second_transfer() {
    let dir = tempfile::tempdir().unwrap();
    let updater = service(dir.path(), "1.9.0").await;
    let _guard = updater.operation.lock().await;
    updater.state().status = "downloading";
    assert_eq!(updater.check(true, 1).await.unwrap().status, "downloading");
    assert_eq!(updater.download().await.unwrap().status, "downloading");
}

async fn serve(body: &'static [u8], status: &str) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut request = [0; 4096];
        assert!(stream.read(&mut request).await.unwrap() > 0);
        stream.write_all(response.as_bytes()).await.unwrap();
        stream.write_all(body).await.unwrap();
    });
    format!("http://{address}/installer.apk")
}

#[tokio::test]
async fn downloads_atomically_reports_progress_and_retries_after_failed_integrity_or_http() {
    let dir = tempfile::tempdir().unwrap();
    let client = http::client_builder().build().unwrap();
    let mut release = android_release();
    let destination = dir.path().join(&release.asset_name);
    let partial = dir.path().join(format!("{}.part", release.asset_name));
    for (bytes, status) in [
        (b"bad".as_slice(), "200 OK"),
        (b"ap".as_slice(), "200 OK"),
        (b"apkk".as_slice(), "200 OK"),
        (b"apk".as_slice(), "500 Server Error"),
    ] {
        release.asset_url = serve(bytes, status).await;
        assert!(download::download(&client, dir.path(), &release, |_| {})
            .await
            .is_err());
        assert!(!destination.exists());
        assert!(!partial.exists());
    }
    release.asset_url = serve(b"apk", "200 OK").await;
    let progress = Mutex::new(0);
    download::download(&client, dir.path(), &release, |bytes| {
        *progress.lock().unwrap() = bytes
    })
    .await
    .unwrap();
    assert_eq!(tokio::fs::read(&destination).await.unwrap(), b"apk");
    assert_eq!(*progress.lock().unwrap(), 3);
    assert!(!partial.exists());
}

#[tokio::test]
async fn checks_releases_handles_network_errors_and_allows_manual_retry_within_the_interval() {
    let dir = tempfile::tempdir().unwrap();
    let mut updater = service(dir.path(), "1.9.0").await;
    updater.client = http::client_builder().build().unwrap();
    let failure = serve(b"unavailable", "503 Service Unavailable").await;
    let failed = updater.check_from(true, 1, &failure).await.unwrap();
    assert_eq!(failed.error.as_deref(), Some("UPDATE_CHECK_FAILED"));
    // An automatic check within the daily interval must not make another request.
    assert_eq!(
        updater
            .check_from(false, 2, "not a URL")
            .await
            .unwrap()
            .status,
        "error"
    );
    let latest = serve(
        br#"{"tag_name":"v1.9.0","draft":false,"prerelease":false,"body":null,"assets":[]}"#,
        "200 OK",
    )
    .await;
    let retried = updater.check_from(true, 3, &latest).await.unwrap();
    assert_eq!(retried.status, "upToDate");
    assert!(retried.error.is_none());
    let no_release = serve(b"{}", "404 Not Found").await;
    assert_eq!(
        updater
            .check_from(true, 4, &no_release)
            .await
            .unwrap()
            .status,
        "upToDate"
    );
}

#[tokio::test]
async fn reports_available_without_downloading_unless_the_user_opts_in() {
    let dir = tempfile::tempdir().unwrap();
    let mut updater = service(dir.path(), "1.9.0").await;
    updater.client = http::client_builder().build().unwrap();
    let release = android_release();
    let body = serde_json::json!({
        "tag_name": release.tag, "draft": false, "prerelease": false, "body": release.notes,
        "assets": [{"name": release.asset_name, "size": release.size, "digest": format!("sha256:{}", release.sha256),
                    "browser_download_url": release.asset_url}]
    }).to_string();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut request = [0; 4096];
        assert!(stream.read(&mut request).await.unwrap() > 0);
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(response.as_bytes()).await.unwrap();
    });
    let available = updater.check_from(true, 1, &endpoint).await.unwrap();
    assert_eq!(available.status, "available");
    assert_eq!(available.version.as_deref(), Some("1.10.0"));
    assert!(!dir.path().join(&release.asset_name).exists());
    assert_eq!(
        service(dir.path(), "1.9.0").await.snapshot().version,
        available.version
    );
}

#[tokio::test]
async fn switching_package_format_discards_incompatible_cached_metadata_but_keeps_preferences() {
    let dir = tempfile::tempdir().unwrap();
    let updater = service(dir.path(), "1.9.0").await;
    updater.state().saved.release = Some(android_release());
    updater.set_preferences(false, false).await.unwrap();
    let changed = AppUpdateService::new(
        dir.path().into(),
        "1.9.0".into(),
        target("windows", "x86_64", "msi"),
    )
    .await
    .unwrap();
    assert!(changed.snapshot().version.is_none());
    assert!(!changed.snapshot().auto_check);
}
