use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::exchange::SyncMode;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncTiming {
    Debounced,
    Immediate,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerPolicy {
    pub debounce_ms: u64,
    pub max_wait_ms: u64,
    pub retry_base_ms: u64,
    pub retry_max_ms: u64,
    pub pull_freshness_ms: u64,
    pub safety_sweep_ms: u64,
}

impl Default for SchedulerPolicy {
    fn default() -> Self {
        Self {
            debounce_ms: 2_000,
            max_wait_ms: 10_000,
            retry_base_ms: 2_000,
            retry_max_ms: 5 * 60_000,
            pull_freshness_ms: 30_000,
            safety_sweep_ms: 60_000,
        }
    }
}

impl SchedulerPolicy {
    pub fn safety_sweep_delay_ms(&self, random_fraction: f64) -> u64 {
        let factor = 0.8 + random_fraction.clamp(0.0, 1.0) * 0.4;
        (self.safety_sweep_ms as f64 * factor).round() as u64
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncExecution {
    pub library_id: String,
    pub mode: SyncMode,
    pub reasons: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledSync {
    pub library_id: String,
    pub generation: u64,
    pub deadline: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrySchedule {
    pub retry_count: u32,
    pub next_retry_at: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerTransition {
    pub schedules: Vec<ScheduledSync>,
    pub cancel_timers_for: Vec<String>,
    pub execution: Option<SyncExecution>,
    pub retry: Option<RetrySchedule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum SchedulerEvent {
    Request {
        library_id: String,
        mode: SyncMode,
        reason: String,
        timing: SyncTiming,
        now_ms: u64,
    },
    Flush {
        library_id: String,
        reason: String,
        now_ms: u64,
    },
    Begin {
        library_id: String,
        generation: u64,
    },
    Complete {
        library_id: String,
        now_ms: u64,
    },
    Retry {
        execution: SyncExecution,
        now_ms: u64,
        random_fraction: f64,
    },
    Suspend {
        execution: SyncExecution,
    },
    Resume {
        library_id: String,
        now_ms: u64,
    },
    SetOnline {
        online: bool,
        now_ms: u64,
    },
    SetLibraryOnline {
        library_id: String,
        online: bool,
        now_ms: u64,
    },
    WakeRetry {
        library_id: String,
        now_ms: u64,
    },
    Restore {
        library_id: String,
        next_retry_at: Option<u64>,
        retry_count: u32,
        suspended: bool,
    },
    Dispose,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingIntent {
    mode: SyncMode,
    reasons: BTreeSet<String>,
    first_requested_at: u64,
    deadline: u64,
    generation: u64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibrarySchedule {
    pending: Option<PendingIntent>,
    running: bool,
    retry_count: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerState {
    policy: SchedulerPolicy,
    libraries: HashMap<String, LibrarySchedule>,
    suspended: HashSet<String>,
    offline_libraries: HashSet<String>,
    blocked_until: HashMap<String, u64>,
    next_generation: u64,
    online: bool,
    disposed: bool,
}

impl Default for SchedulerState {
    fn default() -> Self {
        Self::new(SchedulerPolicy::default())
    }
}

impl SchedulerState {
    pub fn new(policy: SchedulerPolicy) -> Self {
        Self {
            policy,
            libraries: HashMap::new(),
            suspended: HashSet::new(),
            offline_libraries: HashSet::new(),
            blocked_until: HashMap::new(),
            next_generation: 0,
            online: true,
            disposed: false,
        }
    }

    pub fn apply(&mut self, event: SchedulerEvent) -> SchedulerTransition {
        match event {
            SchedulerEvent::Request {
                library_id,
                mode,
                reason,
                timing,
                now_ms,
            } => self.request(&library_id, mode, reason, timing, now_ms),
            SchedulerEvent::Flush {
                library_id,
                reason,
                now_ms,
            } => self.flush(&library_id, reason, now_ms),
            SchedulerEvent::Begin {
                library_id,
                generation,
            } => self.begin(&library_id, generation),
            SchedulerEvent::Complete { library_id, now_ms } => self.complete(&library_id, now_ms),
            SchedulerEvent::Retry {
                execution,
                now_ms,
                random_fraction,
            } => self.retry(execution, now_ms, random_fraction),
            SchedulerEvent::Suspend { execution } => self.suspend(execution),
            SchedulerEvent::Resume { library_id, now_ms } => self.resume(&library_id, now_ms),
            SchedulerEvent::SetOnline { online, now_ms } => self.set_online(online, now_ms),
            SchedulerEvent::SetLibraryOnline {
                library_id,
                online,
                now_ms,
            } => self.set_library_online(&library_id, online, now_ms),
            SchedulerEvent::WakeRetry { library_id, now_ms } => {
                self.wake_retry(&library_id, now_ms)
            }
            SchedulerEvent::Restore {
                library_id,
                next_retry_at,
                retry_count,
                suspended,
            } => {
                self.restore(&library_id, next_retry_at, retry_count, suspended);
                SchedulerTransition::default()
            }
            SchedulerEvent::Dispose => self.dispose(),
        }
    }

    fn request(
        &mut self,
        library_id: &str,
        mode: SyncMode,
        reason: String,
        timing: SyncTiming,
        now_ms: u64,
    ) -> SchedulerTransition {
        self.next_generation += 1;
        let generation = self.next_generation;
        let schedule = self.libraries.entry(library_id.to_owned()).or_default();
        let pending = schedule.pending.get_or_insert_with(|| PendingIntent {
            mode,
            reasons: BTreeSet::new(),
            first_requested_at: now_ms,
            deadline: now_ms,
            generation,
        });
        pending.mode = merge_mode(pending.mode, mode);
        pending.reasons.insert(reason);
        pending.generation = generation;
        pending.deadline = match timing {
            SyncTiming::Immediate => now_ms,
            SyncTiming::Debounced => (now_ms + self.policy.debounce_ms)
                .min(pending.first_requested_at + self.policy.max_wait_ms),
        }
        .max(self.blocked_until.get(library_id).copied().unwrap_or(0));

        self.schedule_if_runnable(library_id)
    }

    fn flush(&mut self, library_id: &str, reason: String, now_ms: u64) -> SchedulerTransition {
        let Some(schedule) = self.libraries.get_mut(library_id) else {
            return SchedulerTransition::default();
        };
        let Some(pending) = schedule.pending.as_mut() else {
            return SchedulerTransition::default();
        };
        self.next_generation += 1;
        pending.reasons.insert(reason);
        pending.generation = self.next_generation;
        pending.deadline = now_ms;
        self.schedule_if_runnable(library_id)
    }

    fn begin(&mut self, library_id: &str, generation: u64) -> SchedulerTransition {
        if !self.runnable(library_id) {
            return SchedulerTransition::default();
        }
        let Some(schedule) = self.libraries.get_mut(library_id) else {
            return SchedulerTransition::default();
        };
        let Some(pending) = schedule.pending.as_ref() else {
            return SchedulerTransition::default();
        };
        if schedule.running || pending.generation != generation {
            return SchedulerTransition::default();
        }
        let pending = schedule.pending.take().expect("pending intent exists");
        schedule.running = true;
        SchedulerTransition {
            execution: Some(SyncExecution {
                library_id: library_id.to_owned(),
                mode: pending.mode,
                reasons: pending.reasons,
            }),
            ..SchedulerTransition::default()
        }
    }

    fn complete(&mut self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        let Some(schedule) = self.libraries.get_mut(library_id) else {
            return SchedulerTransition::default();
        };
        schedule.running = false;
        schedule.retry_count = 0;
        self.blocked_until.remove(library_id);
        if let Some(pending) = schedule.pending.as_mut() {
            pending.deadline = pending.deadline.max(now_ms);
        }
        self.schedule_if_runnable(library_id)
    }

    fn retry(
        &mut self,
        execution: SyncExecution,
        now_ms: u64,
        random_fraction: f64,
    ) -> SchedulerTransition {
        self.next_generation += 1;
        let generation = self.next_generation;
        let schedule = self
            .libraries
            .entry(execution.library_id.clone())
            .or_default();
        schedule.running = false;
        schedule.retry_count += 1;
        let delay = retry_delay_ms(&self.policy, schedule.retry_count, random_fraction);
        let next_retry_at = now_ms + delay;
        self.blocked_until
            .insert(execution.library_id.clone(), next_retry_at);
        let pending = schedule.pending.get_or_insert_with(|| PendingIntent {
            mode: execution.mode,
            reasons: BTreeSet::new(),
            first_requested_at: now_ms,
            deadline: next_retry_at,
            generation,
        });
        pending.mode = merge_mode(pending.mode, execution.mode);
        pending.reasons.extend(execution.reasons);
        pending.generation = generation;
        pending.deadline = next_retry_at;
        let retry_count = schedule.retry_count;
        let mut transition = self.schedule_if_runnable(&execution.library_id);
        transition.retry = Some(RetrySchedule {
            retry_count,
            next_retry_at,
        });
        transition
    }

    fn suspend(&mut self, execution: SyncExecution) -> SchedulerTransition {
        self.next_generation += 1;
        let schedule = self
            .libraries
            .entry(execution.library_id.clone())
            .or_default();
        schedule.running = false;
        let pending = schedule.pending.get_or_insert_with(|| PendingIntent {
            mode: execution.mode,
            reasons: BTreeSet::new(),
            first_requested_at: 0,
            deadline: 0,
            generation: self.next_generation,
        });
        pending.mode = merge_mode(pending.mode, execution.mode);
        pending.reasons.extend(execution.reasons);
        pending.generation = self.next_generation;
        self.suspended.insert(execution.library_id.clone());
        SchedulerTransition {
            cancel_timers_for: vec![execution.library_id],
            ..SchedulerTransition::default()
        }
    }

    fn resume(&mut self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.suspended.remove(library_id);
        self.blocked_until.remove(library_id);
        if let Some(schedule) = self.libraries.get_mut(library_id) {
            schedule.retry_count = 0;
            if let Some(pending) = schedule.pending.as_mut() {
                self.next_generation += 1;
                pending.generation = self.next_generation;
                pending.deadline = now_ms;
            }
        }
        self.schedule_if_runnable(library_id)
    }

    fn set_online(&mut self, online: bool, now_ms: u64) -> SchedulerTransition {
        if self.online == online {
            return SchedulerTransition::default();
        }
        self.online = online;
        if !online {
            return SchedulerTransition {
                cancel_timers_for: self.libraries.keys().cloned().collect(),
                ..SchedulerTransition::default()
            };
        }
        self.schedule_all_pending(now_ms)
    }

    fn set_library_online(
        &mut self,
        library_id: &str,
        online: bool,
        now_ms: u64,
    ) -> SchedulerTransition {
        if !online {
            self.offline_libraries.insert(library_id.to_owned());
            return SchedulerTransition {
                cancel_timers_for: vec![library_id.to_owned()],
                ..SchedulerTransition::default()
            };
        }
        self.offline_libraries.remove(library_id);
        if let Some(schedule) = self.libraries.get_mut(library_id) {
            if let Some(pending) = schedule.pending.as_mut() {
                self.next_generation += 1;
                pending.generation = self.next_generation;
                pending.deadline = now_ms;
            }
        }
        self.schedule_if_runnable(library_id)
    }

    fn wake_retry(&mut self, library_id: &str, now_ms: u64) -> SchedulerTransition {
        self.blocked_until.remove(library_id);
        if let Some(schedule) = self.libraries.get_mut(library_id) {
            if let Some(pending) = schedule.pending.as_mut() {
                self.next_generation += 1;
                pending.generation = self.next_generation;
                pending.deadline = now_ms;
            }
        }
        self.schedule_if_runnable(library_id)
    }

    fn restore(
        &mut self,
        library_id: &str,
        next_retry_at: Option<u64>,
        retry_count: u32,
        suspended: bool,
    ) {
        self.libraries
            .entry(library_id.to_owned())
            .or_default()
            .retry_count = retry_count;
        if suspended {
            self.suspended.insert(library_id.to_owned());
        }
        if let Some(next_retry_at) = next_retry_at {
            self.blocked_until
                .insert(library_id.to_owned(), next_retry_at);
        }
    }

    fn dispose(&mut self) -> SchedulerTransition {
        self.disposed = true;
        let cancel_timers_for = self.libraries.keys().cloned().collect();
        self.libraries.clear();
        self.suspended.clear();
        self.offline_libraries.clear();
        self.blocked_until.clear();
        SchedulerTransition {
            cancel_timers_for,
            ..SchedulerTransition::default()
        }
    }

    fn schedule_if_runnable(&self, library_id: &str) -> SchedulerTransition {
        if !self.runnable(library_id) {
            return SchedulerTransition::default();
        }
        let Some(schedule) = self.libraries.get(library_id) else {
            return SchedulerTransition::default();
        };
        let Some(pending) = schedule.pending.as_ref() else {
            return SchedulerTransition::default();
        };
        if schedule.running {
            return SchedulerTransition::default();
        }
        SchedulerTransition {
            schedules: vec![ScheduledSync {
                library_id: library_id.to_owned(),
                generation: pending.generation,
                deadline: pending.deadline,
            }],
            ..SchedulerTransition::default()
        }
    }

    fn schedule_all_pending(&mut self, now_ms: u64) -> SchedulerTransition {
        let library_ids = self.libraries.keys().cloned().collect::<Vec<_>>();
        let mut schedules = Vec::new();
        for library_id in library_ids {
            if let Some(schedule) = self.libraries.get_mut(&library_id) {
                if let Some(pending) = schedule.pending.as_mut() {
                    self.next_generation += 1;
                    pending.generation = self.next_generation;
                    pending.deadline = now_ms;
                }
            }
            schedules.extend(self.schedule_if_runnable(&library_id).schedules);
        }
        SchedulerTransition {
            schedules,
            ..SchedulerTransition::default()
        }
    }

    fn runnable(&self, library_id: &str) -> bool {
        !self.disposed
            && self.online
            && !self.offline_libraries.contains(library_id)
            && !self.suspended.contains(library_id)
    }
}

fn merge_mode(current: SyncMode, incoming: SyncMode) -> SyncMode {
    if current == SyncMode::Full || incoming == SyncMode::Full {
        SyncMode::Full
    } else {
        SyncMode::PushOnly
    }
}

fn retry_delay_ms(policy: &SchedulerPolicy, retry_count: u32, random_fraction: f64) -> u64 {
    let ceiling = policy
        .retry_base_ms
        .saturating_mul(2_u64.saturating_pow(retry_count.saturating_sub(1)))
        .min(policy.retry_max_ms);
    (ceiling as f64 * random_fraction.clamp(0.0, 1.0)) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(
        state: &mut SchedulerState,
        mode: SyncMode,
        timing: SyncTiming,
        now_ms: u64,
    ) -> SchedulerTransition {
        state.apply(SchedulerEvent::Request {
            library_id: "library-1".to_owned(),
            mode,
            reason: "local_change".to_owned(),
            timing,
            now_ms,
        })
    }

    #[test]
    fn should_share_contextual_pull_and_safety_sweep_timing_when_policy_is_default() {
        let policy = SchedulerPolicy::default();

        assert_eq!(policy.pull_freshness_ms, 30_000);
        assert_eq!(policy.safety_sweep_ms, 60_000);
        assert_eq!(policy.safety_sweep_delay_ms(0.0), 48_000);
        assert_eq!(policy.safety_sweep_delay_ms(1.0), 72_000);
    }

    #[test]
    fn should_coalesce_and_upgrade_work_when_changes_arrive_during_debounce() {
        let mut state = SchedulerState::default();
        request(&mut state, SyncMode::PushOnly, SyncTiming::Debounced, 1_000);
        let transition = state.apply(SchedulerEvent::Request {
            library_id: "library-1".to_owned(),
            mode: SyncMode::Full,
            reason: "app_foregrounded".to_owned(),
            timing: SyncTiming::Debounced,
            now_ms: 2_000,
        });
        let scheduled = &transition.schedules[0];

        assert_eq!(scheduled.deadline, 4_000);
        let execution = state
            .apply(SchedulerEvent::Begin {
                library_id: "library-1".to_owned(),
                generation: scheduled.generation,
            })
            .execution
            .unwrap();
        assert_eq!(execution.mode, SyncMode::Full);
        assert_eq!(
            execution.reasons,
            BTreeSet::from(["app_foregrounded".to_owned(), "local_change".to_owned()])
        );
    }

    #[test]
    fn should_execute_by_maximum_wait_when_changes_keep_resetting_debounce() {
        let mut state = SchedulerState::new(SchedulerPolicy {
            max_wait_ms: 5_000,
            ..SchedulerPolicy::default()
        });
        let mut transition = SchedulerTransition::default();
        for now_ms in (0..=5_000).step_by(1_000) {
            transition = request(
                &mut state,
                SyncMode::PushOnly,
                SyncTiming::Debounced,
                now_ms,
            );
        }

        assert_eq!(transition.schedules[0].deadline, 5_000);
    }

    #[test]
    fn should_rerun_without_overlap_when_work_arrives_during_execution() {
        let mut state = SchedulerState::default();
        let first = request(&mut state, SyncMode::PushOnly, SyncTiming::Immediate, 1_000);
        state.apply(SchedulerEvent::Begin {
            library_id: "library-1".to_owned(),
            generation: first.schedules[0].generation,
        });

        let pending = request(&mut state, SyncMode::Full, SyncTiming::Immediate, 1_100);
        assert!(pending.schedules.is_empty());
        let rerun = state.apply(SchedulerEvent::Complete {
            library_id: "library-1".to_owned(),
            now_ms: 1_200,
        });
        let execution = state
            .apply(SchedulerEvent::Begin {
                library_id: "library-1".to_owned(),
                generation: rerun.schedules[0].generation,
            })
            .execution
            .unwrap();

        assert_eq!(execution.mode, SyncMode::Full);
    }

    #[test]
    fn should_retry_with_jittered_exponential_delay_when_execution_fails() {
        let mut state = SchedulerState::default();
        let scheduled = request(&mut state, SyncMode::PushOnly, SyncTiming::Immediate, 1_000);
        let execution = state
            .apply(SchedulerEvent::Begin {
                library_id: "library-1".to_owned(),
                generation: scheduled.schedules[0].generation,
            })
            .execution
            .unwrap();
        let retry = state.apply(SchedulerEvent::Retry {
            execution,
            now_ms: 2_000,
            random_fraction: 0.5,
        });

        assert_eq!(
            retry.retry,
            Some(RetrySchedule {
                retry_count: 1,
                next_retry_at: 3_000,
            })
        );
        assert_eq!(retry.schedules[0].deadline, 3_000);
    }

    #[test]
    fn should_preserve_failed_work_until_suspended_library_resumes() {
        let mut state = SchedulerState::default();
        let scheduled = request(&mut state, SyncMode::Full, SyncTiming::Immediate, 1_000);
        let execution = state
            .apply(SchedulerEvent::Begin {
                library_id: "library-1".to_owned(),
                generation: scheduled.schedules[0].generation,
            })
            .execution
            .unwrap();

        let suspended = state.apply(SchedulerEvent::Suspend { execution });
        assert_eq!(suspended.cancel_timers_for, vec!["library-1"]);
        let resumed = state.apply(SchedulerEvent::Resume {
            library_id: "library-1".to_owned(),
            now_ms: 2_000,
        });

        assert_eq!(resumed.schedules.len(), 1);
    }

    #[test]
    fn should_keep_local_library_runnable_when_remote_library_is_offline() {
        let mut state = SchedulerState::default();
        state.apply(SchedulerEvent::SetLibraryOnline {
            library_id: "remote-library".to_owned(),
            online: false,
            now_ms: 1_000,
        });
        let remote = state.apply(SchedulerEvent::Request {
            library_id: "remote-library".to_owned(),
            mode: SyncMode::PushOnly,
            reason: "local_change".to_owned(),
            timing: SyncTiming::Immediate,
            now_ms: 1_000,
        });
        let local = state.apply(SchedulerEvent::Request {
            library_id: "local-library".to_owned(),
            mode: SyncMode::PushOnly,
            reason: "local_change".to_owned(),
            timing: SyncTiming::Immediate,
            now_ms: 1_000,
        });

        assert!(remote.schedules.is_empty());
        assert_eq!(local.schedules[0].library_id, "local-library");
    }

    #[test]
    fn should_restore_pending_work_when_network_reconnects() {
        let mut state = SchedulerState::default();
        state.apply(SchedulerEvent::SetOnline {
            online: false,
            now_ms: 1_000,
        });
        let pending = request(&mut state, SyncMode::PushOnly, SyncTiming::Immediate, 1_000);
        assert!(pending.schedules.is_empty());

        let online = state.apply(SchedulerEvent::SetOnline {
            online: true,
            now_ms: 2_000,
        });
        assert_eq!(online.schedules[0].deadline, 2_000);
    }
}
