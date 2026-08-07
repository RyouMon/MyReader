import {
  deriveSyncIndicatorState,
  TRANSIENT_SYNC_STATUS_MS,
} from "@my-reader/tools/sync-status"
import {
  isRemoteLibrarySourceType,
  type Library,
} from "@my-reader/tools/types/library"
import { useEffect, useReducer } from "react"
import { useSyncStatusStore } from "@/stores/syncStatusStore"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

function nextRelativeTimeDeadline(
  completedAt: number | undefined,
  now: number,
) {
  if (completedAt == null) return null
  const elapsed = Math.max(0, now - completedAt)
  const interval = elapsed < HOUR_MS ? MINUTE_MS : HOUR_MS
  return completedAt + (Math.floor(elapsed / interval) + 1) * interval
}

export function useSyncStatusPresentation(library: Library | null) {
  const libraryId = library?.id ?? null
  const activity = useSyncStatusStore((state) =>
    libraryId ? state.librarySyncActivityById[libraryId] : undefined,
  )
  const history = useSyncStatusStore((state) =>
    libraryId ? state.librarySyncHistoryById[libraryId] : undefined,
  )
  const storedTransientResult = useSyncStatusStore((state) =>
    libraryId ? state.librarySyncTransientResultById[libraryId] : undefined,
  )
  const networkOnline = useSyncStatusStore((state) => state.networkOnline)
  const [clockNow, refreshClock] = useReducer(
    (_current: number, next: number) => next,
    Date.now(),
  )

  const lastSyncCompletedAt = history?.lastSync?.completedAt
  const unchangedCompletedAt = storedTransientResult?.completedAt

  useEffect(() => {
    const now = Math.max(Date.now(), clockNow)
    const deadlines = [
      lastSyncCompletedAt != null
        ? lastSyncCompletedAt + TRANSIENT_SYNC_STATUS_MS
        : null,
      unchangedCompletedAt != null
        ? unchangedCompletedAt + TRANSIENT_SYNC_STATUS_MS
        : null,
      nextRelativeTimeDeadline(lastSyncCompletedAt, now),
    ].filter(
      (deadline): deadline is number => deadline != null && deadline > now,
    )
    if (deadlines.length === 0) return
    const timer = setTimeout(
      () => refreshClock(Date.now()),
      Math.min(...deadlines) - now + 10,
    )
    return () => clearTimeout(timer)
  }, [clockNow, lastSyncCompletedAt, unchangedCompletedAt])

  const isOffline = Boolean(
    library && isRemoteLibrarySourceType(library.sourceType) && !networkOnline,
  )
  const projectionNow = Math.max(
    clockNow,
    history?.lastSync?.completedAt ?? 0,
    history?.lastFailure?.completedAt ?? 0,
    unchangedCompletedAt ?? 0,
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
      unchangedCompletedAt,
      isOffline,
    },
    projectionNow,
  )

  return {
    activity,
    history,
    indicator,
    isOffline,
    transientResult:
      indicator === "unchanged" ? storedTransientResult : undefined,
  }
}
