use std::sync::LazyLock;

use tokio::sync::Semaphore;

use super::SyncError;

// Automerge is CPU work as well as SQLite I/O. Do not let Tokio's much larger
// blocking pool turn a burst of library operations into unbounded CPU work.
static CAPACITY: LazyLock<Semaphore> =
    LazyLock::new(|| Semaphore::new(std::thread::available_parallelism().map_or(1, usize::from)));

pub(super) async fn run<T, F>(work: F) -> Result<T, SyncError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, SyncError> + Send + 'static,
{
    let permit = CAPACITY.acquire().await.expect("sync capacity stays open");
    tokio::task::spawn_blocking(move || {
        // A dropped caller cannot abort started blocking work. Keep its capacity
        // and any captured database guard until the actual operation finishes.
        let _permit = permit;
        work()
    })
    .await
    .map_err(|error| SyncError::Sync(format!("Sync worker failed: {error}")))?
}
