import { useQuery } from "@tanstack/react-query"

import type { Library } from "@/src/domain/types"
import { queryKeys } from "@/src/services/query/query-keys"
import { displayProgressionToPercent } from "../display-progression"

export function useBookReadingProgress(library: Library | null) {
  return useQuery({
    queryKey: queryKeys.readingProgress(library?.id),
    queryFn: async () => {
      if (!library) return {} as Record<string, Record<string, number>>

      const [
        { listAllReadingProgress },
        { parseStoredLocator, locatorToPercent },
      ] = await Promise.all([
        import("@/src/repos/reading-progress"),
        import("@/src/domain/library/reading-progress"),
      ])

      const rows = await listAllReadingProgress(library)
      const byBook: Record<string, Record<string, number>> = {}

      for (const row of rows) {
        const locator = parseStoredLocator(JSON.parse(row.locatorJson))
        const percent =
          displayProgressionToPercent(row.displayProgression) ??
          locatorToPercent(locator)
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
