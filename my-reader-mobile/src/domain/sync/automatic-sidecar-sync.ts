import type { DataSource, Library } from "../types"
import {
  readLibrarySidecarScheduleState,
  writeLibrarySidecarScheduleState,
  type LibrarySidecarScheduleState,
} from "@/src/repos/library-sidecar-schedule"
import {
  DataIntegrityError,
  NetworkError,
  SyncConfigError,
  SyncConnectivityError,
} from "../../errors"
import { applySyncReport } from "./hooks/apply-sync-report"
import { hasPendingLibrarySidecarChanges } from "./library-sidecar/database-store"
import { cancelLibrarySidecarSyncTask } from "./library-sidecar/sync-database"
import {
  createSidecarSyncScheduler,
  type SidecarSyncErrorDisposition,
  type SidecarSyncReason,
  type SidecarSyncScheduler,
} from "./sidecar-scheduler"
import { syncLibrary } from "./sync-library"

export type AutomaticSidecarSyncState = {
  libraries: Library[]
  dataSources: DataSource[]
  enableAutoSync: boolean
}

export async function shouldPullLibrarySidecar(
  library: Library,
  nowMs: number,
  freshnessMs: number,
): Promise<boolean> {
  const state = await readLibrarySidecarScheduleState(library)
  return (
    state?.lastSuccessfulPullAt === null ||
    state?.lastSuccessfulPullAt === undefined ||
    nowMs - state.lastSuccessfulPullAt >= freshnessMs
  )
}

export async function requestContextualSidecarPull(
  scheduler: SidecarSyncScheduler,
  library: Library,
  reason: Extract<
    SidecarSyncReason,
    "app_foregrounded" | "network_reconnected" | "library_activated"
  >,
  nowMs = Date.now(),
  freshnessMs = 30_000,
): Promise<boolean> {
  if (!(await shouldPullLibrarySidecar(library, nowMs, freshnessMs))) {
    return false
  }
  scheduler.request({
    libraryId: library.id,
    mode: "full",
    reason,
    timing: "immediate",
  })
  return true
}

export function startSidecarPullSafetySweep(options: {
  scheduler: SidecarSyncScheduler
  getActiveLibrary: () => Library | undefined
  intervalMs?: number
  freshnessMs?: number
  jitterRatio?: number
  random?: () => number
  onError?: (error: unknown, library: Library) => void
}): () => void {
  const intervalMs = options.intervalMs ?? 60_000
  const freshnessMs = options.freshnessMs ?? 30_000
  const jitterRatio = options.jitterRatio ?? 0.2
  const random = options.random ?? Math.random
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const scheduleNext = () => {
    const jitter = 1 + (random() * 2 - 1) * jitterRatio
    timer = setTimeout(
      async () => {
        const library = options.getActiveLibrary()
        if (library) {
          try {
            if (
              await shouldPullLibrarySidecar(library, Date.now(), freshnessMs)
            ) {
              options.scheduler.request({
                libraryId: library.id,
                mode: "full",
                reason: "recovery_sweep",
                timing: "immediate",
              })
            }
          } catch (error) {
            options.onError?.(error, library)
          }
        }
        if (!stopped) scheduleNext()
      },
      Math.round(intervalMs * jitter),
    )
  }

  scheduleNext()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

async function updateScheduleState(
  library: Library,
  update: (current: LibrarySidecarScheduleState) => LibrarySidecarScheduleState,
): Promise<void> {
  const current = (await readLibrarySidecarScheduleState(library)) ?? {
    lastSuccessfulPullAt: null,
    nextRetryAt: null,
    transientFailureCount: 0,
    suspendedReason: null,
  }
  await writeLibrarySidecarScheduleState(library, update(current))
}

function suspendedReason(error: unknown): string {
  if (error instanceof SyncConfigError) return "configuration"
  if (error instanceof DataIntegrityError) return "data_integrity"
  return "unexpected"
}

export function classifyAutomaticSidecarSyncError(
  error: unknown,
): SidecarSyncErrorDisposition {
  if (error instanceof SyncConfigError || error instanceof DataIntegrityError) {
    return "suspend"
  }
  if (error instanceof SyncConnectivityError || error instanceof NetworkError) {
    return "retry"
  }
  const message = error instanceof Error ? error.message : String(error)
  if (
    /network|offline|timeout|timed out|connection|temporar|unavailable|rate.?limit|429|5\d\d/i.test(
      message,
    )
  ) {
    return "retry"
  }
  return "suspend"
}

export function createAutomaticSidecarSyncScheduler(
  getState: () => AutomaticSidecarSyncState,
  onError?: (error: unknown) => void,
): SidecarSyncScheduler {
  return createSidecarSyncScheduler({
    async execute(execution, taskId) {
      const state = getState()
      if (!state.enableAutoSync) return
      const library = state.libraries.find(
        (candidate) => candidate.id === execution.libraryId,
      )
      if (!library) return
      const report = await syncLibrary(library, state.dataSources, {
        scope: "myreader",
        myreaderMode: execution.mode,
        myreaderTaskId: taskId,
        throwOnFailure: true,
      })
      applySyncReport(report, { trigger: "scheduled" })
    },
    cancelTask: cancelLibrarySidecarSyncTask,
    classifyError: classifyAutomaticSidecarSyncError,
    onError(error, execution) {
      console.warn("[reading-sync] automatic:failed", {
        libraryId: execution.libraryId,
        mode: execution.mode,
        reasons: execution.reasons,
        error: error instanceof Error ? error.message : String(error),
      })
      onError?.(error)
    },
    async onRetryScheduled(_error, execution, retry) {
      const library = getState().libraries.find(
        (candidate) => candidate.id === execution.libraryId,
      )
      if (!library) return
      await updateScheduleState(library, (current) => ({
        ...current,
        nextRetryAt: retry.nextRetryAt,
        transientFailureCount: retry.retryCount,
        suspendedReason: null,
      }))
    },
    async onSuspended(error, execution) {
      const library = getState().libraries.find(
        (candidate) => candidate.id === execution.libraryId,
      )
      if (!library) return
      await updateScheduleState(library, (current) => ({
        ...current,
        nextRetryAt: null,
        suspendedReason: suspendedReason(error),
      }))
    },
  })
}

export async function recoverPendingSidecarWork(
  scheduler: SidecarSyncScheduler,
  libraries: Library[],
): Promise<void> {
  for (const library of libraries) {
    if (await hasPendingLibrarySidecarChanges(library)) {
      scheduler.request({
        libraryId: library.id,
        mode: "push_only",
        reason: "local_change",
        timing: "immediate",
      })
    }
  }
}
