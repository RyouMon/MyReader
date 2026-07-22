import { localDayKey } from "./statistics"

export type ReadingHeatmapDay = {
  key: string
  date: Date
  inYear: boolean
}

export function buildReadingYearWeeks(year: number): ReadingHeatmapDay[][] {
  const firstDay = new Date(year, 0, 1)
  const cursor = new Date(year, 0, 1 - firstDay.getDay())
  const lastDay = new Date(year, 11, 31)
  const end = new Date(year, 11, 31 + (6 - lastDay.getDay()))
  const weeks: ReadingHeatmapDay[][] = []

  while (cursor <= end) {
    const week: ReadingHeatmapDay[] = []
    for (let row = 0; row < 7; row++) {
      const date = new Date(cursor)
      week.push({
        key: localDayKey(date),
        date,
        inYear: date.getFullYear() === year,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  return weeks
}

export function readingHeatmapScrollOffset(
  targetColumn: number,
  cellStep: number,
  contentWidth: number,
  viewportWidth: number,
): number {
  if (targetColumn < 0 || viewportWidth <= 0) return 0
  const desiredOffset = targetColumn * cellStep - viewportWidth + cellStep * 5
  return Math.max(0, Math.min(contentWidth - viewportWidth, desiredOffset))
}
