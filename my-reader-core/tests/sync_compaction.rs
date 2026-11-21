//! The same public sync path runs against a temporary directory in CI and the
//! repository's loopback WebDAV fixture when MYREADER_TEST_WEBDAV_PORT is set.
use std::{
    path::Path,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};

use my_reader_core::{
    api::{
        close_library_database,
        reading::ReadingService,
        sync::{SyncObserver, SyncProgress, SyncService, SyncStage},
    },
    models::{LibraryStorageConfig, SidecarSyncMode, SidecarSyncReport},
};

struct Device<'a> {
    sidecar: &'a Path,
    library: &'a Path,
    storage: &'a LibraryStorageConfig,
}

impl Device<'_> {
    async fn read_page(&self, book: i64, page: i64) {
        ReadingService::set_reading_position(
            self.sidecar,
            self.library,
            book,
            "PDF",
            &format!(r#"{{"href":"page-{page}","type":"application/pdf"}}"#),
            None,
            page,
        )
        .await
        .unwrap();
    }

    async fn page(&self, book: i64) -> String {
        ReadingService::get_reading_position(self.sidecar, book, "PDF")
            .await
            .unwrap()
            .unwrap()
            .locator["href"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    async fn sync(
        &self,
        mode: SidecarSyncMode,
        on_progress: impl Fn(SyncProgress) + Sync + Send,
    ) -> SidecarSyncReport {
        struct Observer<F>(F);
        impl<F: Fn(SyncProgress) + Sync + Send> SyncObserver for Observer<F> {
            fn is_cancelled(&self) -> bool {
                false
            }
            fn on_progress(&self, progress: SyncProgress) {
                self.0(progress);
            }
        }
        SyncService::sync_sidecar_observed(
            self.sidecar,
            self.library,
            1_000,
            mode,
            self.storage,
            &Observer(on_progress),
        )
        .await
        .unwrap()
    }

    async fn pull(&self) -> (SidecarSyncReport, usize) {
        let downloads = AtomicUsize::new(0);
        let report = self
            .sync(SidecarSyncMode::Full, |event| {
                if event.stage == SyncStage::Pulling {
                    downloads.store(event.completed, Ordering::Relaxed);
                }
            })
            .await;
        (report, downloads.into_inner())
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn idle_compaction_preserves_a_concurrent_upload_and_bounds_peer_downloads() {
    use SidecarSyncMode::{Full, PushOnly};
    let root = tempfile::tempdir().unwrap();
    let library = root.path();
    let uuid = uuid::Uuid::new_v4().to_string();
    let calibre = rusqlite::Connection::open(library.join("metadata.db")).unwrap();
    calibre
        .execute_batch(
            "CREATE TABLE library_id (id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE)",
        )
        .unwrap();
    calibre
        .execute("INSERT INTO library_id VALUES (1, ?1)", [&uuid])
        .unwrap();
    drop(calibre);
    let remote = tempfile::tempdir().unwrap();
    let storage = match std::env::var("MYREADER_TEST_WEBDAV_PORT") {
        Ok(port) => LibraryStorageConfig::Webdav {
            endpoint: format!("http://127.0.0.1:{}", port.parse::<u16>().unwrap()),
            username: "maestro".into(),
            password: "fixture-webdav-key".into(),
            root: None,
        },
        Err(_) => LibraryStorageConfig::LocalDirect {
            root: remote.path().to_str().unwrap().into(),
        },
    };
    let sidecars = ["writer", "phone", "new"].map(|name| library.join(name));
    let [writer, phone, new_device] = sidecars.each_ref().map(|sidecar| Device {
        sidecar,
        library,
        storage: &storage,
    });

    writer.read_page(1, 1).await;
    writer.sync(PushOnly, |_| {}).await;
    phone.pull().await;
    writer.pull().await;
    phone.read_page(2, 9).await;
    const LAST_PAGE: i64 = 500;
    for page in 2..=LAST_PAGE {
        writer.read_page(1, page).await;
    }
    writer.sync(PushOnly, |_| {}).await;

    let uploaded = AtomicBool::new(false);
    let no_changes = writer
        .sync(Full, |event| {
            if event.stage == SyncStage::Applying && event.completed == 0 {
                assert!(
                    event.total >= LAST_PAGE as usize,
                    "push-only left the backlog for full sync"
                );
                // Publish from a different replica after this full sync has loaded its exact set.
                assert!(!uploaded.swap(true, Ordering::Relaxed));
                tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current().block_on(phone.sync(PushOnly, |_| {}))
                });
            }
        })
        .await;
    assert!(uploaded.into_inner());
    assert_eq!((no_changes.pushed, no_changes.pulled), (0, 0));

    // The phone has already cached its own concurrent change. The new device needs both objects.
    for (device, expected_downloads) in [(&phone, 1), (&new_device, 2)] {
        let (first, downloads) = device.pull().await;
        assert!(first.pulled > 0);
        assert_eq!(downloads, expected_downloads);
        assert_eq!(device.page(1).await, format!("page-{LAST_PAGE}"));
        assert_eq!(device.page(2).await, "page-9");
        let (idle, downloads) = device.pull().await;
        assert_eq!((idle.pulled, idle.pushed, downloads), (0, 0, 0));
    }
    for sidecar in sidecars {
        close_library_database(&sidecar.join(".myreader/myreader.db"))
            .await
            .unwrap()
            .commit();
    }
}
