use opendal::Operator;

use super::SyncError;

pub const STORAGE_ROOT: &str = ".myreader/automerge";

pub type StorageKey = Vec<String>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageChunk {
    pub key: StorageKey,
    pub data: Vec<u8>,
}

fn sync_error(message: impl Into<String>) -> SyncError {
    SyncError::Sync(message.into())
}

fn validate_key(key: &[String]) -> Result<(), SyncError> {
    if key.is_empty() {
        return Err(sync_error("Automerge storage key is empty"));
    }
    if key.iter().any(|component| {
        component.is_empty()
            || component == "."
            || component == ".."
            || component.contains('/')
            || component.contains('\\')
    }) {
        return Err(sync_error(
            "Automerge storage key contains an invalid component",
        ));
    }
    Ok(())
}

pub fn storage_key_to_path(key: &[String]) -> Result<String, SyncError> {
    validate_key(key)?;
    let mut components = Vec::with_capacity(key.len() + 1);
    components.push(STORAGE_ROOT.to_owned());
    components.extend(key.iter().cloned());
    Ok(components.join("/"))
}

pub fn path_to_storage_key(path: &str) -> Result<StorageKey, SyncError> {
    let relative = path
        .strip_prefix(&format!("{STORAGE_ROOT}/"))
        .ok_or_else(|| sync_error("Automerge storage path is outside its root"))?;
    let key = relative
        .split('/')
        .map(str::to_owned)
        .collect::<StorageKey>();
    validate_key(&key)?;
    Ok(key)
}

pub fn snapshot_key(document_id: &str, heads_hash: &str) -> StorageKey {
    vec![
        document_id.to_owned(),
        "snapshot".to_owned(),
        heads_hash.to_owned(),
    ]
}

pub fn incremental_key(document_id: &str, content_hash: &str) -> StorageKey {
    vec![
        document_id.to_owned(),
        "incremental".to_owned(),
        content_hash.to_owned(),
    ]
}

pub fn snapshot_prefix(document_id: &str) -> StorageKey {
    vec![document_id.to_owned(), "snapshot".to_owned()]
}

pub fn incremental_prefix(document_id: &str) -> StorageKey {
    vec![document_id.to_owned(), "incremental".to_owned()]
}

pub struct StorageAdapter<'a> {
    operator: &'a Operator,
}

impl<'a> StorageAdapter<'a> {
    pub fn new(operator: &'a Operator) -> Self {
        Self { operator }
    }

    // Kept to match StorageAdapterInterface; document sync currently reads ranges.
    #[allow(dead_code)]
    pub async fn load(&self, key: &[String]) -> Result<Option<Vec<u8>>, SyncError> {
        let path = storage_key_to_path(key)?;
        match self.operator.read(&path).await {
            Ok(data) => Ok(Some(data.to_vec())),
            Err(error) if error.kind() == opendal::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(sync_error(format!(
                "Load Automerge storage key {key:?} failed: {error}"
            ))),
        }
    }

    pub async fn save(&self, key: &[String], data: &[u8]) -> Result<(), SyncError> {
        let path = storage_key_to_path(key)?;
        self.operator
            .write(&path, data.to_vec())
            .await
            .map(|_| ())
            .map_err(|error| {
                sync_error(format!(
                    "Save Automerge storage key {key:?} failed: {error}"
                ))
            })
    }

    pub async fn remove(&self, key: &[String]) -> Result<(), SyncError> {
        let path = storage_key_to_path(key)?;
        self.operator.delete(&path).await.map_err(|error| {
            sync_error(format!(
                "Remove Automerge storage key {key:?} failed: {error}"
            ))
        })
    }

    pub async fn load_range(&self, prefix: &[String]) -> Result<Vec<StorageChunk>, SyncError> {
        let path = storage_key_to_path(prefix)?;
        let entries = match self
            .operator
            .list_with(&format!("{path}/"))
            .recursive(true)
            .await
        {
            Ok(entries) => entries,
            Err(error) if error.kind() == opendal::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => {
                return Err(sync_error(format!(
                    "Load Automerge storage range {prefix:?} failed: {error}"
                )));
            }
        };
        let mut chunks = Vec::new();
        for entry in entries {
            if !entry.metadata().is_file() {
                continue;
            }
            let key = path_to_storage_key(entry.path())?;
            if !key.starts_with(prefix) {
                continue;
            }
            let data = self
                .operator
                .read(entry.path())
                .await
                .map_err(|error| {
                    sync_error(format!(
                        "Load Automerge storage key {key:?} failed: {error}"
                    ))
                })?
                .to_vec();
            chunks.push(StorageChunk { key, data });
        }
        chunks.sort_by(|left, right| left.key.cmp(&right.key));
        Ok(chunks)
    }

    // Kept to match StorageAdapterInterface; compaction removes only covered keys.
    #[allow(dead_code)]
    pub async fn remove_range(&self, prefix: &[String]) -> Result<(), SyncError> {
        let path = storage_key_to_path(prefix)?;
        self.operator
            .remove_all(&format!("{path}/"))
            .await
            .map_err(|error| {
                sync_error(format!(
                    "Remove Automerge storage range {prefix:?} failed: {error}"
                ))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_preserve_document_id_when_storage_key_is_encoded() {
        assert_eq!(
            storage_key_to_path(&[
                "11111111-2222-4333-8444-555555555555".to_owned(),
                "snapshot".to_owned(),
                "1234".to_owned(),
            ])
            .unwrap(),
            ".myreader/automerge/11111111-2222-4333-8444-555555555555/snapshot/1234"
        );
    }

    #[test]
    fn should_restore_storage_key_when_direct_path_is_decoded() {
        assert_eq!(
            path_to_storage_key(
                ".myreader/automerge/11111111-2222-4333-8444-555555555555/incremental/1234"
            )
            .unwrap(),
            vec![
                "11111111-2222-4333-8444-555555555555".to_owned(),
                "incremental".to_owned(),
                "1234".to_owned(),
            ]
        );
    }

    #[test]
    fn should_reject_parent_traversal_when_storage_key_is_encoded() {
        let error = storage_key_to_path(&[
            "11111111-2222-4333-8444-555555555555".to_owned(),
            "..".to_owned(),
            "1234".to_owned(),
        ])
        .unwrap_err();

        assert!(error.to_string().contains("invalid component"));
    }

    #[tokio::test]
    async fn should_round_trip_ranges_when_storage_adapter_uses_filesystem_operator() {
        let directory = tempfile::tempdir().unwrap();
        let operator = Operator::new(
            opendal::services::Fs::default().root(directory.path().to_str().unwrap()),
        )
        .unwrap()
        .finish();
        let adapter = StorageAdapter::new(&operator);
        let first = incremental_key("abcdef", "1111");
        let second = incremental_key("abcdef", "2222");

        adapter.save(&first, b"first").await.unwrap();
        adapter.save(&second, b"second").await.unwrap();

        assert_eq!(adapter.load(&first).await.unwrap(), Some(b"first".to_vec()));
        assert_eq!(
            adapter
                .load_range(&incremental_prefix("abcdef"))
                .await
                .unwrap(),
            vec![
                StorageChunk {
                    key: first,
                    data: b"first".to_vec(),
                },
                StorageChunk {
                    key: second,
                    data: b"second".to_vec(),
                },
            ]
        );

        adapter
            .remove_range(&incremental_prefix("abcdef"))
            .await
            .unwrap();
        assert!(adapter
            .load_range(&incremental_prefix("abcdef"))
            .await
            .unwrap()
            .is_empty());
    }
}
