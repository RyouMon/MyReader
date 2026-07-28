use std::path::Path;

use opendal::Operator;

use crate::{
    infrastructure::{registry_store, storage},
    models::{DataSource, RemoteCredential, RemoteDirectoryEntry},
    CoreError,
};

pub(crate) async fn test_connection(
    source: &DataSource,
    credential: &RemoteCredential,
) -> Result<(), CoreError> {
    storage::build_remote_operator(source, credential)?
        .check()
        .await
        .map_err(|error| storage::remote_storage_error(source, error))
}

pub(crate) async fn list_directories(
    registry_path: &Path,
    data_source_id: &str,
    path: &str,
    credential: &RemoteCredential,
) -> Result<Vec<RemoteDirectoryEntry>, CoreError> {
    let registry = registry_store::load(registry_path)?
        .ok_or_else(|| CoreError::NotFound("DEVICE_REGISTRY_NOT_FOUND".into()))?;
    let source = registry
        .data_sources
        .iter()
        .find(|source| source.id() == data_source_id)
        .ok_or_else(|| CoreError::NotFound(format!("DATASOURCE_NOT_FOUND: {data_source_id}")))?;
    let operator = storage::build_remote_operator(source, credential)?;
    list_directories_with_operator(&operator, path, Some(source)).await
}

async fn list_directories_with_operator(
    operator: &Operator,
    path: &str,
    source: Option<&DataSource>,
) -> Result<Vec<RemoteDirectoryEntry>, CoreError> {
    let normalized = storage::normalize_remote_path(path)?;
    let directory = if normalized.is_empty() {
        String::new()
    } else {
        format!("{normalized}/")
    };
    let mut entries = operator
        .list(&directory)
        .await
        .map_err(|error| match source {
            Some(source) => storage::remote_storage_error(source, error),
            None => storage::storage_error(error),
        })?
        .into_iter()
        .filter(|entry| entry.metadata().is_dir())
        .filter_map(|entry| {
            let entry_path = entry.path().trim_matches('/');
            if entry_path == normalized {
                return None;
            }
            let name = entry_path.rsplit('/').next()?.to_owned();
            if name.is_empty() {
                return None;
            }
            Some(RemoteDirectoryEntry {
                name,
                path: format!("/{entry_path}"),
                is_directory: true,
            })
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use opendal::services::Fs;

    use super::*;

    #[tokio::test]
    async fn list_directories_should_return_only_immediate_directories_when_path_is_browsed() {
        let remote = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(remote.path().join("Books/One")).unwrap();
        std::fs::create_dir_all(remote.path().join("Books/Two")).unwrap();
        std::fs::write(remote.path().join("Books/file.txt"), b"content").unwrap();
        let operator = Operator::new(
            Fs::default().root(remote.path().to_str().expect("temporary path is UTF-8")),
        )
        .unwrap()
        .finish();

        let entries = list_directories_with_operator(&operator, "/Books", None)
            .await
            .unwrap();

        assert_eq!(
            entries,
            vec![
                RemoteDirectoryEntry {
                    name: "One".into(),
                    path: "/Books/One".into(),
                    is_directory: true,
                },
                RemoteDirectoryEntry {
                    name: "Two".into(),
                    path: "/Books/Two".into(),
                    is_directory: true,
                },
            ]
        );
    }
}
