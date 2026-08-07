import { DEFAULT_SYNC_POLICY } from "./policy"
import { syncLibraries } from "./sync-library"
import type {
  ScheduledSyncTarget,
  LibrarySyncObserver,
  SyncLibrariesDeps,
  SyncRunReport,
  SyncTrigger,
} from "./types"

const MIN_AUTO_INTERVAL_MS = 30_000

let inflight: Promise<SyncRunReport> | null = null
let lastFinishedAt: number | null = null

/**
 * Coalesces concurrent sync runs and enforces minimum interval for automatic triggers.
 */
export function runSyncLibraries(
  trigger: SyncTrigger,
  deps: SyncLibrariesDeps,
  scheduledTarget?: ScheduledSyncTarget,
  observer?: LibrarySyncObserver,
): Promise<SyncRunReport> {
  if (inflight) return inflight

  const now = Date.now()
  const sinceLast = lastFinishedAt ? now - lastFinishedAt : Infinity
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
    })
  }

  inflight = (async () => {
    const report = await syncLibraries(
      deps,
      trigger,
      DEFAULT_SYNC_POLICY,
      scheduledTarget,
      undefined,
      observer,
    )
    lastFinishedAt = Date.now()
    return report
  })()

  void inflight.finally(() => {
    inflight = null
  })

  return inflight
}

export type {
  ScheduledSyncTarget,
  SyncLibrariesDeps,
  SyncRunReport,
  SyncTrigger,
}
