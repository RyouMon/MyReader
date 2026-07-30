import {
  READING_HEARTBEAT_MS,
  ReadingSessionBatchBuilder,
  ReadingTimeAccumulator,
  type TimedReadingInterval,
} from "@my-reader/tools/reading-time-accumulator"
import { useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"
import type { Library } from "@/src/domain/types"
import { addReadingSessionInterval } from "@/src/services/core/reading"
import { invalidateReadingStatistics } from "@/src/services/query/invalidate-table"
import { uuid } from "@/src/utils/common"

type ReadingContext = {
  library: Library
  bookId: number
  format: string
  sessionBatches: ReadingSessionBatchBuilder
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
  const bookId = loadState?.status === "ready" ? loadState.bookId : undefined
  const format = loadState?.status === "ready" ? loadState.format : undefined
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
      const pieces = context.sessionBatches.build(interval, Date.now())
      if (pieces.length === 0) return

      writeTailRef.current = writeTailRef.current
        .catch(() => undefined)
        .then(async () => {
          for (const piece of pieces) {
            await addReadingSessionInterval(context.library, {
              id: piece.id,
              bookId: context.bookId,
              format: context.format,
              localDay: piece.localDay,
              startedAt: piece.startedAt,
              durationSeconds: piece.durationSeconds,
              updatedAt: piece.recordedAt,
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
      sessionBatches: new ReadingSessionBatchBuilder(uuid),
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
}
