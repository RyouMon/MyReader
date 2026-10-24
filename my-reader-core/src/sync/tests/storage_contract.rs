use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

use futures_util::stream;
use http::{Request, Response, StatusCode};
use opendal::{Buffer, HttpBody, HttpTransport, HttpTransporter, OperationContext};
use serde_json::json;

use super::*;

const OBJECT_COUNT: usize = 12;

#[derive(Clone, Default)]
struct OneDriveDownloads {
    active: Arc<AtomicUsize>,
    peak: Arc<AtomicUsize>,
    started: Arc<AtomicUsize>,
    fail_key: Option<String>,
    object_count: Option<usize>,
    active_list_requests: Arc<AtomicUsize>,
    peak_list_requests: Arc<AtomicUsize>,
}

struct ActiveDownload(Arc<AtomicUsize>);
impl Drop for ActiveDownload {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
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

fn item(name: &str, folder: bool, prefix: &str) -> serde_json::Value {
    let mut value = json!({
        "id": name, "name": name, "lastModifiedDateTime": "2026-10-17T00:00:00Z",
        "eTag": name, "size": 8,
        "parentReference": { "path": format!("/drive/root:/{prefix}"), "driveId": "drive", "id": "parent" }
    });
    if folder {
        value["folder"] = json!({"childCount": OBJECT_COUNT});
    } else {
        value["file"] = json!({"mimeType": "application/octet-stream"});
    }
    value
}

impl HttpTransport for OneDriveDownloads {
    async fn fetch(&self, request: Request<Buffer>) -> opendal::Result<Response<HttpBody>> {
        let path = request.uri().path();
        if path.ends_with(":/content") {
            let key = path
                .trim_end_matches(":/content")
                .rsplit('/')
                .next()
                .unwrap();
            self.started.fetch_add(1, Ordering::SeqCst);
            let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
            self.peak.fetch_max(active, Ordering::SeqCst);
            let _active = ActiveDownload(self.active.clone());
            let delay_ms = if path.contains("/snapshot/") {
                200
            } else {
                100
            };
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            return if self.fail_key.as_deref() == Some(key) {
                response(
                    StatusCode::NOT_FOUND,
                    br#"{"error":{"code":"itemNotFound"}}"#.to_vec(),
                )
            } else {
                response(StatusCode::OK, format!("chunk-{key}").into_bytes())
            };
        }
        let active = self.active_list_requests.fetch_add(1, Ordering::SeqCst) + 1;
        self.peak_list_requests.fetch_max(active, Ordering::SeqCst);
        let _active = ActiveDownload(self.active_list_requests.clone());
        tokio::time::sleep(Duration::from_millis(50)).await;
        let prefix = path
            .split_once("/root:")
            .unwrap()
            .1
            .trim_end_matches(":/children")
            .trim_start_matches('/');
        let body = if path.ends_with(":/children") {
            let count = if prefix.ends_with("/incremental") {
                self.object_count.unwrap_or(OBJECT_COUNT)
            } else {
                0
            };
            json!({"value": (0..count).rev().map(|i| item(&format!("{i:02}"), false, prefix)).collect::<Vec<_>>()})
        } else {
            item("incremental", true, prefix)
        };
        response(StatusCode::OK, serde_json::to_vec(&body).unwrap())
    }
}

fn operator(client: OneDriveDownloads) -> Operator {
    Operator::new(opendal::services::Onedrive::default().access_token("test-token"))
        .unwrap()
        .with_context(OperationContext::new().with_http_transport(HttpTransporter::new(client)))
}

#[tokio::test(start_paused = true)]
async fn onedrive_ranges_should_overlap_downloads_with_a_bound_and_preserve_key_order() {
    let client = OneDriveDownloads::default();
    let operator = operator(client.clone());
    let started = tokio::time::Instant::now();
    let chunks = StorageAdapter::new(&operator)
        .load_range(&incremental_prefix("document"))
        .await
        .unwrap();
    eprintln!(
        "OneDrive simulated download elapsed: {:?}, peak: {}",
        started.elapsed(),
        client.peak.load(Ordering::SeqCst)
    );
    assert_eq!(chunks.len(), OBJECT_COUNT);
    for (index, chunk) in chunks.iter().enumerate() {
        assert_eq!(
            chunk.key,
            incremental_key("document", &format!("{index:02}"))
        );
        assert_eq!(chunk.data, format!("chunk-{index:02}").as_bytes());
    }
    let peak = client.peak.load(Ordering::SeqCst);
    assert!(peak > 1, "independent OneDrive downloads should overlap");
    assert!(
        peak <= 4,
        "downloads must remain bounded to avoid request bursts"
    );
    assert_eq!(client.active.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn faster_incrementals_should_still_be_returned_after_snapshots() {
    let operator = operator(OneDriveDownloads::default());
    let keys = vec![
        snapshot_key("document", "11"),
        incremental_key("document", "00"),
    ];
    let chunks = StorageAdapter::new(&operator)
        .load_chunks(keys.clone(), |_, _| Ok(()))
        .await
        .unwrap();
    assert_eq!(
        chunks
            .into_iter()
            .map(|chunk| chunk.key)
            .collect::<Vec<_>>(),
        keys
    );
}

#[tokio::test(start_paused = true)]
async fn cancelled_downloads_should_stop_scheduling_and_drop_in_flight_requests() {
    let client = OneDriveDownloads::default();
    let operator = operator(client.clone());
    let adapter = StorageAdapter::new(&operator);
    let keys = adapter
        .list_range(&incremental_prefix("document"))
        .await
        .unwrap();
    let mut progress = Vec::new();
    let error = adapter
        .load_chunks(keys, |completed, total| {
            progress.push((completed, total));
            if completed == 1 {
                Err(sync_error("cancelled"))
            } else {
                Ok(())
            }
        })
        .await
        .unwrap_err();
    assert!(error.to_string().contains("cancelled"));
    assert_eq!(progress, vec![(0, OBJECT_COUNT), (1, OBJECT_COUNT)]);
    assert!(client.started.load(Ordering::SeqCst) < OBJECT_COUNT);
    assert_eq!(client.active.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn failed_download_should_fail_the_range_and_drop_remaining_requests() {
    let client = OneDriveDownloads {
        fail_key: Some("00".into()),
        ..Default::default()
    };
    let operator = operator(client.clone());
    let error = StorageAdapter::new(&operator)
        .load_range(&incremental_prefix("document"))
        .await
        .unwrap_err();
    assert!(
        matches!(&error, SyncError::InvalidRemoteObject { object_path, .. } if object_path.ends_with("/00"))
    );
    assert_eq!(
        crate::api::sync::SyncService::failure_kind(&error.into()),
        crate::models::SyncFailureKind::DataIntegrity
    );
    assert!(client.started.load(Ordering::SeqCst) < OBJECT_COUNT);
    assert_eq!(client.active.load(Ordering::SeqCst), 0);
}

#[derive(Default)]
struct ProgressObserver(Mutex<Vec<crate::sync::exchange::SyncProgress>>);
impl crate::sync::exchange::SyncObserver for ProgressObserver {
    fn is_cancelled(&self) -> bool {
        false
    }
    fn on_progress(&self, progress: crate::sync::exchange::SyncProgress) {
        self.0.lock().unwrap().push(progress);
    }
}

async fn sync_remote(
    client: OneDriveDownloads,
    observer: &ProgressObserver,
) -> Result<crate::sync::exchange::SyncReport, SyncError> {
    let (_directory, path) = crate::sync::tests::persistence_contract::create_database();
    let identity = crate::sync::persistence::DatabaseIdentity {
        library_uuid: "11111111-2222-4333-8444-555555555555".parse().unwrap(),
        replica_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".parse().unwrap(),
    };
    crate::sync::exchange::sync_database_with_operator_observed(
        &path,
        &operator(client),
        &identity,
        1,
        crate::sync::exchange::SyncMode::Full,
        observer,
    )
    .await
}

#[tokio::test(start_paused = true)]
async fn sync_should_overlap_directory_queries_and_report_downloads_before_rejecting_invalid_content(
) {
    use crate::sync::exchange::SyncStage;
    let client = OneDriveDownloads::default();
    let observer = ProgressObserver::default();
    let error = sync_remote(client.clone(), &observer).await.unwrap_err();
    assert!(matches!(error, SyncError::InvalidRemoteObject { .. }));
    assert_eq!(client.peak_list_requests.load(Ordering::SeqCst), 2);
    let progress = observer.0.lock().unwrap();
    let downloads: Vec<_> = progress
        .iter()
        .filter(|p| p.stage == SyncStage::Pulling)
        .map(|p| (p.completed, p.total))
        .collect();
    assert_eq!(
        downloads,
        (0..=OBJECT_COUNT)
            .map(|i| (i, OBJECT_COUNT))
            .collect::<Vec<_>>()
    );
    assert_eq!(progress[1].stage, SyncStage::Preparing);
    assert_eq!(progress[1].completed, 1);
    assert!(!progress
        .iter()
        .any(|p| p.stage == SyncStage::Applying || p.stage == SyncStage::Complete));
}

#[tokio::test(start_paused = true)]
async fn excessive_remote_object_count_should_fail_before_downloading_content() {
    let client = OneDriveDownloads {
        object_count: Some(10_001),
        ..Default::default()
    };
    let error = sync_remote(client.clone(), &ProgressObserver::default())
        .await
        .unwrap_err();
    assert!(error.to_string().contains("object count exceeds 10000"));
    assert_eq!(client.started.load(Ordering::SeqCst), 0);
}
