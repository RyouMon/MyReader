use std::{
    path::Path,
    sync::{LazyLock, Mutex, MutexGuard},
};

use uuid::Uuid;

use crate::{
    infrastructure::config_store,
    models::{AppConfig, AppPreferences, DataSource, Library, APP_CONFIG_SCHEMA_VERSION},
    CoreError,
};

static APP_CONFIG_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

fn lock_config() -> MutexGuard<'static, ()> {
    APP_CONFIG_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub struct ConfigService;

impl ConfigService {
    pub(crate) fn load(path: &Path) -> Result<Option<AppConfig>, CoreError> {
        let _guard = lock_config();
        let config = config_store::load(path)?;
        if let Some(config) = &config {
            validate_config(config)?;
        }
        Ok(config)
    }

    pub fn load_or_initialize(
        path: &Path,
        initial_config: Option<AppConfig>,
    ) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        if let Some(config) = config_store::load(path)? {
            validate_config(&config)?;
            return Ok(config);
        }

        let mut config = initial_config.unwrap_or_else(AppConfig::empty);
        config.schema_version = APP_CONFIG_SCHEMA_VERSION;
        normalize_active_library(&mut config);
        validate_config(&config)?;
        config_store::save(path, &config)?;
        Ok(config)
    }

    pub fn save(path: &Path, mut config: AppConfig) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        config.schema_version = APP_CONFIG_SCHEMA_VERSION;
        normalize_active_library(&mut config);
        validate_config(&config)?;
        config_store::save(path, &config)?;
        Ok(config)
    }

    pub fn write_mobile_state(
        path: &Path,
        preferences: AppPreferences,
        mobile_json: Option<&str>,
    ) -> Result<AppConfig, CoreError> {
        let mobile = mobile_json
            .map(|mobile_json| {
                serde_json::from_str(mobile_json)
                    .map_err(|error| CoreError::Config(format!("INVALID_MOBILE_CONFIG: {error}")))
            })
            .transpose()?;
        let _guard = lock_config();
        let mut config = config_store::load(path)?.unwrap_or_else(AppConfig::empty);
        validate_config(&config)?;
        config.preferences = preferences;
        config.mobile = mobile;
        config_store::save(path, &config)?;
        Ok(config)
    }

    pub fn write_desktop_state(
        path: &Path,
        desktop_state: AppConfig,
    ) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        let mut config = config_store::load(path)?.unwrap_or_else(AppConfig::empty);
        validate_config(&config)?;
        config.device_id = desktop_state.device_id;
        config.preferences = desktop_state.preferences;
        config.data_sources = merge_data_sources(desktop_state.data_sources, config.data_sources);
        config.libraries = merge_libraries(desktop_state.libraries, config.libraries);
        config.active_library_id = desktop_state.active_library_id;
        merge_object(&mut config.desktop, desktop_state.desktop);
        config.extensions.remove("readerUi");
        normalize_active_library(&mut config);
        validate_config(&config)?;
        config_store::save(path, &config)?;
        Ok(config)
    }

    pub(crate) fn upsert_data_source(
        path: &Path,
        source: DataSource,
    ) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        validate_data_source(&source)?;
        mutate(path, |state| {
            ensure_data_source_can_upsert_in(state, &source)?;
            if let Some(existing) = state
                .data_sources
                .iter_mut()
                .find(|existing| existing.id() == source.id())
            {
                *existing = source;
            } else {
                state.data_sources.push(source);
            }
            Ok(())
        })
    }

    pub(crate) fn prepare_data_source(mut source: DataSource) -> Result<DataSource, CoreError> {
        match &mut source {
            DataSource::Local {
                id,
                name,
                root_path,
                ..
            } => {
                normalize_id(id);
                *name = name.trim().to_owned();
                *root_path = root_path.trim().to_owned();
            }
            DataSource::Webdav {
                id,
                name,
                endpoint,
                username,
                root_path,
                ..
            } => {
                normalize_id(id);
                *name = name.trim().to_owned();
                *endpoint = endpoint.trim().trim_end_matches('/').to_owned();
                *username = username.trim().to_owned();
                *root_path = normalize_optional_text(root_path.take());
            }
            DataSource::Onedrive {
                id,
                name,
                client_id,
                tenant_id,
                display_name,
                email,
                root_path,
                ..
            } => {
                normalize_id(id);
                *name = name.trim().to_owned();
                *client_id = client_id.trim().to_owned();
                *tenant_id =
                    normalize_optional_text(tenant_id.take()).or_else(|| Some("consumers".into()));
                *display_name = normalize_optional_text(display_name.take());
                *email = normalize_optional_text(email.take());
                *root_path = normalize_optional_text(root_path.take());
            }
        }
        validate_data_source(&source)?;
        Ok(source)
    }

    pub(crate) fn ensure_data_source_can_upsert(
        path: &Path,
        source: &DataSource,
    ) -> Result<(), CoreError> {
        let _guard = lock_config();
        validate_data_source(source)?;
        let state = config_store::load(path)?.unwrap_or_else(AppConfig::empty);
        validate_config(&state)?;
        ensure_data_source_can_upsert_in(&state, source)
    }

    pub(crate) fn add_local_data_source(
        path: &Path,
        name: &str,
        root_path: &str,
    ) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        let name = name.trim();
        let root_path = root_path.trim();
        if name.is_empty() {
            return Err(CoreError::Config("DATASOURCE_NAME_REQUIRED".into()));
        }
        if root_path.is_empty() {
            return Err(CoreError::Config("LOCAL_ROOT_PATH_REQUIRED".into()));
        }

        let canonical = dunce::canonicalize(root_path)
            .map_err(|error| CoreError::Config(format!("INVALID_DATASOURCE_PATH: {error}")))?;
        if !canonical.is_dir() {
            return Err(CoreError::Config("DATASOURCE_PATH_NOT_DIR".into()));
        }
        let canonical = canonical.to_string_lossy().into_owned();

        mutate(path, |state| {
            if state.data_sources.iter().any(|source| {
                matches!(
                    source,
                    DataSource::Local { root_path, .. } if root_path == &canonical
                )
            }) {
                return Err(CoreError::Config("LOCAL_DATASOURCE_ALREADY_EXISTS".into()));
            }
            state.data_sources.push(DataSource::Local {
                id: Uuid::new_v4().to_string(),
                name: name.to_owned(),
                enabled: true,
                root_path: canonical,
                readonly: None,
                created_at: None,
            });
            Ok(())
        })
    }

    pub(crate) fn remove_data_source(path: &Path, id: &str) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        mutate(path, |state| {
            let library_names = state
                .libraries
                .iter()
                .filter(|library| library.data_source_id.as_deref() == Some(id))
                .map(|library| library.name.clone())
                .collect::<Vec<_>>();
            if !library_names.is_empty() {
                return Err(CoreError::Config(format!(
                    "DATA_SOURCE_IN_USE: {}",
                    library_names.join("、")
                )));
            }

            let before = state.data_sources.len();
            state.data_sources.retain(|source| source.id() != id);
            if state.data_sources.len() == before {
                return Err(CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {id}")));
            }
            Ok(())
        })
    }

    pub(crate) fn add_library(path: &Path, mut library: Library) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        validate_library(&library)?;
        if library.id.trim().is_empty() {
            library.id = Uuid::new_v4().to_string();
        }

        mutate(path, |state| {
            ensure_library_can_add_in(state, &library)?;

            let id = library.id.clone();
            state.libraries.push(library);
            state.active_library_id.get_or_insert(id);
            Ok(())
        })
    }

    pub(crate) fn ensure_library_can_add(path: &Path, library: &Library) -> Result<(), CoreError> {
        let _guard = lock_config();
        validate_library(library)?;
        let state = config_store::load(path)?.unwrap_or_else(AppConfig::empty);
        validate_config(&state)?;
        ensure_library_can_add_in(&state, library)
    }

    pub(crate) fn replace_library(path: &Path, library: Library) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        validate_library(&library)?;
        mutate(path, |state| {
            let existing = state
                .libraries
                .iter_mut()
                .find(|existing| existing.id == library.id)
                .ok_or_else(|| CoreError::NotFound(format!("LIBRARY_NOT_FOUND: {}", library.id)))?;
            *existing = library;
            Ok(())
        })
    }

    pub(crate) fn remove_library(path: &Path, id: &str) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        mutate(path, |state| {
            state.libraries.retain(|library| library.id != id);
            normalize_active_library(state);
            Ok(())
        })
    }

    pub(crate) fn switch_library(path: &Path, id: &str) -> Result<AppConfig, CoreError> {
        let _guard = lock_config();
        mutate(path, |state| {
            if !state.libraries.iter().any(|library| library.id == id) {
                return Err(CoreError::NotFound(format!("LIBRARY_NOT_FOUND: {id}")));
            }
            state.active_library_id = Some(id.to_owned());
            Ok(())
        })
    }
}

fn mutate(
    path: &Path,
    mutation: impl FnOnce(&mut AppConfig) -> Result<(), CoreError>,
) -> Result<AppConfig, CoreError> {
    let mut state = config_store::load(path)?.unwrap_or_else(AppConfig::empty);
    validate_config(&state)?;
    mutation(&mut state)?;
    validate_config(&state)?;
    config_store::save(path, &state)?;
    Ok(state)
}

fn merge_data_sources(
    next_sources: Vec<DataSource>,
    existing_sources: Vec<DataSource>,
) -> Vec<DataSource> {
    next_sources
        .into_iter()
        .map(|mut next| {
            let Some(existing) = existing_sources
                .iter()
                .find(|existing| existing.id() == next.id())
            else {
                return next;
            };
            match (&mut next, existing) {
                (
                    DataSource::Local {
                        readonly,
                        created_at,
                        ..
                    },
                    DataSource::Local {
                        readonly: existing_readonly,
                        created_at: existing_created_at,
                        ..
                    },
                )
                | (
                    DataSource::Webdav {
                        readonly,
                        created_at,
                        ..
                    },
                    DataSource::Webdav {
                        readonly: existing_readonly,
                        created_at: existing_created_at,
                        ..
                    },
                )
                | (
                    DataSource::Onedrive {
                        readonly,
                        created_at,
                        ..
                    },
                    DataSource::Onedrive {
                        readonly: existing_readonly,
                        created_at: existing_created_at,
                        ..
                    },
                ) => {
                    *readonly = *existing_readonly;
                    *created_at = *existing_created_at;
                }
                _ => {}
            }
            next
        })
        .collect()
}

fn merge_libraries(next_libraries: Vec<Library>, existing_libraries: Vec<Library>) -> Vec<Library> {
    next_libraries
        .into_iter()
        .map(|mut next| {
            if let Some(existing) = existing_libraries
                .iter()
                .find(|existing| existing.id == next.id)
            {
                next.book_count = existing.book_count;
                next.metadata_uri.clone_from(&existing.metadata_uri);
                next.added_at = existing.added_at;
                next.metadata_etag.clone_from(&existing.metadata_etag);
                next.security_scoped_bookmark
                    .clone_from(&existing.security_scoped_bookmark);
            }
            next
        })
        .collect()
}

fn merge_object(current: &mut Option<serde_json::Value>, next: Option<serde_json::Value>) {
    let Some(next) = next else {
        return;
    };
    match (
        current.as_mut().and_then(serde_json::Value::as_object_mut),
        next,
    ) {
        (Some(current), serde_json::Value::Object(next)) => current.extend(next),
        (_, next) => *current = Some(next),
    }
}

fn validate_config(state: &AppConfig) -> Result<(), CoreError> {
    if state.schema_version != APP_CONFIG_SCHEMA_VERSION {
        return Err(CoreError::Config(format!(
            "UNSUPPORTED_APP_CONFIG_VERSION: {}",
            state.schema_version
        )));
    }
    for source in &state.data_sources {
        validate_data_source(source)?;
    }
    for library in &state.libraries {
        validate_library(library)?;
    }
    if let Some(active_id) = &state.active_library_id {
        if !state
            .libraries
            .iter()
            .any(|library| &library.id == active_id)
        {
            return Err(CoreError::Config("ACTIVE_LIBRARY_NOT_FOUND".into()));
        }
    }
    Ok(())
}

fn validate_data_source(source: &DataSource) -> Result<(), CoreError> {
    if source.id().trim().is_empty() {
        return Err(CoreError::Config("DATASOURCE_ID_REQUIRED".into()));
    }
    if source.name().trim().is_empty() {
        return Err(CoreError::Config("DATASOURCE_NAME_REQUIRED".into()));
    }
    match source {
        DataSource::Local { root_path, .. } => {
            if root_path.trim().is_empty() {
                return Err(CoreError::Config("LOCAL_ROOT_PATH_REQUIRED".into()));
            }
        }
        DataSource::Webdav {
            endpoint, username, ..
        } => {
            if endpoint.trim().is_empty() {
                return Err(CoreError::Config("WEBDAV_ENDPOINT_REQUIRED".into()));
            }
            let endpoint = url::Url::parse(endpoint.trim())
                .map_err(|error| CoreError::Config(format!("INVALID_WEBDAV_ENDPOINT: {error}")))?;
            if endpoint.scheme() != "http" && endpoint.scheme() != "https" {
                return Err(CoreError::Config("INVALID_WEBDAV_ENDPOINT_SCHEME".into()));
            }
            if username.trim().is_empty() {
                return Err(CoreError::Config("WEBDAV_USERNAME_REQUIRED".into()));
            }
        }
        DataSource::Onedrive { .. } => {}
    }
    Ok(())
}

fn normalize_id(id: &mut String) {
    *id = if id.trim().is_empty() {
        Uuid::new_v4().to_string()
    } else {
        id.trim().to_owned()
    };
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn validate_library(library: &Library) -> Result<(), CoreError> {
    if library.name.trim().is_empty() {
        return Err(CoreError::Config("LIBRARY_NAME_REQUIRED".into()));
    }
    if library.path.trim().is_empty() {
        return Err(CoreError::Config("LIBRARY_PATH_REQUIRED".into()));
    }
    Ok(())
}

fn normalize_active_library(state: &mut AppConfig) {
    if state.active_library_id.as_ref().is_some_and(|active_id| {
        state
            .libraries
            .iter()
            .any(|library| &library.id == active_id)
    }) {
        return;
    }
    state.active_library_id = state.libraries.first().map(|library| library.id.clone());
}

fn same_non_empty(left: Option<&str>, right: Option<&str>) -> bool {
    left.is_some_and(|left| !left.is_empty() && right == Some(left))
}

fn same_remote_library(left: &Library, right: &Library) -> bool {
    left.source_type == right.source_type
        && left.data_source_id == right.data_source_id
        && left
            .source_path
            .as_deref()
            .zip(right.source_path.as_deref())
            .is_some_and(|(left, right)| left.trim_matches('/') == right.trim_matches('/'))
}

fn ensure_library_can_add_in(state: &AppConfig, library: &Library) -> Result<(), CoreError> {
    if let Some(data_source_id) = library.data_source_id.as_deref() {
        let source = state
            .data_sources
            .iter()
            .find(|source| source.id() == data_source_id)
            .ok_or_else(|| {
                CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}"))
            })?;
        if library.source_type.as_deref() != Some(source.kind()) {
            return Err(CoreError::Config("LIBRARY_DATASOURCE_TYPE_MISMATCH".into()));
        }
    }
    if state.libraries.iter().any(|existing| {
        existing.id == library.id
            || same_non_empty(
                existing.metadata_uri.as_deref(),
                library.metadata_uri.as_deref(),
            )
            || existing.path == library.path
            || same_remote_library(existing, library)
    }) {
        return Err(CoreError::Config("LIBRARY_ALREADY_EXISTS".into()));
    }
    Ok(())
}

fn ensure_data_source_can_upsert_in(
    state: &AppConfig,
    source: &DataSource,
) -> Result<(), CoreError> {
    let duplicate = state
        .data_sources
        .iter()
        .filter(|existing| existing.id() != source.id())
        .any(|existing| match (existing, source) {
            (
                DataSource::Local {
                    root_path: existing,
                    ..
                },
                DataSource::Local { root_path, .. },
            ) => existing == root_path,
            (
                DataSource::Webdav {
                    endpoint: existing_endpoint,
                    username: existing_username,
                    ..
                },
                DataSource::Webdav {
                    endpoint, username, ..
                },
            ) => {
                existing_endpoint.trim_end_matches('/') == endpoint.trim_end_matches('/')
                    && existing_username == username
            }
            (
                DataSource::Onedrive {
                    email: Some(existing),
                    ..
                },
                DataSource::Onedrive {
                    email: Some(email), ..
                },
            ) => !existing.trim().is_empty() && existing.eq_ignore_ascii_case(email),
            _ => false,
        });
    if !duplicate {
        return Ok(());
    }
    let code = match source {
        DataSource::Local { .. } => "LOCAL_DATASOURCE_ALREADY_EXISTS",
        DataSource::Webdav { .. } => "WEBDAV_DATASOURCE_ALREADY_EXISTS",
        DataSource::Onedrive { .. } => "ONEDRIVE_DATASOURCE_ALREADY_EXISTS",
    };
    Err(CoreError::Config(code.into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};

    fn local_library(id: &str, path: &str) -> Library {
        Library {
            id: id.into(),
            name: id.into(),
            path: path.into(),
            book_count: 0,
            metadata_uri: None,
            added_at: None,
            data_source_id: None,
            source_type: Some("local".into()),
            source_path: None,
            metadata_etag: None,
            security_scoped_bookmark: None,
        }
    }

    #[test]
    fn should_select_first_library_when_library_is_added_to_empty_state() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");

        let state = ConfigService::add_library(&path, local_library("one", "/library")).unwrap();

        assert_eq!(state.active_library_id.as_deref(), Some("one"));
        assert_eq!(state.libraries.len(), 1);
    }

    #[test]
    fn should_reject_duplicate_path_when_library_id_is_different() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        ConfigService::add_library(&path, local_library("one", "/library")).unwrap();

        let error =
            ConfigService::add_library(&path, local_library("two", "/library")).unwrap_err();

        assert!(error.to_string().contains("LIBRARY_ALREADY_EXISTS"));
    }

    #[test]
    fn should_select_next_library_when_active_library_is_removed() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        ConfigService::add_library(&path, local_library("one", "/one")).unwrap();
        ConfigService::add_library(&path, local_library("two", "/two")).unwrap();

        let state = ConfigService::remove_library(&path, "one").unwrap();

        assert_eq!(state.active_library_id.as_deref(), Some("two"));
    }

    #[test]
    fn should_reject_removal_when_library_uses_data_source() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let source = DataSource::Webdav {
            id: "source".into(),
            name: "Source".into(),
            enabled: true,
            endpoint: "https://example.com".into(),
            username: "reader".into(),
            root_path: None,
            has_password: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
        };
        ConfigService::upsert_data_source(&path, source).unwrap();
        let mut library = local_library("library", "/library");
        library.source_type = Some("webdav".into());
        library.data_source_id = Some("source".into());
        library.source_path = Some("/books".into());
        ConfigService::add_library(&path, library).unwrap();

        let error = ConfigService::remove_data_source(&path, "source").unwrap_err();

        assert!(error.to_string().contains("DATA_SOURCE_IN_USE"));
    }

    #[test]
    fn should_reject_duplicate_webdav_account_when_data_source_id_differs() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let source = |id: &str| DataSource::Webdav {
            id: id.into(),
            name: id.into(),
            enabled: true,
            endpoint: "https://example.com/dav/".into(),
            username: "reader".into(),
            root_path: None,
            has_password: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
        };
        ConfigService::upsert_data_source(&path, source("one")).unwrap();

        let error = ConfigService::upsert_data_source(&path, source("two")).unwrap_err();

        assert!(error
            .to_string()
            .contains("WEBDAV_DATASOURCE_ALREADY_EXISTS"));
    }

    #[test]
    fn should_assign_id_and_normalize_fields_when_data_source_is_prepared() {
        let source = ConfigService::prepare_data_source(DataSource::Webdav {
            id: " ".into(),
            name: " Books ".into(),
            enabled: true,
            endpoint: " https://example.com/dav/ ".into(),
            username: " reader ".into(),
            root_path: Some(" /Library/ ".into()),
            has_password: true,
            credential_reference: None,
            readonly: None,
            created_at: None,
        })
        .unwrap();

        let DataSource::Webdav {
            id,
            name,
            endpoint,
            username,
            root_path,
            ..
        } = source
        else {
            panic!("expected WebDAV data source");
        };
        assert!(Uuid::parse_str(&id).is_ok());
        assert_eq!(name, "Books");
        assert_eq!(endpoint, "https://example.com/dav");
        assert_eq!(username, "reader");
        assert_eq!(root_path.as_deref(), Some("/Library/"));
    }

    #[test]
    fn should_reject_source_type_mismatch_when_library_is_added() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        ConfigService::upsert_data_source(
            &path,
            DataSource::Webdav {
                id: "source".into(),
                name: "Source".into(),
                enabled: true,
                endpoint: "https://example.com".into(),
                username: "reader".into(),
                root_path: None,
                has_password: true,
                credential_reference: None,
                readonly: None,
                created_at: None,
            },
        )
        .unwrap();
        let mut library = local_library("library", "/library");
        library.data_source_id = Some("source".into());
        library.source_type = Some("onedrive".into());
        library.source_path = Some("/Books".into());

        let error = ConfigService::add_library(&path, library).unwrap_err();

        assert!(error
            .to_string()
            .contains("LIBRARY_DATASOURCE_TYPE_MISMATCH"));
    }

    #[test]
    fn should_preserve_both_writes_when_libraries_are_added_concurrently() {
        let directory = tempfile::tempdir().unwrap();
        let path = Arc::new(directory.path().join("config.json"));
        let barrier = Arc::new(Barrier::new(3));
        let handles = [("one", "/one"), ("two", "/two")].map(|(id, library_path)| {
            let path = Arc::clone(&path);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                ConfigService::add_library(&path, local_library(id, library_path)).unwrap();
            })
        });

        barrier.wait();
        for handle in handles {
            handle.join().unwrap();
        }

        let state = config_store::load(&path).unwrap().unwrap();
        assert_eq!(state.libraries.len(), 2);
    }

    #[test]
    fn should_preserve_initial_config_when_config_file_is_missing() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let mut initial_state = AppConfig::empty();
        initial_state
            .libraries
            .push(local_library("library", "/library"));
        initial_state.active_library_id = Some("library".into());

        let state = ConfigService::load_or_initialize(&path, Some(initial_state.clone())).unwrap();

        assert_eq!(state, initial_state);
        assert_eq!(
            ConfigService::load_or_initialize(&path, None)
                .unwrap()
                .libraries,
            initial_state.libraries
        );
    }

    #[test]
    fn should_preserve_application_preferences_when_library_config_changes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&serde_json::json!({
                "schemaVersion": 1,
                "preferences": {
                    "theme": "dark",
                    "language": "zh-CN"
                },
                "mobile": {
                    "state": {
                        "libraryViewMode": "list"
                    },
                    "version": 0
                },
                "dataSources": [],
                "libraries": [],
                "activeLibraryId": null
            }))
            .unwrap(),
        )
        .unwrap();

        ConfigService::add_library(&path, local_library("one", "/library")).unwrap();

        let persisted: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(persisted["preferences"]["theme"], "dark");
        assert_eq!(persisted["preferences"]["language"], "zh-CN");
        assert_eq!(persisted["mobile"]["state"]["libraryViewMode"], "list");
        assert_eq!(persisted["libraries"][0]["id"], "one");
    }

    #[test]
    fn should_preserve_library_and_desktop_state_when_mobile_config_changes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let mut config = AppConfig::empty();
        config.libraries.push(local_library("one", "/library"));
        config.active_library_id = Some("one".into());
        config.desktop = Some(serde_json::json!({
            "readerUi": {
                "libraryViewMode": "list"
            }
        }));
        ConfigService::save(&path, config).unwrap();

        let config = ConfigService::write_mobile_state(
            &path,
            AppPreferences {
                theme: "dark".into(),
                language: "zh-CN".into(),
            },
            Some(r#"{"state":{"libraryViewMode":"grid"},"version":0}"#),
        )
        .unwrap();

        assert_eq!(config.libraries[0].id, "one");
        assert_eq!(config.active_library_id.as_deref(), Some("one"));
        assert_eq!(
            config.desktop.as_ref().unwrap()["readerUi"]["libraryViewMode"],
            "list"
        );
        assert_eq!(config.preferences.theme, "dark");
        assert_eq!(
            config.mobile.as_ref().unwrap()["state"]["libraryViewMode"],
            "grid"
        );
    }
}
