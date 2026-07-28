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

const PULL_FRESHNESS_MS = 30_000
const SAFETY_SWEEP_MS = 60_000
let coordinatorSequence = 0

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
  let disposed = false
  let nextTaskSequence = 0
  coordinatorSequence += 1
  const coordinatorId = `mobile:${Date.now()}:${coordinatorSequence}`
  MyReaderRustComponents.createSyncCoordinator(coordinatorId)

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
          MyReaderRustComponents.beginCoordinatedSync(
            coordinatorId,
            sync.libraryId,
            sync.generation,
          ),
        )
        if (transition.execution) void execute(transition.execution)
      },
      Math.max(0, sync.deadline - Date.now()),
    )
    timers.set(sync.libraryId, timer)
  }

  function applyTransition(transitionJson: string): SchedulerTransition {
    const transition = JSON.parse(transitionJson) as SchedulerTransition
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
        MyReaderRustComponents.completeCoordinatedSync(
          coordinatorId,
          execution.libraryId,
          String(Date.now()),
        ),
      )
      return
    }
    const library = findLibrary(execution.libraryId)
    if (!library) {
      applyTransition(
        MyReaderRustComponents.completeCoordinatedSync(
          coordinatorId,
          execution.libraryId,
          String(Date.now()),
        ),
      )
      return
    }
    nextTaskSequence += 1
    const taskId = `${execution.libraryId}:${Date.now()}:${nextTaskSequence}`
    runningTasks.set(execution.libraryId, taskId)
    try {
      const effectiveExecutionJson =
        await MyReaderRustComponents.effectiveCoordinatedSyncExecution(
          coordinatorId,
          sidecarRootPath(library),
          JSON.stringify(execution),
          String(Date.now()),
          String(PULL_FRESHNESS_MS),
        )
      if (effectiveExecutionJson) {
        const effectiveExecution = JSON.parse(
          effectiveExecutionJson,
        ) as SyncExecution
        const report = await syncLibrary(library, state.dataSources, {
          scope: "myreader",
          myreaderMode: effectiveExecution.mode,
          myreaderTaskId: taskId,
          throwOnFailure: true,
        })
        await applySyncReport(report, { trigger: "scheduled" })
      }
      applyTransition(
        MyReaderRustComponents.completeCoordinatedSync(
          coordinatorId,
          execution.libraryId,
          String(Date.now()),
        ),
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
        await MyReaderRustComponents.failCoordinatedSync(
          coordinatorId,
          sidecarRootPath(library),
          JSON.stringify(execution),
          failureKind(error),
          suspendedReason(error),
          String(Date.now()),
          Math.random(),
        ),
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
        MyReaderRustComponents.requestCoordinatedSync(
          coordinatorId,
          libraryId,
          mode,
          reason,
          timing,
          String(Date.now()),
        ),
      )
    },
    flush(libraryId, reason) {
      if (disposed) return
      applyTransition(
        MyReaderRustComponents.flushCoordinatedSync(
          coordinatorId,
          libraryId,
          reason,
          String(Date.now()),
        ),
      )
    },
    async recover() {
      for (const library of getState().libraries) {
        applyTransition(
          await MyReaderRustComponents.recoverCoordinatedSync(
            coordinatorId,
            sidecarRootPath(library),
            library.id,
            String(Date.now()),
          ),
        )
      }
    },
    async requestContextualPull(libraryId, reason) {
      const library = findLibrary(libraryId)
      if (!library) return false
      const transition = applyTransition(
        await MyReaderRustComponents.requestCoordinatedPull(
          coordinatorId,
          sidecarRootPath(library),
          libraryId,
          reason,
          String(Date.now()),
          String(PULL_FRESHNESS_MS),
        ),
      )
      return transition.schedules.length > 0
    },
    setLibraryOnline(libraryId, online) {
      if (disposed) return
      applyTransition(
        MyReaderRustComponents.setCoordinatedSyncLibraryOnline(
          coordinatorId,
          libraryId,
          online,
          String(Date.now()),
        ),
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
      applyTransition(
        MyReaderRustComponents.disposeSyncCoordinator(coordinatorId),
      )
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
