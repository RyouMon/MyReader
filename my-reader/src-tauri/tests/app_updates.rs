use my_reader_lib::{commands::app_update::*, services::app_update_service::DesktopAppUpdater};
use tauri::Manager;

#[tokio::test]
async fn updater_commands_preserve_device_preferences_and_require_a_verified_installer() {
    let identifier = format!("org.myreader.update-test-{}", uuid::Uuid::new_v4());
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().identifier = identifier.clone();
    context.package_info_mut().version = "1.2.3".parse().unwrap();
    let app = tauri::test::mock_builder()
        .manage(DesktopAppUpdater::default())
        .build(context)
        .unwrap();
    let handle = app.handle().clone();
    let directory = handle.path().app_data_dir().unwrap();
    assert!(directory.ends_with(&identifier));

    let initial = get_app_update(handle.clone(), app.state()).await.unwrap();
    assert_eq!(initial.current_version, "1.2.3");
    assert!(initial.auto_check);
    assert!(!initial.auto_download);
    assert!(initial.version.is_none());
    let saved = set_app_update_preferences(handle.clone(), app.state(), false, false)
        .await
        .unwrap();
    assert!(!saved.auto_check);
    let checked = check_app_update(handle.clone(), app.state(), false)
        .await
        .unwrap();
    assert_eq!(checked.status, "idle");
    let download = download_app_update(handle.clone(), app.state())
        .await
        .unwrap();
    assert_eq!(download.status, "idle");
    assert!(open_app_update_installer(handle.clone(), app.state())
        .await
        .is_err());

    let restarted = DesktopAppUpdater::default();
    assert!(!restarted.get(&handle).await.unwrap().snapshot().auto_check);
    let serialized = serde_json::to_value(initial).unwrap();
    assert_eq!(serialized["currentVersion"], "1.2.3");
    assert_eq!(serialized["downloadedBytes"], 0);
    assert!(directory.join("updates/state.json").is_file());
    std::fs::remove_dir_all(directory).unwrap();
}
