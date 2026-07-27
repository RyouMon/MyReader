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

export function readingIntensityLevel(
  durationSeconds: number,
): 0 | 1 | 2 | 3 | 4 {
  if (durationSeconds <= 0) return 0
  if (durationSeconds < 15 * 60) return 1
  if (durationSeconds < 30 * 60) return 2
  if (durationSeconds < 60 * 60) return 3
  return 4
}
