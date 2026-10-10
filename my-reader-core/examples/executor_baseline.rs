//! Real SQLite/Automerge workloads plus an executor responsiveness probe.
//! cargo run -p my-reader-core --release --features test-support --example executor_baseline -- current-thread 1000 20
use std::{future::Future, path::PathBuf, sync::Arc, time::Duration};

use my_reader_core::{
    api::{reading::ReadingService, sync::SyncService},
    models::{LibraryStorageConfig, SidecarSyncMode},
    test_support::{document, open_db, persistence},
};
use rusqlite::Connection;
use tokio::{sync::oneshot, time::Instant};

const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";
const REPLICA_ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TICK: Duration = Duration::from_millis(2);

struct Fixture {
    _directory: tempfile::TempDir,
    sidecar: PathBuf,
    library: PathBuf,
    database: PathBuf,
}

impl Fixture {
    async fn new(books: usize) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let sidecar = directory.path().join("sidecar");
        let library = directory.path().join("library");
        std::fs::create_dir_all(&library).unwrap();
        let calibre = Connection::open(library.join("metadata.db")).unwrap();
        calibre
            .execute_batch(&format!(
                "CREATE TABLE library_id (id INTEGER PRIMARY KEY, uuid TEXT NOT NULL UNIQUE);
                 INSERT INTO library_id VALUES (1, '{LIBRARY_UUID}');"
            ))
            .unwrap();
        let db = open_db(sidecar.to_str().unwrap()).await.unwrap();
        let database = sidecar.join(".myreader/myreader.db");
        // Fixed actor and identities make every run's initial CRDT data identical.
        let connection = Connection::open(&database).unwrap();
        let replica = if books == 0 {
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        } else {
            REPLICA_ID
        };
        connection
            .execute(
                "INSERT INTO sync_local_meta (id, protocol, library_uuid, replica_id)
             VALUES ('local', 'library-sidecar-automerge-repo', ?1, ?2)",
                [LIBRARY_UUID, replica],
            )
            .unwrap();
        persistence::execute_local_database_mutation(
            database.to_str().unwrap(),
            &persistence::DatabaseIdentity {
                library_uuid: LIBRARY_UUID.parse().unwrap(),
                replica_id: replica.parse().unwrap(),
            },
            1_000,
            |doc| {
                for index in 1..=books {
                    document::create_catalog_book(
                        doc,
                        &document::CatalogBookValue {
                            uuid: format!("22222222-3333-4444-8555-{index:012x}"),
                            book_id: index as i64,
                            title: format!("Benchmark book {index}"),
                            authors: vec![format!("Author {}", index % 20)],
                            path: format!("Books/{index}"),
                            name: format!("Book {index}"),
                            format: "EPUB".into(),
                            size: 1024,
                            sha256: "ab".repeat(32),
                            has_cover: false,
                            timestamp: "2026-10-10T00:00:00Z".into(),
                            last_modified: "2026-10-10T00:00:00Z".into(),
                            deleted: false,
                        },
                        1_000,
                    )?;
                }
                Ok(())
            },
        )
        .unwrap();
        drop(db);
        Self {
            _directory: directory,
            sidecar,
            library,
            database,
        }
    }

    async fn write(&self, book_id: i64, time: i64) {
        ReadingService::set_reading_position(
            &self.sidecar,
            &self.library,
            book_id,
            "EPUB",
            &format!(r#"{{"href":"chapter-{time}.xhtml","type":"application/xhtml+xml"}}"#),
            Some(0.5),
            time,
        )
        .await
        .unwrap();
    }
}

fn percentile(values: &mut [f64], quantile: f64) -> f64 {
    values.sort_by(f64::total_cmp);
    values[((values.len() as f64 * quantile).ceil() as usize).saturating_sub(1)]
}

async fn measure<F: Future<Output = ()>>(
    name: &str,
    runtime: &str,
    books: usize,
    operations: usize,
    work: F,
) {
    let (ready_tx, ready_rx) = oneshot::channel();
    let (stop_tx, mut stop_rx) = oneshot::channel();
    let monitor = tokio::spawn(async move {
        let mut samples = Vec::new();
        let mut deadline = Instant::now() + TICK;
        ready_tx.send(()).unwrap();
        loop {
            tokio::select! {
                // Record an overdue tick even if the workload just completed.
                biased;
                _ = tokio::time::sleep_until(deadline) => {
                    samples.push(deadline.elapsed().as_secs_f64() * 1000.0);
                    deadline = Instant::now() + TICK;
                }
                _ = &mut stop_rx => {
                    // The timer driver may not have run since an executor stall.
                    // A ready stop channel must not hide that final overdue wakeup.
                    if Instant::now() > deadline {
                        samples.push(deadline.elapsed().as_secs_f64() * 1000.0);
                    }
                    break;
                }
            }
        }
        samples
    });
    ready_rx.await.unwrap();
    let start = Instant::now();
    work.await;
    let elapsed = start.elapsed().as_secs_f64() * 1000.0;
    stop_tx.send(()).unwrap();
    let mut samples = monitor.await.unwrap();
    let count = samples.len();
    if samples.is_empty() {
        samples.push(0.0);
    }
    let p95 = percentile(&mut samples, 0.95);
    let max = *samples.last().unwrap();
    println!(
        "{}",
        serde_json::json!({
            "case": name, "runtime": runtime, "books": books, "operations": operations,
            "elapsed_ms": elapsed, "mean_ms": elapsed / operations as f64,
            "tick_samples": count, "tick_lateness_p95_ms": p95, "tick_lateness_max_ms": max,
        })
    );
}

async fn run(runtime: &str, books: usize, iterations: usize) {
    let fixture = Arc::new(Fixture::new(books).await);
    fixture.write(1, 2_000).await;
    measure("reading_write", runtime, books, iterations, async {
        for index in 0..iterations {
            fixture.write(1, 3_000 + index as i64).await;
        }
    })
    .await;
    measure(
        "four_reading_writers",
        runtime,
        books,
        iterations * 4,
        async {
            let writers = (1..=4).map(|book| {
                let fixture = fixture.clone();
                tokio::spawn(async move {
                    for index in 0..iterations {
                        fixture.write(book, 10_000 + index as i64).await;
                    }
                })
            });
            for result in futures::future::join_all(writers).await {
                result.unwrap();
            }
        },
    )
    .await;

    let remote = tempfile::tempdir().unwrap();
    let storage = LibraryStorageConfig::LocalDirect {
        root: remote.path().to_string_lossy().into_owned(),
    };
    SyncService::sync_sidecar(
        &fixture.sidecar,
        &fixture.library,
        20_000,
        SidecarSyncMode::Full,
        &storage,
    )
    .await
    .unwrap();
    let target = Fixture::new(0).await;
    measure("sync_pull", runtime, books, 1, async {
        SyncService::sync_sidecar(
            &target.sidecar,
            &target.library,
            21_000,
            SidecarSyncMode::Full,
            &storage,
        )
        .await
        .unwrap();
    })
    .await;

    // A real external SQLite writer releases its lock independently of Tokio.
    let (locked_tx, locked_rx) = oneshot::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let database = fixture.database.clone();
    let holder = std::thread::spawn(move || {
        let connection = Connection::open(database).unwrap();
        connection.execute_batch("BEGIN IMMEDIATE").unwrap();
        locked_tx.send(()).unwrap();
        release_rx.recv().unwrap();
        std::thread::sleep(Duration::from_millis(200));
        connection.execute_batch("ROLLBACK").unwrap();
    });
    locked_rx.await.unwrap();
    measure("sqlite_busy_200ms", runtime, books, 1, async {
        release_tx.send(()).unwrap();
        fixture.write(1, 30_000).await;
    })
    .await;
    holder.join().unwrap();

    // Close cached SQLx pools before TempDir cleanup (required on Windows).
    // Cleanup is outside every timed workload.
    for database in [&fixture.database, &target.database] {
        my_reader_core::api::close_library_database(database)
            .await
            .unwrap()
            .commit();
    }
}

fn main() {
    let args: Vec<_> = std::env::args().collect();
    let runtime = args.get(1).map_or("current-thread", String::as_str);
    let books = args.get(2).map_or(100, |value| value.parse().unwrap());
    let iterations = args.get(3).map_or(20, |value| value.parse().unwrap());
    assert!(books >= 4 && iterations > 0);
    let mut builder = match runtime {
        "current-thread" => tokio::runtime::Builder::new_current_thread(),
        "multi-thread" => {
            let mut builder = tokio::runtime::Builder::new_multi_thread();
            builder.worker_threads(2);
            builder
        }
        _ => panic!("runtime must be current-thread or multi-thread"),
    };
    let runtime_name = runtime.to_owned();
    builder.enable_all().build().unwrap().block_on(async move {
        // On a multithreaded runtime block_on itself is outside the worker pool.
        // Spawn the workload so this also measures starvation of real workers.
        tokio::spawn(async move { run(&runtime_name, books, iterations).await })
            .await
            .unwrap();
    });
}
