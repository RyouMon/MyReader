import MyReaderRustComponents from "@/modules/myreader-rust-components"
import { applySyncReport } from "@/src/domain/sync/hooks/apply-sync-report"
import {
  DataIntegrityError,
  NetworkError,
  SyncConfigError,
  SyncConnectivityError,
} from "@/src/errors"
import { librarySidecarRootUri } from "@/src/services/fs/library-paths"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import type { DataSource, Library } from "../types"
import { cancelLibrarySidecarSyncTask } from "./library-sidecar/sync-database"
import { syncLibrary } from "./sync-library"
import type { MyReaderSyncMode } from "./types"

export type SidecarSyncReason =
  | "local_change"
  | "reader_closed"
  | "app_backgrounding"
  | "app_foregrounded"
  | "network_reconnected"
  | "library_activated"
  | "remote_change_hint"
  | "recovery_sweep"

type SyncExecution = {
  libraryId: string
  mode: MyReaderSyncMode
  reasons: SidecarSyncReason[]
}

type ScheduledSync = {
  libraryId: string
  generation: number
  deadline: number
}

type SchedulerTransition = {
  schedules: ScheduledSync[]
  cancelTimersFor: string[]
  execution: SyncExecution | null
  retry: { retryCount: number; nextRetryAt: number } | null
}

type SchedulerEnvelope = {
  state: unknown
  transition: SchedulerTransition
}

export type SidecarSyncRuntimeState = {
  libraries: Library[]
  dataSources: DataSource[]
  enableAutoSync: boolean
}

export type SidecarSyncRuntime = {
  request(
    libraryId: string,
    mode: MyReaderSyncMode,
    reason: SidecarSyncReason,
    timing?: "debounced" | "immediate",
  ): void
  flush(libraryId: string, reason: SidecarSyncReason): void
  recover(): Promise<void>
  requestContextualPull(
    libraryId: string,
    reason:
      | "app_foregrounded"
      | "network_reconnected"
      | "library_activated"
      | "recovery_sweep",
  ): Promise<boolean>
  setLibraryOnline(libraryId: string, online: boolean): void
  startSafetySweep(getActiveLibraryId: () => string | null): () => void
  dispose(): void
}

const POLICY_JSON = JSON.stringify({
  debounceMs: 2_000,
  maxWaitMs: 10_000,
  retryBaseMs: 2_000,
  retryMaxMs: 5 * 60_000,
})
const PULL_FRESHNESS_MS = 30_000
const SAFETY_SWEEP_MS = 60_000

function sidecarRootPath(library: Library): string {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}

function failureKind(error: unknown): string {
  if (error instanceof SyncConfigError) return "configuration"
  if (error instanceof DataIntegrityError) return "data_integrity"
  if (error instanceof SyncConnectivityError || error instanceof NetworkError) {
    return "connectivity"
  }
  const message = error instanceof Error ? error.message : String(error)
  if (
    /network|offline|timeout|timed out|connection|temporar|unavailable|rate.?limit|429|5\d\d/i.test(
      message,
    )
  ) {
    return "connectivity"
  }
  return "unexpected"
}

function suspendedReason(error: unknown): string {
  if (error instanceof SyncConfigError) return "configuration"
  if (error instanceof DataIntegrityError) return "data_integrity"
  return "unexpected"
}

export function createSidecarSyncRuntime(
  getState: () => SidecarSyncRuntimeState,
  onError?: (error: unknown) => void,
): SidecarSyncRuntime {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const runningTasks = new Map<string, string>()
  const cancelledTasks = new Set<string>()
  let stateJson: string | null = null
  let disposed = false
  let nextTaskSequence = 0

  const findLibrary = (libraryId: string) =>
    getState().libraries.find((library) => library.id === libraryId)

  function clearTimer(libraryId: string): void {
    const timer = timers.get(libraryId)
    if (timer) clearTimeout(timer)
    timers.delete(libraryId)
  }

  function schedule(sync: ScheduledSync): void {
    clearTimer(sync.libraryId)
    const timer = setTimeout(
      () => {
        timers.delete(sync.libraryId)
        const transition = advance({
          type: "begin",
          libraryId: sync.libraryId,
          generation: sync.generation,
        })
        if (transition.execution) void execute(transition.execution)
      },
      Math.max(0, sync.deadline - Date.now()),
    )
    timers.set(sync.libraryId, timer)
  }

  function advance(event: object): SchedulerTransition {
    const envelope = JSON.parse(
      MyReaderRustComponents.advanceSyncScheduler(
        stateJson,
        POLICY_JSON,
        JSON.stringify(event),
      ),
    ) as SchedulerEnvelope
    stateJson = JSON.stringify(envelope.state)
    for (const libraryId of envelope.transition.cancelTimersFor) {
      clearTimer(libraryId)
    }
    for (const scheduled of envelope.transition.schedules) schedule(scheduled)
    return envelope.transition
  }

  async function execute(execution: SyncExecution): Promise<void> {
    const state = getState()
    if (!state.enableAutoSync) {
      advance({
        type: "complete",
        libraryId: execution.libraryId,
        nowMs: Date.now(),
      })
      return
    }
    const library = findLibrary(execution.libraryId)
    if (!library) return
    nextTaskSequence += 1
    const taskId = `${execution.libraryId}:${Date.now()}:${nextTaskSequence}`
    runningTasks.set(execution.libraryId, taskId)
    try {
      const mode = (await MyReaderRustComponents.effectiveSidecarSyncMode(
        sidecarRootPath(library),
        execution.mode,
        String(Date.now()),
        String(PULL_FRESHNESS_MS),
      )) as MyReaderSyncMode | null
      if (mode) {
        const report = await syncLibrary(library, state.dataSources, {
          scope: "myreader",
          myreaderMode: mode,
          myreaderTaskId: taskId,
          throwOnFailure: true,
        })
        await applySyncReport(report, { trigger: "scheduled" })
      }
      advance({
        type: "complete",
        libraryId: execution.libraryId,
        nowMs: Date.now(),
      })
    } catch (error) {
      if (cancelledTasks.has(taskId)) return
      console.warn("[reading-sync] automatic:failed", {
        libraryId: execution.libraryId,
        mode: execution.mode,
        reasons: execution.reasons,
        error: error instanceof Error ? error.message : String(error),
      })
      onError?.(error)
      const disposition = MyReaderRustComponents.classifySidecarSyncFailure(
        failureKind(error),
      )
      if (disposition === "retry") {
        const transition = advance({
          type: "retry",
          execution,
          nowMs: Date.now(),
          randomFraction: Math.random(),
        })
        if (transition.retry) {
          await MyReaderRustComponents.recordSidecarSyncRetry(
            sidecarRootPath(library),
            String(transition.retry.nextRetryAt),
            transition.retry.retryCount,
          )
        }
      } else {
        advance({ type: "suspend", execution })
        await MyReaderRustComponents.recordSidecarSyncSuspension(
          sidecarRootPath(library),
          suspendedReason(error),
        )
      }
    } finally {
      if (runningTasks.get(execution.libraryId) === taskId) {
        runningTasks.delete(execution.libraryId)
      }
      cancelledTasks.delete(taskId)
    }
  }

  const runtime: SidecarSyncRuntime = {
    request(libraryId, mode, reason, timing = "debounced") {
      if (disposed) return
      advance({
        type: "request",
        libraryId,
        mode,
        reason,
        timing,
        nowMs: Date.now(),
      })
    },
    flush(libraryId, reason) {
      if (disposed) return
      advance({ type: "flush", libraryId, reason, nowMs: Date.now() })
    },
    async recover() {
      for (const library of getState().libraries) {
        const snapshot = await MyReaderRustComponents.readSidecarSyncSchedule(
          sidecarRootPath(library),
        )
        advance({
          type: "restore",
          libraryId: library.id,
          nextRetryAt: snapshot.nextRetryAt,
          retryCount: snapshot.transientFailureCount,
          suspended: snapshot.suspendedReason !== null,
        })
        if (
          snapshot.suspendedReason === null &&
          (await MyReaderRustComponents.hasSidecarSyncPendingWork(
            sidecarRootPath(library),
          ))
        ) {
          runtime.request(library.id, "push_only", "local_change", "immediate")
        }
      }
    },
    async requestContextualPull(libraryId, reason) {
      const library = findLibrary(libraryId)
      if (!library) return false
      const mode = (await MyReaderRustComponents.effectiveSidecarSyncMode(
        sidecarRootPath(library),
        "full",
        String(Date.now()),
        String(PULL_FRESHNESS_MS),
      )) as MyReaderSyncMode | null
      if (!mode) return false
      runtime.request(libraryId, mode, reason, "immediate")
      return true
    },
    setLibraryOnline(libraryId, online) {
      if (disposed) return
      advance({
        type: "set_library_online",
        libraryId,
        online,
        nowMs: Date.now(),
      })
    },
    startSafetySweep(getActiveLibraryId) {
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const scheduleNext = () => {
        const jitter = 0.8 + Math.random() * 0.4
        timer = setTimeout(
          async () => {
            const libraryId = getActiveLibraryId()
            if (libraryId) {
              try {
                await runtime.requestContextualPull(libraryId, "recovery_sweep")
              } catch (error) {
                onError?.(error)
              }
            }
            if (!stopped) scheduleNext()
          },
          Math.round(SAFETY_SWEEP_MS * jitter),
        )
      }
      scheduleNext()
      return () => {
        stopped = true
        if (timer) clearTimeout(timer)
      }
    },
    dispose() {
      if (disposed) return
      advance({ type: "dispose" })
      disposed = true
      for (const taskId of runningTasks.values()) {
        cancelledTasks.add(taskId)
        cancelLibrarySidecarSyncTask(taskId)
      }
      runningTasks.clear()
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }

  return runtime
}
