import type { Locator } from "@my-reader/readium"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import type { Library } from "@/src/domain/types"
import { parseStoredLocator } from "@/src/domain/library/reading-progress"
import { errorMessage } from "@/src/i18n/error-message"
import {
  getReadingPosition,
  listReadingPositionCandidates,
  selectReadingPositionCandidate,
} from "@/src/services/core/reading"
import { queryKeys } from "@/src/services/query/query-keys"

export function useReaderPositionConflict(
  library: Library | null,
  bookId: number | null,
  format: string | null,
  flushProgress: () => Promise<void>,
) {
  const client = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const workingRef = useRef(false)
  const generationRef = useRef(0)
  const queryKey = [
    ...queryKeys.readingProgress(library?.id),
    "positionCandidates",
    bookId,
    format,
  ] as const
  const query = useQuery({
    queryKey,
    networkMode: "always",
    enabled: Boolean(library && bookId && format),
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const position = await getReadingPosition(library!, bookId!, format!)
      return position && position.conflictCount > 1
        ? listReadingPositionCandidates(library!, bookId!, format!)
        : []
    },
  })

  useEffect(() => {
    generationRef.current += 1
    workingRef.current = false
    setPending(false)
    setError(null)
    return () => {
      generationRef.current += 1
    }
  }, [library?.id, bookId, format])

  async function run(operationId?: string): Promise<Locator | null> {
    if (!library || !bookId || !format || workingRef.current) return null
    const generation = generationRef.current
    workingRef.current = true
    setPending(true)
    setError(null)
    try {
      await flushProgress()
      if (generation !== generationRef.current) return null
      await client.cancelQueries({ queryKey })
      let locator: Locator | null = null
      if (operationId) {
        await selectReadingPositionCandidate(
          library,
          bookId,
          format,
          operationId,
        )
        if (generation !== generationRef.current) return null
        const selected = await getReadingPosition(library, bookId, format)
        locator = parseStoredLocator(selected?.locator)
      }
      // The committed locator remains usable if the follow-up query fails.
      await query.refetch({ throwOnError: !operationId })
      return generation === generationRef.current ? locator : null
    } catch (cause) {
      if (generation === generationRef.current) {
        setError(errorMessage(cause))
        // A selected candidate may have been superseded by a remote resolution.
        if (operationId) await query.refetch()
      }
      return null
    } finally {
      if (generation === generationRef.current) {
        workingRef.current = false
        setPending(false)
      }
    }
  }

  return {
    candidates: query.data && query.data.length > 1 ? query.data : [],
    error: error ?? (query.error ? errorMessage(query.error) : null),
    pending: pending || query.isFetching,
    refresh: () => run(),
    select: (operationId: string) => run(operationId),
  }
}
