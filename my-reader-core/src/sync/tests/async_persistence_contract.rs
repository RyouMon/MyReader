use std::{
    future::{poll_fn, Future},
    sync::atomic::{AtomicBool, Ordering},
    task::Poll,
    time::Duration,
};

use tokio::{sync::oneshot, task::JoinSet};

use super::*;
use crate::sync::document::{set_favorite, FavoriteValue};

const LIBRARY_UUID: &str = "11111111-2222-4333-8444-555555555555";

async fn database() -> (tempfile::TempDir, String, DatabaseIdentity) {
    let directory = tempfile::tempdir().unwrap();
    crate::database::open_db(directory.path().to_str().unwrap())
        .await
        .unwrap();
    let path = directory.path().join(".myreader/myreader.db");
    let path = path.to_str().unwrap().to_owned();
    let identity = ensure_database_identity(&path, LIBRARY_UUID).await.unwrap();
    (directory, path, identity)
}

#[tokio::test]
async fn sqlite_lock_wait_should_yield_the_only_executor_thread() {
    let (_directory, path, _identity) = database().await;
    let (locked_tx, locked_rx) = oneshot::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let holder_path = path.clone();
    let holder = std::thread::spawn(move || {
        let connection = rusqlite::Connection::open(holder_path).unwrap();
        connection.execute_batch("BEGIN IMMEDIATE").unwrap();
        locked_tx.send(()).unwrap();
        // A watchdog bounds a regression's failure; the runtime must release us.
        let released = release_rx.recv_timeout(Duration::from_secs(5));
        connection.execute_batch("ROLLBACK").unwrap();
        released.unwrap();
    });
    locked_rx.await.unwrap();
    let (started_tx, started_rx) = oneshot::channel();
    let writer = tokio::spawn(async move {
        with_database(&path, move |path| {
            started_tx.send(()).unwrap();
            super::super::ensure_database_identity(path, LIBRARY_UUID)
        })
        .await
    });
    started_rx.await.unwrap();
    tokio::time::sleep(Duration::from_millis(10)).await;
    assert!(
        !writer.is_finished(),
        "the SQLite writer still holds its lock"
    );
    release_tx.send(()).unwrap();
    writer.await.unwrap().unwrap();
    holder.join().unwrap();
}

#[tokio::test]
async fn cancelling_a_waiter_should_not_run_its_mutation() {
    let (_directory, path, _identity) = database().await;
    let guard = queue(&path).unwrap().lock_owned().await;
    let changed = Arc::new(AtomicBool::new(false));
    let captured = changed.clone();
    let mut queued = Box::pin(with_database(&path, move |_| {
        captured.store(true, Ordering::SeqCst);
        Ok(())
    }));
    poll_fn(|cx| {
        assert!(queued.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
    drop(queued);
    drop(guard);
    with_database(&path, |_| Ok(())).await.unwrap();
    assert!(!changed.load(Ordering::SeqCst));
}

#[tokio::test]
async fn one_library_queue_should_not_block_another_library() {
    let (_first_directory, first, _) = database().await;
    let (_second_directory, second, _) = database().await;
    let _guard = queue(&first).unwrap().lock_owned().await;
    tokio::time::timeout(
        Duration::from_secs(5),
        ensure_database_identity(&second, LIBRARY_UUID),
    )
    .await
    .unwrap()
    .unwrap();
}

#[tokio::test]
async fn aborted_caller_should_keep_worker_serialized_and_removal_waiting() {
    let (_directory, path, _identity) = database().await;
    let (started_tx, started_rx) = oneshot::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let worker_path = path.clone();
    let worker = tokio::spawn(async move {
        with_database(&worker_path, move |path| {
            let connection = super::super::open_connection(path)?;
            connection
                .execute_batch(
                    "BEGIN IMMEDIATE; CREATE TABLE worker_commit (value INTEGER);
                    INSERT INTO worker_commit VALUES (42)",
                )
                .map_err(super::super::database_error)?;
            started_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            connection
                .execute_batch("COMMIT")
                .map_err(super::super::database_error)?;
            Ok(())
        })
        .await
    });
    started_rx.await.unwrap();
    worker.abort();
    assert!(worker.await.unwrap_err().is_cancelled());
    assert!(
        queue(&path).unwrap().try_lock_owned().is_err(),
        "aborting the caller must not release an active worker's database guard"
    );

    let mut next = Box::pin(ensure_database_identity(&path, LIBRARY_UUID));
    let mut removal = Box::pin(crate::database::close_database_file(std::path::Path::new(
        &path,
    )));
    poll_fn(|cx| {
        assert!(next.as_mut().poll(cx).is_pending());
        assert!(removal.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
    release_tx.send(()).unwrap();
    let removal = removal.await.unwrap();

    let connection = rusqlite::Connection::open(&path).unwrap();
    let committed: i64 = connection
        .query_row("SELECT value FROM worker_commit", [], |row| row.get(0))
        .unwrap();
    assert_eq!(committed, 42);
    drop(connection);
    std::fs::remove_file(&path).unwrap();
    removal.commit();
    assert!(
        next.await.is_err(),
        "queued writes must respect committed removal"
    );
    assert!(ensure_database_identity(&path, LIBRARY_UUID).await.is_err());
    assert!(
        !std::path::Path::new(&path).exists(),
        "a stale worker must not recreate the database"
    );
}

#[tokio::test]
async fn concurrent_mutations_should_preserve_every_committed_change() {
    let (_directory, path, identity) = database().await;
    let mut writers = JoinSet::new();
    for book_id in 1..=16 {
        let path = path.clone();
        let identity = identity.clone();
        writers.spawn(async move {
            let replica_id = identity.replica_id.clone();
            mutate_document(&path, &identity, 100, move |document| {
                set_favorite(
                    document,
                    book_id,
                    &FavoriteValue {
                        is_favorite: true,
                        added_at: Some(100),
                        recorded_at: 100,
                        replica_id,
                    },
                )?;
                Ok(book_id)
            })
            .await
        });
    }
    let mut returned = Vec::new();
    while let Some(result) = writers.join_next().await {
        returned.push(result.unwrap().unwrap());
    }
    returned.sort();
    assert_eq!(returned, (1..=16).collect::<Vec<_>>());
    let document = ensure_database_document(&path, &identity, 101)
        .await
        .unwrap();
    assert_eq!(document.projection.favorites.len(), 16);
}

#[tokio::test]
async fn failed_mutation_should_rollback_and_preserve_error_category() {
    let (_directory, path, identity) = database().await;
    let before = ensure_database_document(&path, &identity, 1).await.unwrap();
    let replica_id = identity.replica_id.clone();
    let error = mutate_document(&path, &identity, 100, move |document| {
        set_favorite(
            document,
            42,
            &FavoriteValue {
                is_favorite: true,
                added_at: Some(100),
                recorded_at: 100,
                replica_id,
            },
        )?;
        Err::<(), _>(SyncError::InvalidRemoteObject {
            object_path: "fixture".into(),
            reason: "fixture error".into(),
        })
    })
    .await
    .unwrap_err();
    assert!(
        matches!(error, SyncError::InvalidRemoteObject { object_path, reason }
        if object_path == "fixture" && reason == "fixture error")
    );
    let after = ensure_database_document(&path, &identity, 101)
        .await
        .unwrap();
    assert_eq!(before.heads, after.heads);
    assert_eq!(before.projection, after.projection);
}
