use std::hint::black_box;
use std::time::Instant;

use rusqlite::Connection;

const DEFAULT_ITERATIONS: usize = 1_000;

#[tokio::main]
async fn main() {
    let iterations = std::env::args()
        .nth(1)
        .map(|value| {
            value
                .parse::<usize>()
                .expect("iterations must be an integer")
        })
        .unwrap_or(DEFAULT_ITERATIONS);
    assert!(iterations > 0, "iterations must be greater than zero");

    let sidecar = tempfile::tempdir().expect("create sidecar directory");
    let library = tempfile::tempdir().expect("create Calibre library");
    let calibre = Connection::open(library.path().join("metadata.db"))
        .expect("create Calibre metadata database");
    calibre
        .execute_batch(
            "CREATE TABLE library_id (
                id INTEGER PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE
             );
             INSERT INTO library_id (id, uuid)
             VALUES (1, '11111111-2222-4333-8444-555555555555');",
        )
        .expect("seed Calibre library identity");

    myreader_core::api::reading::set_reading_position(
        sidecar.path(),
        library.path(),
        42,
        "EPUB",
        r#"{"href":"chapter.xhtml","type":"application/xhtml+xml"}"#,
        Some(0.5),
        1_000,
    )
    .await
    .expect("seed reading position");

    let cached_open_started = Instant::now();
    for _ in 0..iterations {
        black_box(
            myreader_core::api::migrate_library_database(
                &sidecar.path().join(".myreader/myreader.db"),
            )
            .await
            .expect("open cached library database"),
        );
    }
    print_measurement("cached_database_open", iterations, cached_open_started);

    let position_lookup_started = Instant::now();
    for _ in 0..iterations {
        black_box(
            myreader_core::api::reading::get_reading_position(sidecar.path(), 42, "EPUB")
                .await
                .expect("read position")
                .expect("seeded position must exist"),
        );
    }
    print_measurement(
        "reading_position_lookup",
        iterations,
        position_lookup_started,
    );
}

fn print_measurement(name: &str, iterations: usize, started: Instant) {
    let elapsed = started.elapsed();
    println!(
        "{name} iterations={iterations} total_ms={:.3} mean_us={:.3}",
        elapsed.as_secs_f64() * 1_000.0,
        elapsed.as_secs_f64() * 1_000_000.0 / iterations as f64,
    );
}
