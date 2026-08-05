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
  safetySweepDelayMs,
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
  | "content_ready"
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
    if (disposed) return
    clearTimer(sync.libraryId)
    const timer = setTimeout(
      () => {
        timers.delete(sync.libraryId)
        if (disposed) return
        const transition = applyTransition(
          beginCoordinatedSync({
            coordinatorId,
            libraryId: sync.libraryId,
            generation: sync.generation,
          }),
        )
        if (transition.execution) {
          void execute(transition.execution).catch((error) => {
            if (!disposed) onError?.(error)
          })
        }
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
    if (disposed) return transition
    for (const scheduled of transition.schedules) schedule(scheduled)
    return transition
  }

  async function execute(execution: SyncExecution): Promise<void> {
    if (disposed) return
    const state = getState()
    const required = execution.reasons.includes("content_ready")
    if (!state.enableAutoSync && !required) {
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
      })
      if (disposed || cancelledTasks.has(taskId)) return
      if (effectiveExecution) {
        const report = await syncLibrary(library, state.dataSources, {
          scope: "myreader",
          myreaderMode: effectiveExecution.mode,
          myreaderTaskId: taskId,
          throwOnFailure: true,
        })
        if (disposed || cancelledTasks.has(taskId)) return
        await applySyncReport(report, { trigger: "scheduled" })
        if (disposed || cancelledTasks.has(taskId)) return
      }
      applyTransition(
        completeCoordinatedSync({
          coordinatorId,
          libraryId: execution.libraryId,
          nowMs: Date.now(),
        }),
      )
    } catch (error) {
      if (disposed || cancelledTasks.has(taskId)) return
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
        if (disposed) return
        try {
          const transition = await recoverCoordinatedSync({
            coordinatorId,
            sidecarRootPath: sidecarRootPath(library),
            libraryId: library.id,
            nowMs: Date.now(),
          })
          if (disposed) return
          applyTransition(transition)
        } catch (error) {
          if (disposed) return
          throw error
        }
      }
    },
    async requestContextualPull(libraryId, reason) {
      if (disposed) return false
      const library = findLibrary(libraryId)
      if (!library) return false
      try {
        const transition = await requestCoordinatedPull({
          coordinatorId,
          sidecarRootPath: sidecarRootPath(library),
          libraryId,
          reason,
          nowMs: Date.now(),
        })
        if (disposed) return false
        applyTransition(transition)
        return transition.schedules.length > 0
      } catch (error) {
        if (disposed) return false
        throw error
      }
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
      if (disposed) return () => {}
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | null = null
      const scheduleNext = () => {
        if (stopped || disposed) return
        timer = setTimeout(
          async () => {
            if (stopped || disposed) return
            const libraryId = getActiveLibraryId()
            if (libraryId) {
              try {
                await runtime.requestContextualPull(libraryId, "safety_sweep")
              } catch (error) {
                onError?.(error)
              }
            }
            if (!stopped && !disposed) scheduleNext()
          },
          safetySweepDelayMs(coordinatorId, Math.random()),
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
      disposed = true
      for (const taskId of runningTasks.values()) {
        cancelledTasks.add(taskId)
        cancelLibrarySyncTask(taskId)
      }
      runningTasks.clear()
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      applyTransition(disposeSyncCoordinator(coordinatorId))
    },
  }

  return runtime
}
