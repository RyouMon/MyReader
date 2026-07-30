import { applySyncReport } from "@/src/domain/sync/hooks/apply-sync-report"
import {
  DataIntegrityError,
  NetworkError,
  SyncConfigError,
  SyncConnectivityError,
} from "@/src/errors"
import { librarySidecarRootUri } from "@/src/services/fs/library-paths"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import {
  beginCoordinatedSync,
  completeCoordinatedSync,
  createSyncCoordinator,
  disposeSyncCoordinator,
  effectiveCoordinatedSyncExecution,
  failCoordinatedSync,
  flushCoordinatedSync,
  recoverCoordinatedSync,
  requestCoordinatedPull,
  requestCoordinatedSync,
  setCoordinatedSyncLibraryOnline,
  type ScheduledSync,
  type SchedulerTransition,
  type SyncExecution,
  type SyncFailureKind,
} from "@/src/services/core/sync"
import type { DataSource, Library } from "../types"
import { cancelLibrarySyncTask } from "./core-sync"
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
  | "safety_sweep"

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
      | "safety_sweep",
  ): Promise<boolean>
  setLibraryOnline(libraryId: string, online: boolean): void
  startSafetySweep(getActiveLibraryId: () => string | null): () => void
  dispose(): void
}

const PULL_FRESHNESS_MS = 30_000
const SAFETY_SWEEP_MS = 60_000
let coordinatorSequence = 0

function sidecarRootPath(library: Library): string {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}

function failureKind(error: unknown): SyncFailureKind {
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
  let disposed = false
  let nextTaskSequence = 0
  coordinatorSequence += 1
  const coordinatorId = `mobile:${Date.now()}:${coordinatorSequence}`
  createSyncCoordinator(coordinatorId)

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
        const transition = applyTransition(
          beginCoordinatedSync({
            coordinatorId,
            libraryId: sync.libraryId,
            generation: sync.generation,
          }),
        )
        if (transition.execution) void execute(transition.execution)
      },
      Math.max(0, sync.deadline - Date.now()),
    )
    timers.set(sync.libraryId, timer)
  }

  function applyTransition(
    transition: SchedulerTransition,
  ): SchedulerTransition {
    for (const libraryId of transition.cancelTimersFor) {
      clearTimer(libraryId)
    }
    for (const scheduled of transition.schedules) schedule(scheduled)
    return transition
  }

  async function execute(execution: SyncExecution): Promise<void> {
    const state = getState()
    if (!state.enableAutoSync) {
      applyTransition(
        completeCoordinatedSync({
          coordinatorId,
          libraryId: execution.libraryId,
          nowMs: Date.now(),
        }),
      )
      return
    }
    const library = findLibrary(execution.libraryId)
    if (!library) {
      applyTransition(
        completeCoordinatedSync({
          coordinatorId,
          libraryId: execution.libraryId,
          nowMs: Date.now(),
        }),
      )
      return
    }
    nextTaskSequence += 1
    const taskId = `${execution.libraryId}:${Date.now()}:${nextTaskSequence}`
    runningTasks.set(execution.libraryId, taskId)
    try {
      const effectiveExecution = await effectiveCoordinatedSyncExecution({
        coordinatorId,
        sidecarRootPath: sidecarRootPath(library),
        execution,
        nowMs: Date.now(),
        freshnessMs: PULL_FRESHNESS_MS,
      })
      if (effectiveExecution) {
        const report = await syncLibrary(library, state.dataSources, {
          scope: "myreader",
          myreaderMode: effectiveExecution.mode,
          myreaderTaskId: taskId,
          throwOnFailure: true,
        })
        await applySyncReport(report, { trigger: "scheduled" })
      }
      applyTransition(
        completeCoordinatedSync({
          coordinatorId,
          libraryId: execution.libraryId,
          nowMs: Date.now(),
        }),
      )
    } catch (error) {
      if (cancelledTasks.has(taskId)) return
      console.warn("[reading-sync] automatic:failed", {
        libraryId: execution.libraryId,
        mode: execution.mode,
        reasons: execution.reasons,
        error: error instanceof Error ? error.message : String(error),
      })
      onError?.(error)
      applyTransition(
        await failCoordinatedSync({
          coordinatorId,
          sidecarRootPath: sidecarRootPath(library),
          execution,
          failureKind: failureKind(error),
          reason: suspendedReason(error),
          nowMs: Date.now(),
          randomFraction: Math.random(),
        }),
      )
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
      applyTransition(
        requestCoordinatedSync({
          coordinatorId,
          libraryId,
          mode,
          reason,
          timing,
          nowMs: Date.now(),
        }),
      )
    },
    flush(libraryId, reason) {
      if (disposed) return
      applyTransition(
        flushCoordinatedSync({
          coordinatorId,
          libraryId,
          reason,
          nowMs: Date.now(),
        }),
      )
    },
    async recover() {
      for (const library of getState().libraries) {
        applyTransition(
          await recoverCoordinatedSync({
            coordinatorId,
            sidecarRootPath: sidecarRootPath(library),
            libraryId: library.id,
            nowMs: Date.now(),
          }),
        )
      }
    },
    async requestContextualPull(libraryId, reason) {
      const library = findLibrary(libraryId)
      if (!library) return false
      const transition = applyTransition(
        await requestCoordinatedPull({
          coordinatorId,
          sidecarRootPath: sidecarRootPath(library),
          libraryId,
          reason,
          nowMs: Date.now(),
          freshnessMs: PULL_FRESHNESS_MS,
        }),
      )
      return transition.schedules.length > 0
    },
    setLibraryOnline(libraryId, online) {
      if (disposed) return
      applyTransition(
        setCoordinatedSyncLibraryOnline({
          coordinatorId,
          libraryId,
          online,
          nowMs: Date.now(),
        }),
      )
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
                await runtime.requestContextualPull(libraryId, "safety_sweep")
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
      applyTransition(disposeSyncCoordinator(coordinatorId))
      disposed = true
      for (const taskId of runningTasks.values()) {
        cancelledTasks.add(taskId)
        cancelLibrarySyncTask(taskId)
      }
      runningTasks.clear()
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }

  return runtime
}
