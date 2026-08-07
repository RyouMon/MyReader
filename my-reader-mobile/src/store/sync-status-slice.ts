import {
  parseSyncReason,
  parseSyncStage,
  type SyncReason,
  type SyncStage,
} from "@my-reader/tools/sync-status"

import type { SyncFailureKind } from "@/src/domain/sync/types"

import type { AppStateSlice } from "./app-store.types"

export type LibrarySyncActivity = {
  taskId: string
  stage: SyncStage
  completed: number
  total: number
  startedAt: number
  reason: SyncReason
}

export type LibraryLastSync = {
  completedAt: number
  reason?: SyncReason
}

export type LibrarySyncFailure = {
  completedAt: number
  failureKind?: SyncFailureKind
  failureStage?: SyncStage
  message?: string
  reason?: SyncReason
}

export type LibrarySyncHistory = {
  lastSync?: LibraryLastSync
  lastFailure?: LibrarySyncFailure
}

export type LibrarySyncTransientResult = {
  result: "unchanged"
  completedAt: number
  reason: SyncReason
}

export type SyncStatusSlice = {
  librarySyncActivityById: Record<string, LibrarySyncActivity>
  librarySyncHistoryById: Record<string, LibrarySyncHistory>
  librarySyncTransientResultById: Record<string, LibrarySyncTransientResult>
  librarySyncOnlineById: Record<string, boolean>
  startLibrarySync: (input: {
    libraryId: string
    taskId: string
    startedAt: number
    reason: SyncReason
  }) => void
  updateLibrarySyncProgress: (input: {
    libraryId: string
    taskId: string
    stage: SyncStage
    completed: number
    total: number
  }) => void
  succeedLibrarySync: (input: {
    libraryId: string
    taskId: string
    completedAt: number
    reason: SyncReason
  }) => void
  finishLibrarySyncUnchanged: (input: {
    libraryId: string
    taskId: string
    completedAt: number
    reason: SyncReason
  }) => void
  failLibrarySync: (input: {
    libraryId: string
    taskId: string
    completedAt: number
    failureKind?: SyncFailureKind
    message: string
    reason: SyncReason
  }) => void
  cancelLibrarySync: (input: { libraryId: string; taskId: string }) => void
  setLibrarySyncOnline: (libraryId: string, online: boolean) => void
  removeLibrarySyncStatus: (libraryId: string) => void
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...rest } = record
  return rest
}

function nextSuccessfulHistory(
  current: LibrarySyncHistory | undefined,
  candidate: LibraryLastSync,
): LibrarySyncHistory {
  const lastSync =
    current?.lastSync && current.lastSync.completedAt > candidate.completedAt
      ? current.lastSync
      : candidate
  const lastFailure =
    current?.lastFailure &&
    current.lastFailure.completedAt > lastSync.completedAt
      ? current.lastFailure
      : undefined
  return { lastSync, ...(lastFailure ? { lastFailure } : {}) }
}

function nextFailedHistory(
  current: LibrarySyncHistory | undefined,
  candidate: LibrarySyncFailure,
): LibrarySyncHistory {
  if (
    (current?.lastSync?.completedAt ?? Number.NEGATIVE_INFINITY) >
      candidate.completedAt ||
    (current?.lastFailure?.completedAt ?? Number.NEGATIVE_INFINITY) >
      candidate.completedAt
  ) {
    return current ?? {}
  }
  return { ...current, lastFailure: candidate }
}

function clearResolvedFailure(
  current: LibrarySyncHistory | undefined,
  completedAt: number,
): LibrarySyncHistory | undefined {
  if (!current?.lastFailure || current.lastFailure.completedAt > completedAt) {
    return current
  }
  return current.lastSync ? { lastSync: current.lastSync } : undefined
}

function withLibraryHistory(
  records: Record<string, LibrarySyncHistory>,
  libraryId: string,
  history: LibrarySyncHistory | undefined,
) {
  return history
    ? { ...records, [libraryId]: history }
    : withoutKey(records, libraryId)
}

function coerceFailureKind(value: unknown): SyncFailureKind | undefined {
  switch (value) {
    case "connectivity":
    case "configuration":
    case "credential":
    case "data_integrity":
    case "unexpected":
      return value
    default:
      return undefined
  }
}

function coerceCompletedAt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function coerceReason(value: unknown): SyncReason | undefined {
  return typeof value === "string"
    ? (parseSyncReason(value) ?? undefined)
    : undefined
}

function coerceLastSync(value: unknown): LibraryLastSync | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const candidate = value as Partial<LibraryLastSync>
  const completedAt = coerceCompletedAt(candidate.completedAt)
  if (completedAt == null) return undefined
  const reason = coerceReason(candidate.reason)
  return { completedAt, ...(reason ? { reason } : {}) }
}

function coerceLastFailure(value: unknown): LibrarySyncFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const candidate = value as Partial<LibrarySyncFailure>
  const completedAt = coerceCompletedAt(candidate.completedAt)
  if (completedAt == null) return undefined
  const failureStage =
    typeof candidate.failureStage === "string"
      ? parseSyncStage(candidate.failureStage)
      : null
  const failureKind = coerceFailureKind(candidate.failureKind)
  const reason = coerceReason(candidate.reason)
  return {
    completedAt,
    ...(failureKind ? { failureKind } : {}),
    ...(failureStage ? { failureStage } : {}),
    ...(typeof candidate.message === "string"
      ? { message: candidate.message }
      : {}),
    ...(reason ? { reason } : {}),
  }
}

export function coerceLibrarySyncHistory(
  value: unknown,
): Record<string, LibrarySyncHistory> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const result: Record<string, LibrarySyncHistory> = {}
  for (const [libraryId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const candidate = entry as Partial<LibrarySyncHistory> & {
      result?: unknown
      completedAt?: unknown
      reason?: unknown
    }
    const lastSync = coerceLastSync(candidate.lastSync)
    const lastFailure = coerceLastFailure(candidate.lastFailure)
    if (lastSync || lastFailure) {
      result[libraryId] = {
        ...(lastSync ? { lastSync } : {}),
        ...(lastFailure ? { lastFailure } : {}),
      }
      continue
    }

    const legacyCompletedAt = coerceCompletedAt(candidate.completedAt)
    if (legacyCompletedAt == null) continue
    if (candidate.result === "success") {
      const reason = coerceReason(candidate.reason)
      result[libraryId] = {
        lastSync: {
          completedAt: legacyCompletedAt,
          ...(reason ? { reason } : {}),
        },
      }
    } else if (candidate.result === "failure") {
      result[libraryId] = {
        lastFailure: coerceLastFailure(candidate) ?? {
          completedAt: legacyCompletedAt,
        },
      }
    }
  }
  return result
}

export const createSyncStatusSlice: AppStateSlice<SyncStatusSlice> = (set) => ({
  librarySyncActivityById: {},
  librarySyncHistoryById: {},
  librarySyncTransientResultById: {},
  librarySyncOnlineById: {},

  startLibrarySync({ libraryId, taskId, startedAt, reason }) {
    set((state) => ({
      librarySyncActivityById: {
        ...state.librarySyncActivityById,
        [libraryId]: {
          taskId,
          stage: "preparing",
          completed: 0,
          total: 0,
          startedAt,
          reason,
        },
      },
      librarySyncTransientResultById: withoutKey(
        state.librarySyncTransientResultById,
        libraryId,
      ),
    }))
  },

  updateLibrarySyncProgress({ libraryId, taskId, stage, completed, total }) {
    set((state) => {
      const current = state.librarySyncActivityById[libraryId]
      if (!current || current.taskId !== taskId) return state
      return {
        librarySyncActivityById: {
          ...state.librarySyncActivityById,
          [libraryId]: { ...current, stage, completed, total },
        },
      }
    })
  },

  succeedLibrarySync({ libraryId, taskId, completedAt, reason }) {
    set((state) => {
      const current = state.librarySyncActivityById[libraryId]
      const activityById =
        current?.taskId === taskId
          ? withoutKey(state.librarySyncActivityById, libraryId)
          : state.librarySyncActivityById
      return {
        librarySyncActivityById: activityById,
        librarySyncTransientResultById:
          current?.taskId === taskId
            ? withoutKey(state.librarySyncTransientResultById, libraryId)
            : state.librarySyncTransientResultById,
        librarySyncHistoryById: withLibraryHistory(
          state.librarySyncHistoryById,
          libraryId,
          nextSuccessfulHistory(state.librarySyncHistoryById[libraryId], {
            completedAt,
            reason,
          }),
        ),
      }
    })
  },

  finishLibrarySyncUnchanged({ libraryId, taskId, completedAt, reason }) {
    set((state) => {
      const current = state.librarySyncActivityById[libraryId]
      if (current?.taskId !== taskId) return state
      const currentHistory = state.librarySyncHistoryById[libraryId]
      const nextHistory = clearResolvedFailure(currentHistory, completedAt)
      return {
        librarySyncActivityById: withoutKey(
          state.librarySyncActivityById,
          libraryId,
        ),
        librarySyncTransientResultById: {
          ...state.librarySyncTransientResultById,
          [libraryId]: { result: "unchanged", completedAt, reason },
        },
        librarySyncHistoryById:
          nextHistory === currentHistory
            ? state.librarySyncHistoryById
            : withLibraryHistory(
                state.librarySyncHistoryById,
                libraryId,
                nextHistory,
              ),
      }
    })
  },

  failLibrarySync({
    libraryId,
    taskId,
    completedAt,
    failureKind,
    message,
    reason,
  }) {
    set((state) => {
      const current = state.librarySyncActivityById[libraryId]
      const activityById =
        current?.taskId === taskId
          ? withoutKey(state.librarySyncActivityById, libraryId)
          : state.librarySyncActivityById
      return {
        librarySyncActivityById: activityById,
        librarySyncTransientResultById:
          current?.taskId === taskId
            ? withoutKey(state.librarySyncTransientResultById, libraryId)
            : state.librarySyncTransientResultById,
        librarySyncHistoryById: withLibraryHistory(
          state.librarySyncHistoryById,
          libraryId,
          nextFailedHistory(state.librarySyncHistoryById[libraryId], {
            completedAt,
            message,
            reason,
            ...(failureKind ? { failureKind } : {}),
            ...(current?.taskId === taskId
              ? { failureStage: current.stage }
              : {}),
          }),
        ),
      }
    })
  },

  cancelLibrarySync({ libraryId, taskId }) {
    set((state) => {
      const current = state.librarySyncActivityById[libraryId]
      if (current?.taskId !== taskId) return state
      return {
        librarySyncActivityById: withoutKey(
          state.librarySyncActivityById,
          libraryId,
        ),
      }
    })
  },

  setLibrarySyncOnline(libraryId, online) {
    set((state) => ({
      librarySyncOnlineById: {
        ...state.librarySyncOnlineById,
        [libraryId]: online,
      },
    }))
  },

  removeLibrarySyncStatus(libraryId) {
    set((state) => ({
      librarySyncActivityById: withoutKey(
        state.librarySyncActivityById,
        libraryId,
      ),
      librarySyncHistoryById: withoutKey(
        state.librarySyncHistoryById,
        libraryId,
      ),
      librarySyncTransientResultById: withoutKey(
        state.librarySyncTransientResultById,
        libraryId,
      ),
      librarySyncOnlineById: withoutKey(state.librarySyncOnlineById, libraryId),
    }))
  },
})
