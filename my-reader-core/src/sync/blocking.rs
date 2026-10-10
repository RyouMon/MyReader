use std::sync::LazyLock;

use tokio::sync::Semaphore;

use super::SyncError;

// Automerge is CPU work as well as SQLite I/O. Do not let Tokio's much larger
// blocking pool turn a burst of library operations into unbounded CPU work.
static CAPACITY: LazyLock<Semaphore> =
    LazyLock::new(|| Semaphore::new(std::thread::available_parallelism().map_or(1, usize::from)));

struct AbortOnDrop(tokio::task::AbortHandle);

impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        // This only prevents queued work from starting. Tokio leaves an already
        // running blocking task alone, including its guards and transaction.
        self.0.abort();
    }
}

pub(super) async fn run<T, F>(work: F) -> Result<T, SyncError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, SyncError> + Send + 'static,
{
    let permit = CAPACITY.acquire().await.expect("sync capacity stays open");
    let task = tokio::task::spawn_blocking(move || {
        // A dropped caller cannot abort started blocking work. Keep its capacity
        // and any captured database guard until the actual operation finishes.
        let _permit = permit;
        work()
    });
    let _abort_on_drop = AbortOnDrop(task.abort_handle());
    task.await
        .map_err(|error| SyncError::Sync(format!("Sync worker failed: {error}")))?
}

#[cfg(test)]
#[path = "tests/blocking_contract.rs"]
mod tests;
