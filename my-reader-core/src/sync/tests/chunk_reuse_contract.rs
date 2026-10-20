use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use futures_util::stream;
use http::{Method, Request, Response, StatusCode};
use opendal::{Buffer, HttpBody, HttpTransport, HttpTransporter, OperationContext};
use serde_json::json;

use super::*;
use crate::sync::document::{
    load_library_sidecar_document, set_library_identity, set_reading_position, ReadingPositionValue,
};

#[derive(Clone, Default)]
struct OneDrive {
    chunks: Arc<Mutex<BTreeMap<String, Vec<u8>>>>,
    downloads: Arc<Mutex<Vec<String>>>,
}

fn response(status: StatusCode, bytes: Vec<u8>) -> opendal::Result<Response<HttpBody>> {
    let length = bytes.len() as u64;
    Ok(Response::builder()
        .status(status)
        .body(HttpBody::new(
            stream::iter([Ok(Buffer::from(bytes))]),
            Some(length),
        ))
        .unwrap())
}

impl HttpTransport for OneDrive {
    async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
        let path = request
            .uri()
            .path()
            .split_once("/root:")
            .unwrap()
            .1
            .trim_start_matches('/');
        let mut chunks = self.chunks.lock().unwrap();
        if let Some(path) = path.strip_suffix(":/content") {
            if request.method() == Method::PUT {
                chunks.insert(path.to_owned(), request.body().to_vec());
                return response(StatusCode::CREATED, serde_json::to_vec(&json!({
                    "id": path, "name": path.rsplit('/').next().unwrap(),
                    "size": request.body().len(), "eTag": path,
                    "lastModifiedDateTime": "2026-10-20T00:00:00Z",
                    "parentReference": {"path": "/drive/root:", "driveId": "drive", "id": "parent"},
                    "file": {"mimeType": "application/octet-stream"}
                })).unwrap());
            }
            self.downloads.lock().unwrap().push(path.to_owned());
            return match chunks.get(path) {
                Some(bytes) => response(StatusCode::OK, bytes.clone()),
                None => response(
                    StatusCode::NOT_FOUND,
                    br#"{"error":{"code":"itemNotFound"}}"#.to_vec(),
                ),
            };
        }
        if request.method() == Method::DELETE {
            chunks.remove(path.trim_end_matches(':'));
            return response(StatusCode::NO_CONTENT, Vec::new());
        }
        let prefix = path.trim_end_matches(":/children").trim_end_matches(':');
        let item = |name: &str, size: usize, folder: bool| {
            let mut item = json!({
                "id": name, "name": name, "size": size, "eTag": name,
                "lastModifiedDateTime": "2026-10-20T00:00:00Z",
                "parentReference": { "path": format!("/drive/root:/{prefix}"), "driveId": "drive", "id": "parent" }
            });
            item[if folder { "folder" } else { "file" }] = if folder {
                json!({"childCount": chunks.len()})
            } else {
                json!({"mimeType": "application/octet-stream"})
            };
            item
        };
        let body = if path.ends_with(":/children") {
            json!({"value": chunks.iter().filter_map(|(key, bytes)| {
                key.strip_prefix(&format!("{prefix}/")).map(|name| item(name, bytes.len(), false))
            }).collect::<Vec<_>>()})
        } else {
            item(prefix.rsplit('/').next().unwrap(), 0, true)
        };
        response(StatusCode::OK, serde_json::to_vec(&body).unwrap())
    }
}

impl OneDrive {
    fn operator(&self) -> Operator {
        Operator::new(opendal::services::Onedrive::default().access_token("test-token"))
            .unwrap()
            .with_context(
                OperationContext::new().with_http_transport(HttpTransporter::new(self.clone())),
            )
    }

    fn save(&self, chunk: StorageChunk) {
        self.chunks
            .lock()
            .unwrap()
            .insert(storage_key_to_path(&chunk.key).unwrap(), chunk.data);
    }

    fn take_downloads(&self) -> Vec<String> {
        std::mem::take(&mut *self.downloads.lock().unwrap())
    }
}

fn fixture(count: usize) -> (OneDrive, automerge::AutoCommit, DatabaseIdentity) {
    let identity = tests::identity("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    let mut document = load_library_sidecar_document(identity.replica_id.as_str()).unwrap();
    set_library_identity(&mut document, identity.library_uuid.as_str(), 0).unwrap();
    let remote = OneDrive::default();
    for page in 1..=count {
        set_position(&mut document, &identity, page as i64);
        let bytes = document.save();
        let heads = library_sidecar_snapshot_heads(&bytes).unwrap();
        remote.save(StorageChunk {
            key: snapshot_key(identity.library_uuid.as_str(), &heads_hash(&heads)),
            data: bytes,
        });
    }
    (remote, document, identity)
}

fn set_position(document: &mut automerge::AutoCommit, identity: &DatabaseIdentity, page: i64) {
    set_reading_position(
        document,
        42,
        &ReadingPositionValue {
            format: "PDF".into(),
            locator_json: format!(r#"{{"href":"page={page}"}}"#),
            display_progression_ppm: Some(500_000),
            recorded_at: page,
            replica_id: identity.replica_id.to_string(),
        },
    )
    .unwrap();
}

#[tokio::test]
async fn unchanged_onedrive_chunks_should_not_be_downloaded_again_after_reopening_storage() {
    let (remote, _document, target) = fixture(205);
    let (_directory, path) = tests::database();
    let first = sync_database_with_operator(&path, &remote.operator(), &target, 0, SyncMode::Full)
        .await
        .unwrap();
    assert!(first.pulled > 0);
    assert_eq!(remote.take_downloads().len(), 205);
    assert_eq!(remote.chunks.lock().unwrap().len(), 205);

    let second = sync_database_with_operator(&path, &remote.operator(), &target, 2, SyncMode::Full)
        .await
        .unwrap();
    assert_eq!(second.pulled, 0);
    assert_eq!(
        remote.take_downloads(),
        Vec::<String>::new(),
        "unchanged Automerge StorageKeys must reuse their local bytes"
    );
}

#[tokio::test]
async fn locally_published_snapshots_and_incrementals_should_not_be_downloaded_back() {
    let remote = OneDrive::default();
    let (_directory, path) = tests::database();
    let identity = tests::identity("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    for page in [1, 2] {
        tests::set_progress(&path, &identity, 42, page);
        sync_database_with_operator(
            &path,
            &remote.operator(),
            &identity,
            page,
            SyncMode::PushOnly,
        )
        .await
        .unwrap();
        assert!(remote.take_downloads().is_empty());
        sync_database_with_operator(
            &path,
            &remote.operator(),
            &identity,
            page + 10,
            SyncMode::Full,
        )
        .await
        .unwrap();
        assert!(
            remote.take_downloads().is_empty(),
            "published Automerge bytes are already available locally"
        );
    }
}

#[tokio::test]
async fn new_incrementals_and_compacted_snapshots_should_download_only_the_new_storage_key() {
    let (remote, mut document, identity) = fixture(3);
    let (_directory, path) = tests::database();
    sync_database_with_operator(&path, &remote.operator(), &identity, 0, SyncMode::Full)
        .await
        .unwrap();
    assert_eq!(remote.take_downloads().len(), 3);

    let heads = document.get_heads();
    set_position(&mut document, &identity, 99);
    let bytes = document.save_after(&heads);
    let key =
        crate::sync::storage::incremental_key(identity.library_uuid.as_str(), &sha256_hex(&bytes));
    remote.save(StorageChunk {
        key: key.clone(),
        data: bytes,
    });
    let report =
        sync_database_with_operator(&path, &remote.operator(), &identity, 1, SyncMode::Full)
            .await
            .unwrap();
    assert_eq!(report.pulled, 1);
    assert_eq!(
        remote.take_downloads(),
        vec![storage_key_to_path(&key).unwrap()]
    );
    let connection = rusqlite::Connection::open(&path).unwrap();
    let locator: String = connection
        .query_row(
            "SELECT locator_json FROM reading_progress WHERE book_id = 42",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(locator, r#"{"href":"page=99"}"#);

    let bytes = document.save();
    let key = snapshot_key(
        identity.library_uuid.as_str(),
        &heads_hash(&library_sidecar_snapshot_heads(&bytes).unwrap()),
    );
    remote.chunks.lock().unwrap().clear();
    remote.save(StorageChunk {
        key: key.clone(),
        data: bytes,
    });
    let report =
        sync_database_with_operator(&path, &remote.operator(), &identity, 2, SyncMode::Full)
            .await
            .unwrap();
    assert_eq!(report.pulled, 0);
    assert_eq!(
        remote.take_downloads(),
        vec![storage_key_to_path(&key).unwrap()]
    );
    let cache_operator = local_chunk_storage(&path).await.unwrap();
    assert_eq!(
        StorageAdapter::new(&cache_operator)
            .list_range(&[identity.library_uuid.to_string()])
            .await
            .unwrap(),
        vec![key]
    );
}

#[tokio::test]
async fn damaged_local_chunks_should_be_refetched_and_remote_validation_must_still_fail_closed() {
    let (remote, _document, identity) = fixture(3);
    let (_directory, path) = tests::database();
    sync_database_with_operator(&path, &remote.operator(), &identity, 0, SyncMode::Full)
        .await
        .unwrap();
    remote.take_downloads();
    let cache_operator = local_chunk_storage(&path).await.unwrap();
    let cache = StorageAdapter::new(&cache_operator);
    let key = cache
        .list_range(&snapshot_prefix(identity.library_uuid.as_str()))
        .await
        .unwrap()
        .remove(0);
    let original = cache.load(&key).await.unwrap().unwrap();
    cache.save(&key, b"truncated snapshot").await.unwrap();
    let report =
        sync_database_with_operator(&path, &remote.operator(), &identity, 1, SyncMode::Full)
            .await
            .unwrap();
    assert_eq!(report.pulled, 0);
    assert_eq!(
        remote.take_downloads(),
        vec![storage_key_to_path(&key).unwrap()]
    );
    assert_eq!(cache.load(&key).await.unwrap().unwrap(), original);

    cache.remove(&key).await.unwrap();
    remote.save(StorageChunk {
        key,
        data: b"invalid remote snapshot".to_vec(),
    });
    let error =
        sync_database_with_operator(&path, &remote.operator(), &identity, 2, SyncMode::Full)
            .await
            .unwrap_err();
    assert!(matches!(error, SyncError::InvalidRemoteObject { .. }));
}
