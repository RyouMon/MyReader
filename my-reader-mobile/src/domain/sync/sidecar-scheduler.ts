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

type PendingWork = {
  mode: MyReaderSyncMode
  reasons: Set<SidecarSyncReason>
  timer: ReturnType<typeof setTimeout> | null
  firstRequestedAt: number
}

const DEFAULT_DEBOUNCE_MS = 2_000
const DEFAULT_MAX_WAIT_MS = 10_000
const DEFAULT_RETRY_BASE_MS = 2_000
const DEFAULT_RETRY_MAX_MS = 5 * 60_000

function mergeMode(
  current: MyReaderSyncMode,
  incoming: MyReaderSyncMode,
): MyReaderSyncMode {
  return current === "full" || incoming === "full" ? "full" : "push_only"
}

export function createSidecarSyncScheduler(options: {
  execute(execution: SidecarSyncExecution): Promise<void>
  classifyError?(error: unknown): SidecarSyncErrorDisposition
  onError?(error: unknown, execution: SidecarSyncExecution): void
  onCompleted?(
    execution: SidecarSyncExecution,
    completedAt: number,
  ): Promise<void> | void
  onRetryScheduled?(
    error: unknown,
    execution: SidecarSyncExecution,
    retry: { retryCount: number; nextRetryAt: number },
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
  const pendingByLibrary = new Map<string, PendingWork>()
  const runningLibraries = new Set<string>()
  const retryCounts = new Map<string, number>()
  const suspendedLibraries = new Set<string>()
  const offlineLibraries = new Set<string>()
  let online = true
  let disposed = false
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS
  const retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS
  const random = options.random ?? Math.random

  function mergeExecution(
    execution: SidecarSyncExecution,
    existing?: PendingWork,
  ): PendingWork {
    const pending = existing ?? {
      mode: execution.mode,
      reasons: new Set<SidecarSyncReason>(),
      timer: null,
      firstRequestedAt: Date.now(),
    }
    pending.mode = mergeMode(pending.mode, execution.mode)
    for (const reason of execution.reasons) pending.reasons.add(reason)
    return pending
  }

  async function execute(libraryId: string): Promise<void> {
    if (
      disposed ||
      !online ||
      offlineLibraries.has(libraryId) ||
      suspendedLibraries.has(libraryId) ||
      runningLibraries.has(libraryId)
    ) {
      return
    }
    const pending = pendingByLibrary.get(libraryId)
    if (!pending) return
    pendingByLibrary.delete(libraryId)
    runningLibraries.add(libraryId)
    const execution: SidecarSyncExecution = {
      libraryId,
      mode: pending.mode,
      reasons: [...pending.reasons].sort(),
    }
    try {
      await options.execute(execution)
      await options.onCompleted?.(execution, Date.now())
      retryCounts.delete(libraryId)
    } catch (error) {
      options.onError?.(error, execution)
      const retry = mergeExecution(execution, pendingByLibrary.get(libraryId))
      pendingByLibrary.set(libraryId, retry)
      if ((options.classifyError?.(error) ?? "retry") === "retry") {
        const retryCount = (retryCounts.get(libraryId) ?? 0) + 1
        retryCounts.set(libraryId, retryCount)
        const ceiling = Math.min(
          retryMaxMs,
          retryBaseMs * 2 ** (retryCount - 1),
        )
        const delay = Math.floor(random() * ceiling)
        await options.onRetryScheduled?.(error, execution, {
          retryCount,
          nextRetryAt: Date.now() + delay,
        })
        retry.timer = setTimeout(() => {
          retry.timer = null
          void execute(libraryId)
        }, delay)
      } else {
        await options.onSuspended?.(error, execution)
        suspendedLibraries.add(libraryId)
      }
    } finally {
      runningLibraries.delete(libraryId)
      const rerun = pendingByLibrary.get(libraryId)
      if (
        !disposed &&
        online &&
        !offlineLibraries.has(libraryId) &&
        !suspendedLibraries.has(libraryId) &&
        rerun &&
        !rerun.timer
      ) {
        rerun.timer = setTimeout(() => {
          void execute(libraryId)
        }, 0)
      }
    }
  }

  return {
    request(request) {
      const existing = pendingByLibrary.get(request.libraryId)
      const pending: PendingWork = existing ?? {
        mode: request.mode,
        reasons: new Set(),
        timer: null,
        firstRequestedAt: Date.now(),
      }
      pending.mode = mergeMode(pending.mode, request.mode)
      pending.reasons.add(request.reason)
      pendingByLibrary.set(request.libraryId, pending)
      if (
        disposed ||
        !online ||
        offlineLibraries.has(request.libraryId) ||
        suspendedLibraries.has(request.libraryId) ||
        runningLibraries.has(request.libraryId)
      ) {
        return
      }
      if (pending.timer) clearTimeout(pending.timer)
      const delay =
        request.timing === "immediate"
          ? 0
          : Math.min(
              debounceMs,
              Math.max(0, pending.firstRequestedAt + maxWaitMs - Date.now()),
            )
      pending.timer = setTimeout(() => {
        pending.timer = null
        void execute(request.libraryId)
      }, delay)
    },
    flushPending(libraryId, reason) {
      const pending = pendingByLibrary.get(libraryId)
      if (!pending) return
      pending.reasons.add(reason)
      if (
        disposed ||
        !online ||
        offlineLibraries.has(libraryId) ||
        suspendedLibraries.has(libraryId) ||
        runningLibraries.has(libraryId)
      ) {
        return
      }
      if (pending.timer) clearTimeout(pending.timer)
      pending.timer = setTimeout(() => {
        pending.timer = null
        void execute(libraryId)
      }, 0)
    },
    resume(libraryId) {
      suspendedLibraries.delete(libraryId)
      retryCounts.delete(libraryId)
      const pending = pendingByLibrary.get(libraryId)
      if (
        !disposed &&
        online &&
        !offlineLibraries.has(libraryId) &&
        pending &&
        !pending.timer
      ) {
        pending.timer = setTimeout(() => {
          pending.timer = null
          void execute(libraryId)
        }, 0)
      }
    },
    setOnline(nextOnline) {
      if (online === nextOnline) return
      online = nextOnline
      for (const [libraryId, pending] of pendingByLibrary) {
        if (pending.timer) {
          clearTimeout(pending.timer)
          pending.timer = null
        }
        if (
          online &&
          !offlineLibraries.has(libraryId) &&
          !suspendedLibraries.has(libraryId)
        ) {
          pending.timer = setTimeout(() => {
            pending.timer = null
            void execute(libraryId)
          }, 0)
        }
      }
    },
    setLibraryOnline(libraryId, nextOnline) {
      const pending = pendingByLibrary.get(libraryId)
      if (!nextOnline) {
        offlineLibraries.add(libraryId)
        if (pending?.timer) {
          clearTimeout(pending.timer)
          pending.timer = null
        }
        return
      }
      offlineLibraries.delete(libraryId)
      if (
        !disposed &&
        online &&
        pending &&
        !pending.timer &&
        !suspendedLibraries.has(libraryId)
      ) {
        pending.timer = setTimeout(() => {
          pending.timer = null
          void execute(libraryId)
        }, 0)
      }
    },
    dispose() {
      disposed = true
      for (const pending of pendingByLibrary.values()) {
        if (pending.timer) clearTimeout(pending.timer)
      }
      pendingByLibrary.clear()
      suspendedLibraries.clear()
      offlineLibraries.clear()
      retryCounts.clear()
    },
  }
}
