import { useQuery } from "@tanstack/react-query"
import { readingProgressRowsToMap } from "@my-reader/tools/reading-progress"

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
      return readingProgressRowsToMap(rows)
    },
    enabled: !!library,
    staleTime: 1000 * 60 * 5,
  })
}
