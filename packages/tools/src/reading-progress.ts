function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function progressionToPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value)) * 100
}

export function locatorProgressionToPercent(
  locator: unknown,
): number | undefined {
  if (!isRecord(locator) || !isRecord(locator.locations)) return undefined
  return (
    progressionToPercent(locator.locations.totalProgression) ??
    progressionToPercent(locator.locations.progression)
  )
}

export function readingProgressToPercent(
  displayProgression: number | null | undefined,
  locator: unknown,
): number | undefined {
  return (
    progressionToPercent(displayProgression) ??
    locatorProgressionToPercent(locator)
  )
}

export type ReadingProgressRowLike = {
  bookId: number
  format: string
  locator: unknown
  displayProgression?: number | null
}

export type ReadingProgressByBook = Record<string, Record<string, number>>

export function mergeReadingProgressRow(
  current: ReadingProgressByBook,
  row: ReadingProgressRowLike,
): ReadingProgressByBook {
  const percent = readingProgressToPercent(row.displayProgression, row.locator)
  if (percent === undefined) return current

  const bookId = String(row.bookId)
  const format = row.format.toUpperCase()
  return {
    ...current,
    [bookId]: {
      ...(current[bookId] ?? {}),
      [format]: percent,
    },
  }
}

export function readingProgressRowsToMap(
  rows: ReadingProgressRowLike[],
): ReadingProgressByBook {
  return rows.reduce(mergeReadingProgressRow, {})
}

export type ReadingProgressDisplayInput = {
  percent?: number
  statusLabel?: string
}

export type ReadingProgressDisplayLabels = {
  finished: string
  unread: string
}

export type ReadingProgressDisplay = {
  text: string
  isUnread: boolean
  isFinished: boolean
  isStatusLabel: boolean
}

export function readingProgressDisplay(
  progress: ReadingProgressDisplayInput | undefined,
  labels: ReadingProgressDisplayLabels,
): ReadingProgressDisplay {
  if (progress?.statusLabel) {
    return {
      text: progress.statusLabel,
      isUnread: false,
      isFinished: false,
      isStatusLabel: true,
    }
  }

  const percent = progress?.percent ?? 0
  const hasProgress = typeof progress?.percent === "number"
  const roundedPercent = Math.round(percent)
  const isUnread = !hasProgress || roundedPercent <= 0
  const isFinished = hasProgress && roundedPercent >= 100

  if (isUnread) {
    return {
      text: labels.unread,
      isUnread: true,
      isFinished: false,
      isStatusLabel: true,
    }
  }
  if (isFinished) {
    return {
      text: labels.finished,
      isUnread: false,
      isFinished: true,
      isStatusLabel: true,
    }
  }
  return {
    text: `${roundedPercent}%`,
    isUnread: false,
    isFinished: false,
    isStatusLabel: false,
  }
}
