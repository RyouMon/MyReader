import MyReaderRustComponents from "@/modules/myreader-rust-components"

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

export type SidecarSyncExecution = {
  libraryId: string
  mode: MyReaderSyncMode
  reasons: SidecarSyncReason[]
}

export type SidecarSyncRequest = {
  libraryId: string
  mode: MyReaderSyncMode
  reason: SidecarSyncReason
  timing: "debounced" | "immediate"
}

export type SidecarSyncScheduler = {
  request(request: SidecarSyncRequest): void
  flushPending(libraryId: string, reason: SidecarSyncReason): void
  resume(libraryId: string): void
  setOnline(online: boolean): void
  setLibraryOnline(libraryId: string, online: boolean): void
  dispose(): void
}

export type SidecarSyncErrorDisposition = "retry" | "suspend"

type ScheduledSync = {
  libraryId: string
  generation: number
  deadline: number
}

type SchedulerRetry = {
  retryCount: number
  nextRetryAt: number
}

type SchedulerTransition = {
  schedules: ScheduledSync[]
  cancelTimersFor: string[]
  execution: SidecarSyncExecution | null
  retry: SchedulerRetry | null
}

type SchedulerEnvelope = {
  state: unknown
  transition: SchedulerTransition
}

const DEFAULT_DEBOUNCE_MS = 2_000
const DEFAULT_MAX_WAIT_MS = 10_000
const DEFAULT_RETRY_BASE_MS = 2_000
const DEFAULT_RETRY_MAX_MS = 5 * 60_000

export function createSidecarSyncScheduler(options: {
  execute(execution: SidecarSyncExecution, taskId: string): Promise<void>
  cancelTask?(taskId: string): void
  classifyError?(error: unknown): SidecarSyncErrorDisposition
  onError?(error: unknown, execution: SidecarSyncExecution): void
  onCompleted?(
    execution: SidecarSyncExecution,
    completedAt: number,
  ): Promise<void> | void
  onRetryScheduled?(
    error: unknown,
    execution: SidecarSyncExecution,
    retry: SchedulerRetry,
  ): Promise<void> | void
  onSuspended?(
    error: unknown,
    execution: SidecarSyncExecution,
  ): Promise<void> | void
  debounceMs?: number
  maxWaitMs?: number
  retryBaseMs?: number
  retryMaxMs?: number
  random?: () => number
}): SidecarSyncScheduler {
  const policyJson = JSON.stringify({
    debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    maxWaitMs: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
    retryBaseMs: options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
    retryMaxMs: options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS,
  })
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const runningTasks = new Map<string, string>()
  const cancelledTasks = new Set<string>()
  const random = options.random ?? Math.random
  let stateJson: string | null = null
  let disposed = false
  let nextTaskSequence = 0

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
        if (transition.execution) {
          void execute(transition.execution)
        }
      },
      Math.max(0, sync.deadline - Date.now()),
    )
    timers.set(sync.libraryId, timer)
  }

  function advance(event: object): SchedulerTransition {
    const envelope = JSON.parse(
      MyReaderRustComponents.advanceSyncScheduler(
        stateJson,
        policyJson,
        JSON.stringify(event),
      ),
    ) as SchedulerEnvelope
    stateJson = JSON.stringify(envelope.state)
    for (const libraryId of envelope.transition.cancelTimersFor) {
      clearTimer(libraryId)
    }
    for (const scheduled of envelope.transition.schedules) {
      schedule(scheduled)
    }
    return envelope.transition
  }

  async function execute(execution: SidecarSyncExecution): Promise<void> {
    nextTaskSequence += 1
    const taskId = `${execution.libraryId}:${Date.now()}:${nextTaskSequence}`
    runningTasks.set(execution.libraryId, taskId)
    try {
      await options.execute(execution, taskId)
      const completedAt = Date.now()
      await options.onCompleted?.(execution, completedAt)
      advance({
        type: "complete",
        libraryId: execution.libraryId,
        nowMs: completedAt,
      })
    } catch (error) {
      if (cancelledTasks.has(taskId)) return
      options.onError?.(error, execution)
      if ((options.classifyError?.(error) ?? "retry") === "retry") {
        const transition = advance({
          type: "retry",
          execution,
          nowMs: Date.now(),
          randomFraction: random(),
        })
        if (transition.retry) {
          await options.onRetryScheduled?.(error, execution, transition.retry)
        }
      } else {
        advance({ type: "suspend", execution })
        await options.onSuspended?.(error, execution)
      }
    } finally {
      if (runningTasks.get(execution.libraryId) === taskId) {
        runningTasks.delete(execution.libraryId)
      }
      cancelledTasks.delete(taskId)
    }
  }

  return {
    request(request) {
      if (disposed) return
      advance({
        type: "request",
        ...request,
        nowMs: Date.now(),
      })
    },
    flushPending(libraryId, reason) {
      if (disposed) return
      advance({
        type: "flush",
        libraryId,
        reason,
        nowMs: Date.now(),
      })
    },
    resume(libraryId) {
      if (disposed) return
      advance({
        type: "resume",
        libraryId,
        nowMs: Date.now(),
      })
    },
    setOnline(online) {
      if (disposed) return
      advance({
        type: "set_online",
        online,
        nowMs: Date.now(),
      })
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
    dispose() {
      if (disposed) return
      advance({ type: "dispose" })
      disposed = true
      for (const taskId of runningTasks.values()) {
        cancelledTasks.add(taskId)
        options.cancelTask?.(taskId)
      }
      runningTasks.clear()
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}
