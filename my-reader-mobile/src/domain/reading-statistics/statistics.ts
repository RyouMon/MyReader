export type DailyReadingDuration = {
  localDay: string
  durationSeconds: number
}

export type ReadingCompletionDay = {
  bookId: number
  localDay: string
}

export type ReadingStatistics = {
  days: Record<string, number>
  totalDurationSeconds: number
  longestStreakDays: number
  completedBooks: number
}

export function localDayKey(value: number | Date): string {
  const date = typeof value === "number" ? new Date(value) : value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function yearDayRange(year: number) {
  return {
    startDay: `${year}-01-01`,
    endDay: `${year}-12-31`,
  }
}

function dayOrdinal(localDay: string): number {
  const [year, month, day] = localDay.split("-").map(Number)
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000)
}

export function longestReadingStreak(localDays: readonly string[]): number {
  const ordinals = [...new Set(localDays)].map(dayOrdinal).sort((a, b) => a - b)
  let longest = 0
  let current = 0
  let previous: number | null = null

  for (const ordinal of ordinals) {
    current = previous !== null && ordinal === previous + 1 ? current + 1 : 1
    longest = Math.max(longest, current)
    previous = ordinal
  }

  return longest
}

export function aggregateReadingStatistics(
  sessions: readonly DailyReadingDuration[],
  completions: readonly ReadingCompletionDay[],
): ReadingStatistics {
  const days: Record<string, number> = {}
  let totalDurationSeconds = 0

  for (const session of sessions) {
    const seconds = Math.max(0, Math.round(session.durationSeconds))
    if (seconds === 0) continue
    days[session.localDay] = (days[session.localDay] ?? 0) + seconds
    totalDurationSeconds += seconds
  }

  return {
    days,
    totalDurationSeconds,
    longestStreakDays: longestReadingStreak(Object.keys(days)),
    completedBooks: new Set(completions.map((item) => item.bookId)).size,
  }
}

export function readingIntensityLevel(
  durationSeconds: number,
): 0 | 1 | 2 | 3 | 4 {
  if (durationSeconds <= 0) return 0
  if (durationSeconds < 15 * 60) return 1
  if (durationSeconds < 30 * 60) return 2
  if (durationSeconds < 60 * 60) return 3
  return 4
}
