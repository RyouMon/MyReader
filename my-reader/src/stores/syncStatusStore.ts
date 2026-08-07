import {
  parseSyncReason,
  parseSyncStage,
  type SyncReason,
  type SyncStage,
} from "@my-reader/tools/sync-status"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type SyncFailureKind =
  | "connectivity"
  | "configuration"
  | "credential"
  | "data_integrity"
  | "unexpected"

export type LibrarySyncActivity = {
  taskId: string
  stage: SyncStage
  completed: number
  total: number
  startedAt: number
  reason: SyncReason
}

export type LibrarySyncHistory = {
  lastSync?: {
    completedAt: number
    reason?: SyncReason
  }
  lastFailure?: {
    completedAt: number
    failureKind?: SyncFailureKind
    failureStage?: SyncStage
    message?: string
    reason?: SyncReason
  }
}

export type LibrarySyncTransientResult = {
  result: "unchanged"
  completedAt: number
  reason: SyncReason
}

export type SyncStatusObservation =
  | {
      type: "started"
      libraryId: string
      taskId: string
      startedAt: number
      reason: SyncReason
    }
  | {
      type: "progress"
      libraryId: string
      taskId: string
      stage: SyncStage
      completed: number
      total: number
    }
  | {
      type: "succeeded" | "unchanged"
      libraryId: string
      taskId: string
      completedAt: number
      reason: SyncReason
    }
  | {
      type: "failed"
      libraryId: string
      taskId: string
      completedAt: number
      failureKind: SyncFailureKind
      failureStage?: SyncStage | null
      message: string
      reason: SyncReason
    }

type SyncStatusStore = {
  librarySyncActivityById: Record<string, LibrarySyncActivity>
  librarySyncHistoryById: Record<string, LibrarySyncHistory>
  librarySyncTransientResultById: Record<string, LibrarySyncTransientResult>
  networkOnline: boolean
  observeLibrarySync: (observation: SyncStatusObservation) => void
  setNetworkOnline: (online: boolean) => void
}

type PersistedSyncStatusState = Pick<SyncStatusStore, "librarySyncHistoryById">

function withoutKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...rest } = record
  return rest
}

function withHistory(
  records: Record<string, LibrarySyncHistory>,
  libraryId: string,
  history: LibrarySyncHistory | undefined,
) {
  return history
    ? { ...records, [libraryId]: history }
    : withoutKey(records, libraryId)
}

function nextSuccessfulHistory(
  current: LibrarySyncHistory | undefined,
  completedAt: number,
  reason: SyncReason,
): LibrarySyncHistory {
  const candidate = { completedAt, reason }
  const lastSync =
    current?.lastSync && current.lastSync.completedAt > completedAt
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
  candidate: NonNullable<LibrarySyncHistory["lastFailure"]>,
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

function finiteTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
}

function failureKind(value: unknown): SyncFailureKind | undefined {
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

function coerceHistoryById(value: unknown): Record<string, LibrarySyncHistory> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const result: Record<string, LibrarySyncHistory> = {}
  for (const [libraryId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const candidate = entry as Record<string, unknown>
    const rawLastSync = candidate.lastSync
    const rawLastFailure = candidate.lastFailure
    let lastSync: LibrarySyncHistory["lastSync"]
    let lastFailure: LibrarySyncHistory["lastFailure"]

    if (
      rawLastSync &&
      typeof rawLastSync === "object" &&
      !Array.isArray(rawLastSync)
    ) {
      const raw = rawLastSync as Record<string, unknown>
      const completedAt = finiteTimestamp(raw.completedAt)
      const reason =
        typeof raw.reason === "string" ? parseSyncReason(raw.reason) : null
      if (completedAt != null) {
        lastSync = {
          completedAt,
          ...(reason ? { reason } : {}),
        }
      }
    }

    if (
      rawLastFailure &&
      typeof rawLastFailure === "object" &&
      !Array.isArray(rawLastFailure)
    ) {
      const raw = rawLastFailure as Record<string, unknown>
      const completedAt = finiteTimestamp(raw.completedAt)
      const reason =
        typeof raw.reason === "string" ? parseSyncReason(raw.reason) : null
      const stage =
        typeof raw.failureStage === "string"
          ? parseSyncStage(raw.failureStage)
          : null
      const kind = failureKind(raw.failureKind)
      if (completedAt != null) {
        lastFailure = {
          completedAt,
          ...(kind ? { failureKind: kind } : {}),
          ...(stage ? { failureStage: stage } : {}),
          ...(typeof raw.message === "string" ? { message: raw.message } : {}),
          ...(reason ? { reason } : {}),
        }
      }
    }

    if (
      lastSync &&
      lastFailure &&
      lastFailure.completedAt <= lastSync.completedAt
    ) {
      lastFailure = undefined
    }
    if (lastSync || lastFailure) {
      result[libraryId] = {
        ...(lastSync ? { lastSync } : {}),
        ...(lastFailure ? { lastFailure } : {}),
      }
    }
  }
  return result
}

const initialNetworkOnline =
  typeof navigator === "undefined" ? true : navigator.onLine

export const useSyncStatusStore = create<SyncStatusStore>()(
  persist<SyncStatusStore, [], [], PersistedSyncStatusState>(
    (set) => ({
      librarySyncActivityById: {},
      librarySyncHistoryById: {},
      librarySyncTransientResultById: {},
      networkOnline: initialNetworkOnline,

      observeLibrarySync(observation) {
        set((state) => {
          const libraryId = observation.libraryId
          switch (observation.type) {
            case "started":
              return {
                librarySyncActivityById: {
                  ...state.librarySyncActivityById,
                  [libraryId]: {
                    taskId: observation.taskId,
                    stage: "preparing",
                    completed: 0,
                    total: 0,
                    startedAt: observation.startedAt,
                    reason: observation.reason,
                  },
                },
                librarySyncTransientResultById: withoutKey(
                  state.librarySyncTransientResultById,
                  libraryId,
                ),
              }
            case "progress": {
              const current = state.librarySyncActivityById[libraryId]
              if (!current || current.taskId !== observation.taskId) {
                return state
              }
              return {
                librarySyncActivityById: {
                  ...state.librarySyncActivityById,
                  [libraryId]: {
                    ...current,
                    stage: observation.stage,
                    completed: observation.completed,
                    total: observation.total,
                  },
                },
              }
            }
            case "succeeded": {
              const current = state.librarySyncActivityById[libraryId]
              const ownsActivity = current?.taskId === observation.taskId
              return {
                librarySyncActivityById: ownsActivity
                  ? withoutKey(state.librarySyncActivityById, libraryId)
                  : state.librarySyncActivityById,
                librarySyncTransientResultById: ownsActivity
                  ? withoutKey(state.librarySyncTransientResultById, libraryId)
                  : state.librarySyncTransientResultById,
                librarySyncHistoryById: withHistory(
                  state.librarySyncHistoryById,
                  libraryId,
                  nextSuccessfulHistory(
                    state.librarySyncHistoryById[libraryId],
                    observation.completedAt,
                    observation.reason,
                  ),
                ),
              }
            }
            case "unchanged": {
              const current = state.librarySyncActivityById[libraryId]
              if (current?.taskId !== observation.taskId) return state
              const currentHistory = state.librarySyncHistoryById[libraryId]
              const nextHistory = clearResolvedFailure(
                currentHistory,
                observation.completedAt,
              )
              return {
                librarySyncActivityById: withoutKey(
                  state.librarySyncActivityById,
                  libraryId,
                ),
                librarySyncTransientResultById: {
                  ...state.librarySyncTransientResultById,
                  [libraryId]: {
                    result: "unchanged",
                    completedAt: observation.completedAt,
                    reason: observation.reason,
                  },
                },
                librarySyncHistoryById:
                  nextHistory === currentHistory
                    ? state.librarySyncHistoryById
                    : withHistory(
                        state.librarySyncHistoryById,
                        libraryId,
                        nextHistory,
                      ),
              }
            }
            case "failed": {
              const current = state.librarySyncActivityById[libraryId]
              const ownsActivity = current?.taskId === observation.taskId
              const observedFailureStage = observation.failureStage ?? undefined
              return {
                librarySyncActivityById: ownsActivity
                  ? withoutKey(state.librarySyncActivityById, libraryId)
                  : state.librarySyncActivityById,
                librarySyncTransientResultById: ownsActivity
                  ? withoutKey(state.librarySyncTransientResultById, libraryId)
                  : state.librarySyncTransientResultById,
                librarySyncHistoryById: withHistory(
                  state.librarySyncHistoryById,
                  libraryId,
                  nextFailedHistory(state.librarySyncHistoryById[libraryId], {
                    completedAt: observation.completedAt,
                    failureKind: observation.failureKind,
                    failureStage:
                      observedFailureStage ??
                      (ownsActivity ? current.stage : undefined),
                    message: observation.message,
                    reason: observation.reason,
                  }),
                ),
              }
            }
          }
        })
      },

      setNetworkOnline(networkOnline) {
        set({ networkOnline })
      },
    }),
    {
      name: "myreader:desktop-sync-status",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        librarySyncHistoryById: state.librarySyncHistoryById,
      }),
      merge: (persisted, current) => ({
        ...current,
        librarySyncHistoryById: coerceHistoryById(
          (persisted as Partial<PersistedSyncStatusState> | undefined)
            ?.librarySyncHistoryById,
        ),
      }),
    },
  ),
)
