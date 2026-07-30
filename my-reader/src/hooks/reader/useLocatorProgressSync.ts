import type { Locator } from "@readium/shared"
import {
  READING_HEARTBEAT_MS,
  ReadingTimeAccumulator,
  splitReadingIntervalByLocalDay,
  type TimedReadingInterval,
} from "@my-reader/tools/reading-time-accumulator"
import { isTauri } from "@tauri-apps/api/core"
import { useCallback, useEffect, useRef } from "react"
import { locatorToJson } from "@/lib/readium/locator"
import { api } from "@/lib/tauri-api"

const SAVE_DEBOUNCE_MS = 1600

type ReadingSessionContext = {
  libraryId: string
  bookId: number
  format: string
  sessions: Map<string, { id: string; startedAt: number }>
}

function compactUuid(): string {
  return crypto.randomUUID().replace(/-/g, "")
}

export interface ReadingProgressDto {
  libraryId: string
  bookId: number
  format: string
  locator: Record<string, unknown>
  displayProgression: number | null
  updatedAt: number | null
}

export function useLocatorProgressSync(params: {
  enabled: boolean
  libraryId: string | null
  bookId: number
  format: string
  currentLocator: Locator | null
  displayProgression: number | null
}): void {
  const {
    enabled,
    libraryId,
    bookId,
    format,
    currentLocator,
    displayProgression,
  } = params
  const saveSeqRef = useRef(0)
  const locatorRef = useRef(currentLocator)
  const readingCounterRef = useRef<ReadingTimeAccumulator | null>(null)
  const readingContextRef = useRef<ReadingSessionContext | null>(null)
  const readingWriteTailRef = useRef(Promise.resolve())
  locatorRef.current = currentLocator

  const locatorKey = currentLocator
    ? JSON.stringify(locatorToJson(currentLocator))
    : ""
  const trackingKey =
    enabled && libraryId
      ? `${libraryId}:${bookId}:${format.toUpperCase()}`
      : null

  const enqueueReadingInterval = useCallback(
    (context: ReadingSessionContext, interval: TimedReadingInterval | null) => {
      if (!interval) return
      const pieces = splitReadingIntervalByLocalDay(interval)
      if (pieces.length === 0) return

      readingWriteTailRef.current = readingWriteTailRef.current
        .catch(() => undefined)
        .then(async () => {
          for (const piece of pieces) {
            let session = context.sessions.get(piece.localDay)
            if (!session) {
              session = {
                id: compactUuid(),
                startedAt: piece.startedAt,
              }
              context.sessions.set(piece.localDay, session)
            }
            await api.addReadingSessionInterval(
              context.libraryId,
              session.id,
              context.bookId,
              context.format,
              piece.localDay,
              session.startedAt,
              piece.durationSeconds,
              Date.now(),
            )
          }
        })
        .catch((error: unknown) => {
          console.error("[useLocatorProgressSync] save session failed:", error)
        })
    },
    [],
  )

  useEffect(() => {
    if (!isTauri() || !trackingKey || !libraryId) return

    const context: ReadingSessionContext = {
      libraryId,
      bookId,
      format: format.toUpperCase(),
      sessions: new Map(),
    }
    const counter = new ReadingTimeAccumulator()
    readingContextRef.current = context
    readingCounterRef.current = counter
    if (document.visibilityState === "visible") counter.resume(Date.now())

    const heartbeat = window.setInterval(() => {
      enqueueReadingInterval(context, counter.pulse(Date.now()))
    }, READING_HEARTBEAT_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        counter.resume(Date.now())
      } else {
        enqueueReadingInterval(context, counter.pause(Date.now()))
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      enqueueReadingInterval(context, counter.pause(Date.now()))
      if (readingContextRef.current === context) {
        readingContextRef.current = null
      }
      if (readingCounterRef.current === counter) {
        readingCounterRef.current = null
      }
    }
  }, [bookId, enqueueReadingInterval, format, libraryId, trackingKey])

  useEffect(() => {
    const context = readingContextRef.current
    const counter = readingCounterRef.current
    if (!trackingKey || !context || !counter) return
    enqueueReadingInterval(context, counter.locationChanged(Date.now()))
  }, [enqueueReadingInterval, locatorKey, trackingKey])

  useEffect(() => {
    if (!isTauri() || !enabled || !libraryId || !locatorKey) return

    const seq = ++saveSeqRef.current
    const t = window.setTimeout(() => {
      if (saveSeqRef.current !== seq) return
      const loc = locatorRef.current
      if (!loc) return
      api
        .setReadingProgress(
          libraryId,
          bookId,
          format,
          locatorToJson(loc),
          displayProgression,
        )
        .catch((e: unknown) => {
          console.error("[useLocatorProgressSync] save failed:", e)
        })
    }, SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(t)
  }, [enabled, libraryId, bookId, format, locatorKey, displayProgression])
}
