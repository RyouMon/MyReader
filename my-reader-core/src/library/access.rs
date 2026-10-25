use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex},
};

use tokio::sync::{OwnedRwLockReadGuard, RwLock};

use super::source;
use crate::infrastructure::config_store;
use crate::{
    models::{LibraryStorageConfig, RemoteCredential},
    CoreError,
};

pub(crate) struct Registry {
    pub config_path: PathBuf,
    pub library_id: String,
}

// After a repair, validate queued storage snapshots against the registry on disk.
// Reading it again also permits later data-source root or endpoint changes.
type Gate = Arc<RwLock<Option<Registry>>>;
static GATES: LazyLock<Mutex<HashMap<PathBuf, Gate>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub(crate) fn gate(sidecar_root: &Path) -> Gate {
    let mut gates = GATES.lock().unwrap_or_else(|error| error.into_inner());
    gates
        .entry(dunce::canonicalize(sidecar_root).unwrap_or_else(|_| sidecar_root.to_path_buf()))
        .or_default()
        .clone()
}

fn destination(storage: &LibraryStorageConfig) -> String {
    match storage {
        LibraryStorageConfig::LocalDirect { root } => format!("local:{root}"),
        LibraryStorageConfig::Webdav { endpoint, root, .. } => {
            format!("webdav:{endpoint}:{}", root.as_deref().unwrap_or("/"))
        }
        LibraryStorageConfig::Onedrive { root, .. } => {
            format!("onedrive:{}", root.as_deref().unwrap_or("/"))
        }
    }
}

impl Registry {
    fn current_storage(
        &self,
        snapshot: &LibraryStorageConfig,
    ) -> Result<LibraryStorageConfig, CoreError> {
        // Config writes atomically replace the file. Resolve the saved source
        // directly so access coordination never calls back into a service.
        let config = config_store::load(&self.config_path)?
            .ok_or_else(|| CoreError::Config("APP_CONFIG_NOT_FOUND".into()))?;
        let library = config
            .libraries
            .iter()
            .find(|library| library.id == self.library_id)
            .ok_or_else(|| CoreError::LibraryNotFound(self.library_id.clone()))?;
        let credential = match snapshot {
            LibraryStorageConfig::Webdav { password, .. } => Some(RemoteCredential::Webdav {
                password: password.clone(),
            }),
            LibraryStorageConfig::Onedrive { access_token, .. } => {
                Some(RemoteCredential::Onedrive {
                    access_token: access_token.clone(),
                })
            }
            _ => None,
        };
        let root = source::native_path(&library.path);
        source::resolve_storage(
            &config,
            &self.library_id,
            &root.to_string_lossy(),
            credential.as_ref(),
        )
    }
}

pub(crate) async fn acquire(
    sidecar_root: &Path,
    storage: &LibraryStorageConfig,
) -> Result<OwnedRwLockReadGuard<Option<Registry>>, CoreError> {
    let guard = gate(sidecar_root).read_owned().await;
    if let Some(registry) = guard.as_ref() {
        if destination(&registry.current_storage(storage)?) != destination(storage) {
            return Err(CoreError::Config("LIBRARY_LOCATION_CHANGED".into()));
        }
    }
    Ok(guard)
}
