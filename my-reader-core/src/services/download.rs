use std::collections::{HashMap, HashSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use crate::infrastructure::storage::normalize_remote_path;
use crate::models::{DownloadTask, DownloadTaskRequest, DownloadTaskStatus, EnqueuedDownloadTask};
use crate::CoreError;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct DownloadKey {
    library_id: String,
    relative_path: String,
}

struct TaskState {
    task: DownloadTask,
    key: DownloadKey,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
struct CoordinatorState {
    tasks: HashMap<String, TaskState>,
    order: Vec<String>,
    active_by_key: HashMap<DownloadKey, String>,
    pending_cancellations: HashSet<DownloadKey>,
}

#[derive(Clone)]
pub struct DownloadCancellation {
    inner: Arc<AtomicBool>,
}

impl DownloadCancellation {
    pub fn is_cancelled(&self) -> bool {
        self.inner.load(Ordering::Acquire)
    }
}

pub struct DownloadCoordinator {
    max_concurrent: usize,
    state: Mutex<CoordinatorState>,
}

impl DownloadCoordinator {
    pub fn new(max_concurrent: usize) -> Result<Self, CoreError> {
        if max_concurrent == 0 {
            return Err(CoreError::Config(
                "DOWNLOAD_MAX_CONCURRENT_MUST_BE_POSITIVE".into(),
            ));
        }
        Ok(Self {
            max_concurrent,
            state: Mutex::new(CoordinatorState::default()),
        })
    }

    pub fn enqueue(
        &self,
        mut request: DownloadTaskRequest,
    ) -> Result<EnqueuedDownloadTask, CoreError> {
        request.id = request.id.trim().to_owned();
        request.library_id = request.library_id.trim().to_owned();
        request.relative_path = normalize_remote_path(&request.relative_path)?;
        request.format = request
            .format
            .map(|format| format.trim().to_uppercase())
            .filter(|format| !format.is_empty());

        if request.id.is_empty() {
            return Err(CoreError::Config("DOWNLOAD_TASK_ID_REQUIRED".into()));
        }
        if request.library_id.is_empty() {
            return Err(CoreError::Config("DOWNLOAD_LIBRARY_ID_REQUIRED".into()));
        }
        if request.relative_path.is_empty() {
            return Err(CoreError::Config("BOOK_FILE_PATH_REQUIRED".into()));
        }

        let resource_key = request
            .dedupe_key
            .map(|key| key.trim().to_owned())
            .filter(|key| !key.is_empty())
            .unwrap_or_else(|| request.relative_path.clone());
        let key = DownloadKey {
            library_id: request.library_id.clone(),
            relative_path: resource_key,
        };
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());

        if let Some(existing_id) = state.active_by_key.get(&key) {
            let task = state
                .tasks
                .get(existing_id)
                .expect("active download key must reference a task")
                .task
                .clone();
            return Ok(EnqueuedDownloadTask {
                task,
                inserted: false,
            });
        }

        if state
            .tasks
            .get(&request.id)
            .is_some_and(|existing| existing.task.status.is_active())
        {
            return Err(CoreError::Config(format!(
                "DOWNLOAD_TASK_ID_ALREADY_ACTIVE: {}",
                request.id
            )));
        }

        let was_cancelled = state.pending_cancellations.remove(&key);
        let status = if was_cancelled {
            DownloadTaskStatus::Cancelled
        } else {
            DownloadTaskStatus::Queued
        };
        let cancelled = Arc::new(AtomicBool::new(was_cancelled));
        let task = DownloadTask {
            id: request.id.clone(),
            library_id: request.library_id,
            book_id: request.book_id,
            format: request.format,
            relative_path: request.relative_path,
            label: request.label,
            status,
            progress: 0.0,
            error: None,
        };

        state.tasks.remove(&request.id);
        state.order.retain(|id| id != &request.id);
        if status.is_active() {
            state.active_by_key.insert(key.clone(), request.id.clone());
        }
        state.order.push(request.id.clone());
        state.tasks.insert(
            request.id,
            TaskState {
                task: task.clone(),
                key,
                cancelled,
            },
        );

        Ok(EnqueuedDownloadTask {
            task,
            inserted: true,
        })
    }

    pub fn claim_ready(&self) -> Vec<DownloadTask> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let active_count = state
            .tasks
            .values()
            .filter(|task| {
                matches!(
                    task.task.status,
                    DownloadTaskStatus::Starting | DownloadTaskStatus::Downloading
                )
            })
            .count();
        let available = self.max_concurrent.saturating_sub(active_count);
        if available == 0 {
            return Vec::new();
        }

        let ready_ids = state
            .order
            .iter()
            .filter(|id| {
                state
                    .tasks
                    .get(*id)
                    .is_some_and(|task| task.task.status == DownloadTaskStatus::Queued)
            })
            .take(available)
            .cloned()
            .collect::<Vec<_>>();
        ready_ids
            .into_iter()
            .filter_map(|id| {
                let task = state.tasks.get_mut(&id)?;
                task.task.status = DownloadTaskStatus::Starting;
                Some(task.task.clone())
            })
            .collect()
    }

    pub fn claim(&self, task_id: &str) -> Option<DownloadTask> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let active_count = state
            .tasks
            .values()
            .filter(|task| {
                matches!(
                    task.task.status,
                    DownloadTaskStatus::Starting | DownloadTaskStatus::Downloading
                )
            })
            .count();
        if active_count >= self.max_concurrent {
            return None;
        }
        let task = state.tasks.get_mut(task_id)?;
        if task.task.status != DownloadTaskStatus::Queued {
            return None;
        }
        task.task.status = DownloadTaskStatus::Starting;
        Some(task.task.clone())
    }

    pub fn mark_started(&self, task_id: &str) -> Option<DownloadTask> {
        self.update_task(task_id, |task| {
            if matches!(
                task.status,
                DownloadTaskStatus::Starting | DownloadTaskStatus::Downloading
            ) {
                task.status = DownloadTaskStatus::Downloading;
            }
        })
    }

    pub fn report_progress(
        &self,
        task_id: &str,
        received: u64,
        total: u64,
    ) -> Option<DownloadTask> {
        self.update_task(task_id, |task| {
            if !matches!(
                task.status,
                DownloadTaskStatus::Starting | DownloadTaskStatus::Downloading
            ) {
                return;
            }
            task.status = DownloadTaskStatus::Downloading;
            if total > 0 {
                let progress = (received as f64 / total as f64).clamp(0.0, 1.0);
                task.progress = task.progress.max(progress);
            }
        })
    }

    pub fn complete(&self, task_id: &str) -> Option<DownloadTask> {
        self.finish_task(task_id, DownloadTaskStatus::Done, None)
    }

    pub fn fail(&self, task_id: &str, error: String) -> Option<DownloadTask> {
        self.finish_task(task_id, DownloadTaskStatus::Error, Some(error))
    }

    pub fn cancel(&self, task_id: &str) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let key = {
            let Some(task) = state.tasks.get_mut(task_id) else {
                return false;
            };
            if !task.task.status.is_active() {
                return task.task.status == DownloadTaskStatus::Cancelled;
            }
            task.cancelled.store(true, Ordering::Release);
            task.task.status = DownloadTaskStatus::Cancelled;
            task.task.error = None;
            task.key.clone()
        };
        state.active_by_key.remove(&key);
        true
    }

    pub fn cancel_by_key(&self, library_id: &str, relative_path: &str) -> bool {
        let Ok(relative_path) = normalize_remote_path(relative_path) else {
            return false;
        };
        let key = DownloadKey {
            library_id: library_id.trim().to_owned(),
            relative_path,
        };
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(task_id) = state.active_by_key.get(&key).cloned() {
            let task = state
                .tasks
                .get_mut(&task_id)
                .expect("active download key must reference a task");
            task.cancelled.store(true, Ordering::Release);
            task.task.status = DownloadTaskStatus::Cancelled;
            task.task.error = None;
            state.active_by_key.remove(&key);
            return true;
        }
        if state.pending_cancellations.contains(&key) {
            true
        } else {
            state.pending_cancellations.insert(key)
        }
    }

    pub fn is_cancelled(&self, task_id: &str) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .tasks
            .get(task_id)
            .is_some_and(|task| task.cancelled.load(Ordering::Acquire))
    }

    pub fn cancellation_token(&self, task_id: &str) -> Option<DownloadCancellation> {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .tasks
            .get(task_id)
            .map(|task| DownloadCancellation {
                inner: Arc::clone(&task.cancelled),
            })
    }

    pub fn is_active(&self, library_id: &str, relative_path: &str) -> bool {
        let Ok(relative_path) = normalize_remote_path(relative_path) else {
            return false;
        };
        let key = DownloadKey {
            library_id: library_id.trim().to_owned(),
            relative_path,
        };
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state
            .active_by_key
            .get(&key)
            .and_then(|id| state.tasks.get(id))
            .is_some_and(|task| task.task.status.is_active())
    }

    pub fn find_active(&self, library_id: &str, relative_path: &str) -> Option<DownloadTask> {
        let relative_path = normalize_remote_path(relative_path).ok()?;
        let key = DownloadKey {
            library_id: library_id.trim().to_owned(),
            relative_path,
        };
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state
            .active_by_key
            .get(&key)
            .and_then(|id| state.tasks.get(id))
            .map(|task| task.task.clone())
            .filter(|task| task.status.is_active())
    }

    pub fn tasks(&self) -> Vec<DownloadTask> {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state
            .order
            .iter()
            .filter_map(|id| state.tasks.get(id))
            .map(|task| task.task.clone())
            .collect()
    }

    pub fn release(&self, task_id: &str) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let Some(task) = state.tasks.remove(task_id) else {
            return false;
        };
        let key = DownloadKey {
            library_id: task.key.library_id,
            relative_path: task.key.relative_path,
        };
        if state
            .active_by_key
            .get(&key)
            .is_some_and(|id| id == task_id)
        {
            state.active_by_key.remove(&key);
        }
        state.order.retain(|id| id != task_id);
        true
    }

    pub fn clear_finished(&self) {
        let ids = {
            let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
            state
                .tasks
                .iter()
                .filter(|(_, task)| !task.task.status.is_active())
                .map(|(id, _)| id.clone())
                .collect::<Vec<_>>()
        };
        for id in ids {
            self.release(&id);
        }
    }

    fn update_task(
        &self,
        task_id: &str,
        update: impl FnOnce(&mut DownloadTask),
    ) -> Option<DownloadTask> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let task = state.tasks.get_mut(task_id)?;
        update(&mut task.task);
        Some(task.task.clone())
    }

    fn finish_task(
        &self,
        task_id: &str,
        status: DownloadTaskStatus,
        error: Option<String>,
    ) -> Option<DownloadTask> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let (task, key) = {
            let task = state.tasks.get_mut(task_id)?;
            if task.task.status == DownloadTaskStatus::Cancelled {
                return Some(task.task.clone());
            }
            task.task.status = status;
            task.task.error = error;
            if status == DownloadTaskStatus::Done {
                task.task.progress = 1.0;
            }
            (task.task.clone(), task.key.clone())
        };
        if state
            .active_by_key
            .get(&key)
            .is_some_and(|id| id == task_id)
        {
            state.active_by_key.remove(&key);
        }
        Some(task)
    }
}

#[cfg(test)]
mod tests {
    use crate::models::{DownloadTaskRequest, DownloadTaskStatus};

    use super::DownloadCoordinator;

    fn request(id: &str, path: &str) -> DownloadTaskRequest {
        DownloadTaskRequest {
            id: id.into(),
            library_id: "library".into(),
            book_id: Some("42".into()),
            format: Some("epub".into()),
            relative_path: path.into(),
            dedupe_key: None,
            label: "The Dispossessed".into(),
        }
    }

    #[test]
    fn should_return_existing_task_when_same_file_is_enqueued_twice() {
        let coordinator = DownloadCoordinator::new(2).unwrap();

        let first = coordinator
            .enqueue(request("first", "Author/Book/book.epub"))
            .unwrap();
        let duplicate = coordinator
            .enqueue(request("second", "/Author/Book/book.epub"))
            .unwrap();

        assert!(first.inserted);
        assert!(!duplicate.inserted);
        assert_eq!(duplicate.task.id, "first");
        assert_eq!(coordinator.tasks().len(), 1);
    }

    #[test]
    fn should_claim_only_available_slots_when_queue_has_more_tasks() {
        let coordinator = DownloadCoordinator::new(2).unwrap();
        for (id, path) in [
            ("first", "first.epub"),
            ("second", "second.epub"),
            ("third", "third.epub"),
        ] {
            coordinator.enqueue(request(id, path)).unwrap();
        }

        let claimed = coordinator.claim_ready();

        assert_eq!(
            claimed
                .iter()
                .map(|task| task.id.as_str())
                .collect::<Vec<_>>(),
            vec!["first", "second"]
        );
        assert_eq!(coordinator.tasks()[2].status, DownloadTaskStatus::Queued);
    }

    #[test]
    fn should_keep_progress_monotonic_when_native_callbacks_arrive_out_of_order() {
        let coordinator = DownloadCoordinator::new(1).unwrap();
        coordinator.enqueue(request("task", "book.epub")).unwrap();
        coordinator.claim_ready();

        coordinator.report_progress("task", 80, 100);
        let task = coordinator.report_progress("task", 20, 100).unwrap();

        assert_eq!(task.status, DownloadTaskStatus::Downloading);
        assert_eq!(task.progress, 0.8);
    }

    #[test]
    fn should_preserve_cancelled_state_when_completion_arrives_after_cancel() {
        let coordinator = DownloadCoordinator::new(1).unwrap();
        coordinator.enqueue(request("task", "book.epub")).unwrap();
        coordinator.claim_ready();

        assert!(coordinator.cancel("task"));
        let task = coordinator.complete("task").unwrap();

        assert_eq!(task.status, DownloadTaskStatus::Cancelled);
        assert!(coordinator.is_cancelled("task"));
    }

    #[test]
    fn should_cancel_at_first_checkpoint_when_cancel_arrives_before_enqueue() {
        let coordinator = DownloadCoordinator::new(1).unwrap();

        assert!(coordinator.cancel_by_key("library", "book.epub"));
        let enqueued = coordinator.enqueue(request("task", "book.epub")).unwrap();

        assert_eq!(enqueued.task.status, DownloadTaskStatus::Cancelled);
        assert!(coordinator.is_cancelled("task"));
        assert!(coordinator.claim_ready().is_empty());
    }

    #[test]
    fn should_allow_retry_when_terminal_task_is_replaced() {
        let coordinator = DownloadCoordinator::new(1).unwrap();
        coordinator.enqueue(request("task", "book.epub")).unwrap();
        coordinator.claim_ready();
        coordinator.fail("task", "offline".into());

        let retry = coordinator.enqueue(request("retry", "book.epub")).unwrap();

        assert!(retry.inserted);
        assert_eq!(retry.task.status, DownloadTaskStatus::Queued);
    }

    #[test]
    fn should_allow_retry_while_cancelled_transport_is_stopping() {
        let coordinator = DownloadCoordinator::new(1).unwrap();
        coordinator.enqueue(request("task", "book.epub")).unwrap();
        coordinator.claim_ready();
        coordinator.cancel("task");

        let retry = coordinator.enqueue(request("retry", "book.epub")).unwrap();

        assert!(retry.inserted);
        assert_eq!(retry.task.status, DownloadTaskStatus::Queued);
        assert!(coordinator.is_cancelled("task"));
    }
}
