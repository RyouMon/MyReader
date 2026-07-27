import { useQuery } from "@tanstack/react-query"
import { yearDayRange } from "@/src/domain/reading-statistics/statistics"
import type { Library } from "@/src/domain/types"
import { getReadingStatistics } from "@/src/services/core/reading"
import { queryKeys } from "@/src/services/query/query-keys"

export function useReadingStatistics(library: Library | null, year: number) {
  return useQuery({
    queryKey: queryKeys.readingStatistics(library?.id, year),
    queryFn: async () => {
      if (!library) {
        return {
          days: {},
          totalDurationSeconds: 0,
          longestStreakDays: 0,
          completedBooks: 0,
        }
      }
      const { startDay, endDay } = yearDayRange(year)
      return getReadingStatistics(library, startDay, endDay)
    },
    enabled: !!library,
    staleTime: 60_000,
  })
}
