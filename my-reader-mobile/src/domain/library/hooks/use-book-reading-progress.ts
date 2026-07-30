import { useQuery } from "@tanstack/react-query"
import { readingProgressToPercent } from "@my-reader/tools/reading-progress"

import type { Library } from "@/src/domain/types"
import { queryKeys } from "@/src/services/query/query-keys"

export function useBookReadingProgress(library: Library | null) {
  return useQuery({
    queryKey: queryKeys.readingProgress(library?.id),
    queryFn: async () => {
      if (!library) return {} as Record<string, Record<string, number>>

      const [{ listReadingPositions }] = await Promise.all([
        import("@/src/services/core/reading"),
      ])

      const rows = await listReadingPositions(library)
      const byBook: Record<string, Record<string, number>> = {}

      for (const row of rows) {
        const percent = readingProgressToPercent(
          row.displayProgression,
          row.locator,
        )
        if (percent === undefined) continue

        const bookId = String(row.bookId)
        const format = row.format.toUpperCase()
        if (!byBook[bookId]) {
          byBook[bookId] = {}
        }
        byBook[bookId]![format] = percent
      }

      return byBook
    },
    enabled: !!library,
    staleTime: 1000 * 60 * 5,
  })
}
