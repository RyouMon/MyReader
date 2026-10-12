import type { Locator } from "@my-reader/readium"
import { ReaderNavigationHistory } from "@my-reader/tools/reader-navigation-history"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import type { Library } from "@/src/domain/types"
import { parseStoredLocator } from "@/src/domain/library/reading-progress"
import { listReadingPositionCandidates } from "@/src/services/core/reading"
import { subscribeReadingPositions } from "@/src/services/core/reading-position-events"
import { queryKeys } from "@/src/services/query/query-keys"

export function useReaderNavigationHistory(
  sessionKey: string,
  library: Library | null,
  bookId: number | null,
  format: string | null,
  currentLocator: Locator | null | undefined,
) {
  const [session, setSession] = useState(() => ({
    key: sessionKey,
    history: new ReaderNavigationHistory(),
  }))
  if (session.key !== sessionKey)
    setSession({ key: sessionKey, history: new ReaderNavigationHistory() })
  const history = session.history
  const candidates = useQuery({
    queryKey: [
      ...queryKeys.readingProgress(library?.id),
      "positionCandidates",
      bookId,
      format,
    ],
    networkMode: "always",
    enabled: Boolean(library && bookId && format),
    staleTime: 0,
    retry: false,
    queryFn: () => listReadingPositionCandidates(library!, bookId!, format!),
  })
  useEffect(() => {
    if (currentLocator) history.update(currentLocator)
  }, [currentLocator, history])
  useEffect(() => {
    for (const candidate of [...(candidates.data ?? [])].sort(
      (a, b) => a.recordedAt - b.recordedAt,
    )) {
      if (candidate.isLocal) continue
      const locator = parseStoredLocator(candidate.locator)
      if (locator) history.receiveRemote(candidate.operationId, locator)
    }
  }, [candidates.data, history])
  useEffect(
    () =>
      subscribeReadingPositions((event) => {
        if (event.libraryId !== library?.id) return
        for (const position of [...event.positions].sort(
          (a, b) => a.recordedAt - b.recordedAt,
        )) {
          if (position.bookId !== bookId || position.format !== format) continue
          const locator = parseStoredLocator(position.locator)
          if (locator) history.receiveRemote(position.operationId, locator)
        }
      }),
    [bookId, format, history, library?.id],
  )
  return history
}
