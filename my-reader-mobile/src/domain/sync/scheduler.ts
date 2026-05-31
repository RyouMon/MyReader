import { useSyncExternalStore } from "react";

import { DEFAULT_SYNC_POLICY } from "./policy";
import { syncLibraries } from "./sync-library";
import type {
  ScheduledSyncTarget,
  SyncLibrariesDeps,
  SyncRunReport,
  SyncTrigger,
} from "./types";

export type SchedulerStatus = {
  running: boolean;
  lastTrigger: SyncTrigger | null;
  lastScheduledTarget: ScheduledSyncTarget | null;
  lastFinishedAt: number | null;
  lastReport: SyncRunReport | null;
};

type Listener = () => void;

const MIN_AUTO_INTERVAL_MS = 30_000;

let state: SchedulerStatus = {
  running: false,
  lastTrigger: null,
  lastScheduledTarget: null,
  lastFinishedAt: null,
  lastReport: null,
};

let inflight: Promise<SyncRunReport> | null = null;
const listeners = new Set<Listener>();

function setState(patch: Partial<SchedulerStatus>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getStatus(): SchedulerStatus {
  return state;
}

/**
 * Coalesces concurrent sync runs and enforces minimum interval for automatic triggers.
 */
export function runSyncLibraries(
  trigger: SyncTrigger,
  deps: SyncLibrariesDeps,
  scheduledTarget?: ScheduledSyncTarget,
): Promise<SyncRunReport> {
  if (inflight) return inflight;

  const now = Date.now();
  const sinceLast = state.lastFinishedAt ? now - state.lastFinishedAt : Infinity;
  if (
    (trigger === "startup" || trigger === "scheduled") &&
    sinceLast < MIN_AUTO_INTERVAL_MS
  ) {
    return Promise.resolve({
      trigger,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      results: [],
      aborted: true,
    });
  }

  inflight = (async () => {
    setState({ running: true, lastTrigger: trigger, lastScheduledTarget: scheduledTarget ?? null });
    const report = await syncLibraries(deps, trigger, DEFAULT_SYNC_POLICY, scheduledTarget);
    setState({
      running: false,
      lastFinishedAt: Date.now(),
      lastReport: report,
    });
    return report;
  })();

  void inflight.finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Hook for components that reflect background scheduler activity. */
export function useSyncSchedulerStatus(): SchedulerStatus {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

export type { SyncLibrariesDeps, SyncRunReport, SyncTrigger, ScheduledSyncTarget };
