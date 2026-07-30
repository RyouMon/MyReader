use std::{
    path::Path,
    sync::{LazyLock, Mutex, MutexGuard},
};

use uuid::Uuid;

use crate::{
    infrastructure::registry_store,
    models::{DataSource, DeviceRegistry, Library, DEVICE_REGISTRY_SCHEMA_VERSION},
    CoreError,
};

static REGISTRY_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

fn lock_registry() -> MutexGuard<'static, ()> {
    REGISTRY_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(crate) fn load_or_initialize(
    path: &Path,
    legacy: Option<DeviceRegistry>,
) -> Result<DeviceRegistry, CoreError> {
    let _guard = lock_registry();
    if let Some(registry) = registry_store::load(path)? {
        validate_registry(&registry)?;
        return Ok(registry);
    }

    let mut registry = legacy.unwrap_or_else(DeviceRegistry::empty);
    registry.schema_version = DEVICE_REGISTRY_SCHEMA_VERSION;
    normalize_active_library(&mut registry);
    validate_registry(&registry)?;
    registry_store::save(path, &registry)?;
    Ok(registry)
}

pub(crate) fn upsert_data_source(
    path: &Path,
    source: DataSource,
) -> Result<DeviceRegistry, CoreError> {
    let _guard = lock_registry();
    validate_data_source(&source)?;
    mutate(path, |registry| {
        ensure_data_source_can_upsert_in(registry, &source)?;
        if let Some(existing) = registry
            .data_sources
            .iter_mut()
            .find(|existing| existing.id() == source.id())
        {
            *existing = source;
        } else {
            registry.data_sources.push(source);
        }
        Ok(())
    })
}

pub(crate) fn ensure_data_source_can_upsert(
    path: &Path,
    source: &DataSource,
) -> Result<(), CoreError> {
    let _guard = lock_registry();
    validate_data_source(source)?;
    let registry = registry_store::load(path)?.unwrap_or_else(DeviceRegistry::empty);
    validate_registry(&registry)?;
    ensure_data_source_can_upsert_in(&registry, source)
}

pub(crate) fn add_local_data_source(
    path: &Path,
    name: &str,
    root_path: &str,
) -> Result<DeviceRegistry, CoreError> {
    let _guard = lock_registry();
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

    mutate(path, |registry| {
        if registry.data_sources.iter().any(|source| {
            matches!(
                source,
                DataSource::Local { root_path, .. } if root_path == &canonical
            )
        }) {
            return Err(CoreError::Config("LOCAL_DATASOURCE_ALREADY_EXISTS".into()));
        }
        registry.data_sources.push(DataSource::Local {
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

pub(crate) fn remove_data_source(path: &Path, id: &str) -> Result<DeviceRegistry, CoreError> {
    let _guard = lock_registry();
    mutate(path, |registry| {
        let library_names = registry
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

        let before = registry.data_sources.len();
        registry.data_sources.retain(|source| source.id() != id);
        if registry.data_sources.len() == before {
            return Err(CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {id}")));
        }
        Ok(())
    })
}

pub(crate) fn register_library(
    path: &Path,
    mut library: Library,
) -> Result<DeviceRegistry, CoreError> {
    let _guard = lock_registry();
    validate_library(&library)?;
    if library.id.trim().is_empty() {
        library.id = Uuid::new_v4().to_string();
    }

    mutate(path, |registry| {
        ensure_library_can_register_in(registry, &library)?;

        let id = library.id.clone();
        registry.libraries.push(library);
        registry.active_library_id.get_or_insert(id);
        Ok(())
    })
}

pub(crate) fn ensure_library_can_register(path: &Path, library: &Library) -> Result<(), CoreError> {
    let _guard = lock_registry();
    validate_library(library)?;
    let registry = registry_store::load(path)?.unwrap_or_else(DeviceRegistry::empty);
    validate_registry(&registry)?;
    ensure_library_can_register_in(&registry, library)
}

pub(crate) fn replace_library(path: &Path, library: Library) -> Result<DeviceRegistry, CoreError> {
    let _guard = lock_registry();
    validate_library(&library)?;
    mutate(path, |registry| {
        let existing = registry
            .libraries
            .iter_mut()
            .find(|existing| existing.id == library.id)
            .ok_or_else(|| CoreError::NotFound(format!("LIBRARY_NOT_FOUND: {}", library.id)))?;
        *existing = library;
        Ok(())
    })
}

pub(crate) fn remove_library(path: &Path, id: &str) -> Result<DeviceRegistry, CoreError> {
    let _guard = lock_registry();
    mutate(path, |registry| {
        registry.libraries.retain(|library| library.id != id);
        normalize_active_library(registry);
        Ok(())
    })
}

pub(crate) fn switch_library(path: &Path, id: &str) -> Result<DeviceRegistry, CoreError> {
    let _guard = lock_registry();
    mutate(path, |registry| {
        if !registry.libraries.iter().any(|library| library.id == id) {
            return Err(CoreError::NotFound(format!("LIBRARY_NOT_FOUND: {id}")));
        }
        registry.active_library_id = Some(id.to_owned());
        Ok(())
    })
}

fn mutate(
    path: &Path,
    mutation: impl FnOnce(&mut DeviceRegistry) -> Result<(), CoreError>,
) -> Result<DeviceRegistry, CoreError> {
    let mut registry = registry_store::load(path)?.unwrap_or_else(DeviceRegistry::empty);
    validate_registry(&registry)?;
    mutation(&mut registry)?;
    validate_registry(&registry)?;
    registry_store::save(path, &registry)?;
    Ok(registry)
}

fn validate_registry(registry: &DeviceRegistry) -> Result<(), CoreError> {
    if registry.schema_version != DEVICE_REGISTRY_SCHEMA_VERSION {
        return Err(CoreError::Config(format!(
            "UNSUPPORTED_DEVICE_REGISTRY_VERSION: {}",
            registry.schema_version
        )));
    }
    for source in &registry.data_sources {
        validate_data_source(source)?;
    }
    for library in &registry.libraries {
        validate_library(library)?;
    }
    if let Some(active_id) = &registry.active_library_id {
        if !registry
            .libraries
            .iter()
            .any(|library| &library.id == active_id)
        {
            return Err(CoreError::Config("ACTIVE_LIBRARY_NOT_REGISTERED".into()));
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

fn validate_library(library: &Library) -> Result<(), CoreError> {
    if library.name.trim().is_empty() {
        return Err(CoreError::Config("LIBRARY_NAME_REQUIRED".into()));
    }
    if library.path.trim().is_empty() {
        return Err(CoreError::Config("LIBRARY_PATH_REQUIRED".into()));
    }
    Ok(())
}

fn normalize_active_library(registry: &mut DeviceRegistry) {
    if registry
        .active_library_id
        .as_ref()
        .is_some_and(|active_id| {
            registry
                .libraries
                .iter()
                .any(|library| &library.id == active_id)
        })
    {
        return;
    }
    registry.active_library_id = registry.libraries.first().map(|library| library.id.clone());
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

fn ensure_library_can_register_in(
    registry: &DeviceRegistry,
    library: &Library,
) -> Result<(), CoreError> {
    if let Some(data_source_id) = library.data_source_id.as_deref() {
        let source = registry
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
    if registry.libraries.iter().any(|existing| {
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
    registry: &DeviceRegistry,
    source: &DataSource,
) -> Result<(), CoreError> {
    let duplicate = registry
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
    fn register_library_should_select_first_library_when_registry_is_empty() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("registry.json");

        let registry = register_library(&path, local_library("one", "/library")).unwrap();

        assert_eq!(registry.active_library_id.as_deref(), Some("one"));
        assert_eq!(registry.libraries.len(), 1);
    }

    #[test]
    fn register_library_should_reject_duplicate_path_when_id_is_different() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("registry.json");
        register_library(&path, local_library("one", "/library")).unwrap();

        let error = register_library(&path, local_library("two", "/library")).unwrap_err();

        assert!(error.to_string().contains("LIBRARY_ALREADY_EXISTS"));
    }

    #[test]
    fn remove_library_should_select_next_library_when_active_library_is_removed() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("registry.json");
        register_library(&path, local_library("one", "/one")).unwrap();
        register_library(&path, local_library("two", "/two")).unwrap();

        let registry = remove_library(&path, "one").unwrap();

        assert_eq!(registry.active_library_id.as_deref(), Some("two"));
    }

    #[test]
    fn remove_data_source_should_reject_removal_when_library_uses_source() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("registry.json");
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
        upsert_data_source(&path, source).unwrap();
        let mut library = local_library("library", "/library");
        library.source_type = Some("webdav".into());
        library.data_source_id = Some("source".into());
        library.source_path = Some("/books".into());
        register_library(&path, library).unwrap();

        let error = remove_data_source(&path, "source").unwrap_err();

        assert!(error.to_string().contains("DATA_SOURCE_IN_USE"));
    }

    #[test]
    fn upsert_data_source_should_reject_duplicate_webdav_account_when_id_differs() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("registry.json");
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
        upsert_data_source(&path, source("one")).unwrap();

        let error = upsert_data_source(&path, source("two")).unwrap_err();

        assert!(error
            .to_string()
            .contains("WEBDAV_DATASOURCE_ALREADY_EXISTS"));
    }

    #[test]
    fn register_library_should_reject_source_type_mismatch_when_source_is_registered() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("registry.json");
        upsert_data_source(
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

        let error = register_library(&path, library).unwrap_err();

        assert!(error
            .to_string()
            .contains("LIBRARY_DATASOURCE_TYPE_MISMATCH"));
    }

    #[test]
    fn register_library_should_preserve_both_writes_when_calls_are_concurrent() {
        let directory = tempfile::tempdir().unwrap();
        let path = Arc::new(directory.path().join("registry.json"));
        let barrier = Arc::new(Barrier::new(3));
        let handles = [("one", "/one"), ("two", "/two")].map(|(id, library_path)| {
            let path = Arc::clone(&path);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                register_library(&path, local_library(id, library_path)).unwrap();
            })
        });

        barrier.wait();
        for handle in handles {
            handle.join().unwrap();
        }

        let registry = registry_store::load(&path).unwrap().unwrap();
        assert_eq!(registry.libraries.len(), 2);
    }

    #[test]
    fn load_or_initialize_should_preserve_legacy_registry_when_file_is_missing() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("registry.json");
        let mut legacy = DeviceRegistry::empty();
        legacy.libraries.push(local_library("library", "/library"));
        legacy.active_library_id = Some("library".into());

        let registry = load_or_initialize(&path, Some(legacy.clone())).unwrap();

        assert_eq!(registry, legacy);
        assert_eq!(
            load_or_initialize(&path, None).unwrap().libraries,
            legacy.libraries
        );
    }
}
