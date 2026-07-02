export type BookProgressSnapshot = {
  percent?: number
  statusLabel?: string
  syncedLabel?: string
}

export type ReadingProgressRowLike = {
  bookId: number
  format: string
  locator: unknown
}

export type ReadingProgressByBook = Record<string, Record<string, number>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clampProgression(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function locatorToPercent(locator: unknown): number | undefined {
  if (!isRecord(locator)) return undefined
  const locations = locator.locations
  if (!isRecord(locations)) return undefined

  const totalProgression = locations.totalProgression
  if (typeof totalProgression === "number") {
    return clampProgression(totalProgression) * 100
  }

  const progression = locations.progression
  if (typeof progression === "number") {
    return clampProgression(progression) * 100
  }

  return undefined
}

export function readingProgressRowsToMap(
  rows: ReadingProgressRowLike[],
): ReadingProgressByBook {
  const byBook: ReadingProgressByBook = {}

  for (const row of rows) {
    const percent = locatorToPercent(row.locator)
    if (percent === undefined) continue

    const bookId = String(row.bookId)
    const format = row.format.toUpperCase()
    byBook[bookId] = {
      ...byBook[bookId],
      [format]: percent,
    }
  }

  return byBook
}

export function getBookProgressSnapshot(
  progressByBook: ReadingProgressByBook | undefined,
  bookId: number,
  format: string | null | undefined,
): BookProgressSnapshot | undefined {
  if (!format) return undefined
  const percent = progressByBook?.[String(bookId)]?.[format.toUpperCase()]
  return typeof percent === "number" ? { percent } : undefined
}

export function getProgressDisplay(
  progress: BookProgressSnapshot | undefined,
  t: (key: string) => string,
): {
  text: string
  isUnread: boolean
  isFinished: boolean
  isStatusLabel: boolean
} {
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
      text: t("bookRow.unread"),
      isUnread: true,
      isFinished: false,
      isStatusLabel: true,
    }
  }

  if (isFinished) {
    return {
      text: t("bookRow.finished"),
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

export function getReadActionLabel(
  progress: BookProgressSnapshot | undefined,
  t: (key: string) => string,
): string {
  const percent = progress?.percent
  if (typeof percent !== "number" || Math.round(percent) <= 0) {
    return t("bookCard.startReading")
  }
  if (Math.round(percent) >= 100) {
    return t("bookCard.readAgain")
  }
  return t("bookCard.continueReading")
}
