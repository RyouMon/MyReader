import { useQuery } from "@tanstack/react-query"

import type { Library } from "@/src/domain/types"
import {
  aggregateReadingStatistics,
  localDayKey,
  yearDayRange,
} from "@/src/domain/reading-statistics/statistics"
import {
  listLegacyFinishedProgress,
  listReadingCompletionsByDayRange,
  listReadingSessionsByDayRange,
  upsertEarliestReadingCompletion,
} from "@/src/repos/reading-statistics"
import { queryKeys } from "@/src/services/query/query-keys"
import { uuid } from "@/src/utils/common"

async function backfillLegacyReadingCompletions(library: Library) {
  const legacyRows = await listLegacyFinishedProgress(library)
  for (const row of legacyRows) {
    await upsertEarliestReadingCompletion(library, {
      id: uuid(),
      bookId: row.bookId,
      format: row.format,
      localDay: localDayKey(row.updatedAt),
      completedAt: row.updatedAt,
      updatedAt: row.updatedAt,
    })
  }
}

export function useReadingStatistics(library: Library | null, year: number) {
  return useQuery({
    queryKey: queryKeys.readingStatistics(library?.id, year),
    queryFn: async () => {
      if (!library) return aggregateReadingStatistics([], [])

      await backfillLegacyReadingCompletions(library)
      const { startDay, endDay } = yearDayRange(year)
      const [sessions, completions] = await Promise.all([
        listReadingSessionsByDayRange(library, startDay, endDay),
        listReadingCompletionsByDayRange(library, startDay, endDay),
      ])
      return aggregateReadingStatistics(sessions, completions)
    },
    enabled: !!library,
    staleTime: 60_000,
  })
}
