import { useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"

import type { Library } from "@/src/domain/types"
import {
  READING_HEARTBEAT_MS,
  ReadingTimeAccumulator,
  splitReadingIntervalByLocalDay,
  type TimedReadingInterval,
} from "@/src/domain/reading-statistics/reading-time-accumulator"
import { localDayKey } from "@/src/domain/reading-statistics/statistics"
import {
  addReadingSessionInterval,
  upsertEarliestReadingCompletion,
} from "@/src/repos/reading-statistics"
import { invalidateReadingStatistics } from "@/src/services/query/invalidate-table"
import { uuid } from "@/src/utils/common"

type ReadingContext = {
  library: Library
  bookId: number
  format: string
  sessionIds: Map<string, string>
}

type ReadingTrackerState = {
  ready: boolean
  currentPage: number
  totalPages: number
}

export function useReadingSessionTracker(
  library: Library | null,
  loadState: { status: string; bookId?: number; format?: string } | null,
  readerState: ReadingTrackerState | null,
  locationKey: string | number | null,
) {
  const counterRef = useRef<ReadingTimeAccumulator | null>(null)
  const contextRef = useRef<ReadingContext | null>(null)
  const writeTailRef = useRef(Promise.resolve())
  const completionAttemptRef = useRef<string | null>(null)

  const bookId = loadState?.status === "ready" ? loadState.bookId : undefined
  const format = loadState?.status === "ready" ? loadState.format : undefined
  const currentPage = readerState?.currentPage
  const totalPages = readerState?.totalPages
  const ready =
    Boolean(library) &&
    bookId != null &&
    format != null &&
    readerState?.ready === true
  const trackingKey = ready
    ? `${library!.id}:${bookId}:${format!.toUpperCase()}`
    : null

  const enqueueInterval = useCallback(
    (context: ReadingContext, interval: TimedReadingInterval | null) => {
      if (!interval) return
      const pieces = splitReadingIntervalByLocalDay(interval)
      if (pieces.length === 0) return

      writeTailRef.current = writeTailRef.current
        .catch(() => undefined)
        .then(async () => {
          for (const piece of pieces) {
            let sessionId = context.sessionIds.get(piece.localDay)
            if (!sessionId) {
              sessionId = uuid()
              context.sessionIds.set(piece.localDay, sessionId)
            }
            await addReadingSessionInterval(context.library, {
              id: sessionId,
              bookId: context.bookId,
              format: context.format,
              localDay: piece.localDay,
              startedAt: piece.startedAt,
              durationSeconds: piece.durationSeconds,
              updatedAt: Date.now(),
            })
          }
          await invalidateReadingStatistics(context.library.id)
        })
        .catch((error) => {
          console.error("[reading-statistics] save-session-error", error)
        })
    },
    [],
  )

  useEffect(() => {
    if (!ready || !library || bookId == null || format == null) {
      return
    }

    const context = {
      library,
      bookId,
      format: format.toUpperCase(),
      sessionIds: new Map(),
    }
    const counter = new ReadingTimeAccumulator()
    contextRef.current = context
    counterRef.current = counter
    if (AppState.currentState === "active") counter.resume(Date.now())

    const heartbeat = setInterval(() => {
      enqueueInterval(context, counter.pulse(Date.now()))
    }, READING_HEARTBEAT_MS)
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        counter.resume(Date.now())
      } else {
        enqueueInterval(context, counter.pause(Date.now()))
      }
    })

    return () => {
      clearInterval(heartbeat)
      subscription.remove()
      enqueueInterval(context, counter.pause(Date.now()))
      if (contextRef.current === context) contextRef.current = null
      if (counterRef.current === counter) counterRef.current = null
    }
  }, [bookId, enqueueInterval, format, library, ready, trackingKey])

  useEffect(() => {
    const context = contextRef.current
    const counter = counterRef.current
    if (!trackingKey || !context || !counter) return
    enqueueInterval(context, counter.locationChanged(Date.now()))
  }, [enqueueInterval, locationKey, trackingKey])

  useEffect(() => {
    if (
      !trackingKey ||
      !ready ||
      !library ||
      bookId == null ||
      format == null ||
      currentPage == null ||
      totalPages == null ||
      totalPages <= 0 ||
      currentPage < totalPages - 1 ||
      completionAttemptRef.current === trackingKey
    ) {
      return
    }

    completionAttemptRef.current = trackingKey
    const completedAt = Date.now()
    void upsertEarliestReadingCompletion(library, {
      id: uuid(),
      bookId,
      format,
      localDay: localDayKey(completedAt),
      completedAt,
      updatedAt: completedAt,
    })
      .then(() => invalidateReadingStatistics(library.id))
      .catch((error) => {
        completionAttemptRef.current = null
        console.error("[reading-statistics] save-completion-error", error)
      })
  }, [library, bookId, format, currentPage, totalPages, ready, trackingKey])
}
