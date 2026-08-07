import {
  deriveSyncIndicatorState,
  TRANSIENT_SYNC_STATUS_MS,
} from "@my-reader/tools/sync-status"
import { useEffect, useReducer } from "react"

import { isRemoteSourceType } from "@/src/domain/types"
import { useAppStore } from "@/src/store/app-store"

export function useSyncStatusPresentation() {
  const activeLibraryId = useAppStore((state) => state.activeLibraryId)
  const libraries = useAppStore((state) => state.libraries)
  const activityById = useAppStore((state) => state.librarySyncActivityById)
  const historyById = useAppStore((state) => state.librarySyncHistoryById)
  const transientResultById = useAppStore(
    (state) => state.librarySyncTransientResultById,
  )
  const onlineById = useAppStore((state) => state.librarySyncOnlineById)
  const [clockNow, refreshClock] = useReducer(
    (_current: number, next: number) => next,
    // Capture the clock as state so the compiled projection has an explicit dependency.
    // eslint-disable-next-line react-hooks/purity
    Date.now(),
  )

  const library =
    libraries.find((candidate) => candidate.id === activeLibraryId) ?? null
  const activity = activeLibraryId ? activityById[activeLibraryId] : undefined
  const history = activeLibraryId ? historyById[activeLibraryId] : undefined
  const storedTransientResult = activeLibraryId
    ? transientResultById[activeLibraryId]
    : undefined
  const isOffline = Boolean(
    library &&
      isRemoteSourceType(library.sourceType) &&
      onlineById[library.id] === false,
  )

  useEffect(() => {
    const now = Date.now()
    const deadlines = [
      history?.lastSync
        ? history.lastSync.completedAt + TRANSIENT_SYNC_STATUS_MS
        : null,
      storedTransientResult
        ? storedTransientResult.completedAt + TRANSIENT_SYNC_STATUS_MS
        : null,
    ].filter(
      (deadline): deadline is number => deadline != null && deadline > now,
    )
    if (deadlines.length === 0) return
    const remaining = Math.min(...deadlines) - now
    const timer = setTimeout(() => refreshClock(Date.now()), remaining + 10)
    return () => clearTimeout(timer)
  }, [clockNow, history, storedTransientResult])

  const projectionNow = Math.max(
    clockNow,
    history?.lastSync?.completedAt ?? 0,
    history?.lastFailure?.completedAt ?? 0,
    storedTransientResult?.completedAt ?? 0,
  )

  const indicator = deriveSyncIndicatorState(
    {
      isRunning: activity != null,
      stage: activity?.stage,
      lastResult: history?.lastFailure
        ? "failure"
        : history?.lastSync
          ? "success"
          : undefined,
      lastCompletedAt:
        history?.lastFailure?.completedAt ?? history?.lastSync?.completedAt,
      unchangedCompletedAt: storedTransientResult?.completedAt,
      isOffline,
    },
    projectionNow,
  )
  const transientResult =
    indicator === "unchanged" ? storedTransientResult : undefined

  return {
    activeLibraryId,
    activity,
    history,
    indicator,
    isOffline,
    library,
    transientResult,
  }
}
