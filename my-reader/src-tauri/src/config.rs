use std::path::{Path, PathBuf};

use tracing::info;

use crate::error::AppError;
use crate::models::AppConfig;

pub fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("config.json")
}

pub fn load_config(path: &Path) -> Result<AppConfig, AppError> {
    info!(
        "Start to load config from disk. path: \"{}\"",
        path.display()
    );
    let core_config = my_reader_core::api::config::ConfigService::load_or_initialize(path, None)?;
    let config = from_core_config(core_config)?;
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
    my_reader_core::api::config::ConfigService::write_desktop_state(path, config.to_core_config())?;
    info!(
        "Success to save application config. path: \"{}\"",
        path.display()
    );
    Ok(())
}

fn from_core_config(
    mut core_config: my_reader_core::models::AppConfig,
) -> Result<AppConfig, AppError> {
    let desktop_reader_ui = core_config
        .desktop
        .as_ref()
        .and_then(|desktop| desktop.get("readerUi"))
        .cloned();
    let legacy_reader_ui = core_config.extensions.remove("readerUi");
    let uses_legacy_preferences = desktop_reader_ui.is_none() && legacy_reader_ui.is_some();
    let mut reader_ui: crate::reader_ui_prefs::ReaderUiPreferences = desktop_reader_ui
        .or(legacy_reader_ui)
        .map(serde_json::from_value)
        .transpose()?
        .unwrap_or_default();
    if !uses_legacy_preferences {
        reader_ui.app_theme = core_config.preferences.theme;
        reader_ui.app_language = core_config.preferences.language;
    }

    Ok(AppConfig {
        libraries: core_config.libraries.iter().map(Into::into).collect(),
        active_library_id: core_config.active_library_id,
        data_sources: core_config.data_sources.iter().map(Into::into).collect(),
        reader_ui,
        device_id: core_config.device_id,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn should_store_common_preferences_once_when_desktop_config_is_saved() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let mut config = AppConfig::default();
        config.reader_ui.app_theme = "dark".into();
        config.reader_ui.app_language = "zh-CN".into();

        save_config(&path, &config).unwrap();

        let persisted: serde_json::Value =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(persisted["preferences"]["theme"], json!("dark"));
        assert_eq!(persisted["preferences"]["language"], json!("zh-CN"));
        assert!(persisted["desktop"]["readerUi"].get("appTheme").is_none());
        assert!(persisted["desktop"]["readerUi"]
            .get("appLanguage")
            .is_none());
    }

    #[test]
    fn should_preserve_unowned_fields_when_desktop_config_is_saved() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let mut core_config = my_reader_core::models::AppConfig::empty();
        core_config.mobile = Some(json!({
            "state": {
                "libraryViewMode": "list"
            },
            "version": 0
        }));
        core_config.desktop = Some(json!({
            "window": {
                "width": 1200
            }
        }));
        my_reader_core::api::config::ConfigService::save(&path, core_config).unwrap();

        save_config(&path, &AppConfig::default()).unwrap();

        let persisted: serde_json::Value =
            serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(persisted["mobile"]["state"]["libraryViewMode"], "list");
        assert_eq!(persisted["desktop"]["window"]["width"], 1200);
    }

    #[test]
    fn should_read_legacy_reader_preferences_when_flat_config_is_loaded() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&json!({
                "readerUi": {
                    "appTheme": "dark",
                    "appLanguage": "zh-CN"
                }
            }))
            .unwrap(),
        )
        .unwrap();

        let config = load_config(&path).unwrap();

        assert_eq!(config.reader_ui.app_theme, "dark");
        assert_eq!(config.reader_ui.app_language, "zh-CN");
    }

    #[test]
    fn should_preserve_core_only_fields_when_desktop_config_is_saved() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let mut core_config = my_reader_core::models::AppConfig::empty();
        core_config.data_sources = vec![my_reader_core::models::DataSource::Webdav {
            id: "source".into(),
            name: "WebDAV".into(),
            enabled: true,
            endpoint: "https://example.com".into(),
            username: "reader".into(),
            root_path: None,
            has_password: true,
            credential_reference: Some("credential".into()),
            readonly: Some(true),
            created_at: Some(42.0),
        }];
        core_config.libraries = vec![my_reader_core::models::Library {
            id: "library".into(),
            name: "Library".into(),
            path: "/library".into(),
            book_count: 12,
            metadata_uri: Some("file:///library/metadata.db".into()),
            added_at: Some(43.0),
            data_source_id: Some("source".into()),
            source_type: Some("webdav".into()),
            source_path: Some("/Library".into()),
            metadata_etag: Some("etag".into()),
            security_scoped_bookmark: None,
        }];
        core_config.active_library_id = Some("library".into());
        my_reader_core::api::config::ConfigService::save(&path, core_config).unwrap();

        let desktop_config = load_config(&path).unwrap();
        save_config(&path, &desktop_config).unwrap();

        let persisted =
            my_reader_core::api::config::ConfigService::load_or_initialize(&path, None).unwrap();
        let my_reader_core::models::DataSource::Webdav { created_at, .. } =
            &persisted.data_sources[0]
        else {
            panic!("expected WebDAV data source");
        };
        assert_eq!(*created_at, Some(42.0));
        assert_eq!(persisted.libraries[0].book_count, 12);
        assert_eq!(
            persisted.libraries[0].metadata_etag.as_deref(),
            Some("etag")
        );
    }
}
