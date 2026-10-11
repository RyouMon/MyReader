import { ReaderNavigationHistory } from "@my-reader/tools/reader-navigation-history"
import type { Locator } from "@readium/shared"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useReadingPositionCandidates } from "@/hooks/queries/useReadingPositionCandidates"
import {
  SIDECAR_SYNC_COMPLETED_EVENT,
  type SidecarSyncCompletedEvent,
} from "@/hooks/useSidecarSync"
import { locatorToJson, parseSavedLocator } from "@/lib/readium/locator"

export function useReaderNavigationHistory({
  libraryId,
  bookId,
  format,
  currentLocator,
  enabled,
}: {
  libraryId: string | null
  bookId: number
  format: string
  currentLocator: Locator | null
  enabled: boolean
}) {
  const sessionKey = `${libraryId}:${bookId}:${format}`
  const [session, setSession] = useState(() => ({
    key: sessionKey,
    history: new ReaderNavigationHistory(),
  }))
  if (session.key !== sessionKey)
    setSession({ key: sessionKey, history: new ReaderNavigationHistory() })
  const history = session.history
  useSyncExternalStore(history.subscribe, history.getSnapshot)
  const candidates = useReadingPositionCandidates(
    libraryId,
    bookId,
    format,
    enabled,
  )
  useEffect(() => {
    if (currentLocator) history.update(locatorToJson(currentLocator))
  }, [currentLocator, history])
  useEffect(() => {
    for (const candidate of [...(candidates.data ?? [])].sort(
      (a, b) => a.recordedAt - b.recordedAt,
    )) {
      if (candidate.isLocal) continue
      const locator = parseSavedLocator(candidate.locator)
      if (locator)
        history.receiveRemote(candidate.operationId, locatorToJson(locator))
    }
  }, [candidates.data, history])
  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<SidecarSyncCompletedEvent>).detail
      if (detail.libraryId !== libraryId) return
      for (const position of [...(detail.readingPositions ?? [])].sort(
        (a, b) => a.recordedAt - b.recordedAt,
      )) {
        if (position.bookId !== bookId || position.format !== format) continue
        const locator = parseSavedLocator(position.locator)
        if (locator)
          history.receiveRemote(position.operationId, locatorToJson(locator))
      }
    }
    window.addEventListener(SIDECAR_SYNC_COMPLETED_EVENT, onSync)
    return () =>
      window.removeEventListener(SIDECAR_SYNC_COMPLETED_EVENT, onSync)
  }, [bookId, format, history, libraryId])
  return history
}
