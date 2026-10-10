use std::{
    future::{poll_fn, Future},
    task::Poll,
    time::Duration,
};

use tokio::sync::oneshot;

#[test]
fn cancelled_caller_should_discard_work_still_queued_in_the_blocking_pool() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(1)
        .build()
        .unwrap();
    runtime.block_on(async {
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let holder = tokio::task::spawn_blocking(move || {
            started_tx.send(()).unwrap();
            release_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        });
        started_rx.await.unwrap();

        let (ran_tx, ran_rx) = oneshot::channel();
        let mut queued = Box::pin(super::run(move || {
            ran_tx.send(()).unwrap();
            Ok(())
        }));
        poll_fn(|cx| {
            assert!(queued.as_mut().poll(cx).is_pending());
            Poll::Ready(())
        })
        .await;
        drop(queued);
        release_tx.send(()).unwrap();
        holder.await.unwrap();
        assert!(
            ran_rx.await.is_err(),
            "cancelled queued work must never execute"
        );
    });
}
