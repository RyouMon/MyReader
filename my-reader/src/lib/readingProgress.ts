import { readingProgressToPercent } from "@my-reader/tools/reading-progress"

export type BookProgressSnapshot = {
  percent?: number
  statusLabel?: string
  syncedLabel?: string
}

export type ReadingProgressRowLike = {
  bookId: number
  format: string
  locator: unknown
  displayProgression?: number | null
}

export type ReadingProgressByBook = Record<string, Record<string, number>>

export function displayProgressionForPosition(
  position: number,
  positionCount: number,
): number | undefined {
  if (positionCount <= 0) return undefined
  const count = Math.max(1, Math.round(positionCount))
  const current = Math.max(1, Math.min(count, Math.round(position)))
  return current / count
}

export function positionForDisplayProgressPercent(
  progressPercent: number,
  positionCount: number,
): number | undefined {
  if (positionCount <= 0) return undefined
  const count = Math.max(1, Math.round(positionCount))
  const normalized = Math.max(0, Math.min(100, progressPercent)) / 100
  return Math.max(1, Math.min(count, Math.ceil(normalized * count)))
}

export function readingProgressRowsToMap(
  rows: ReadingProgressRowLike[],
): ReadingProgressByBook {
  const byBook: ReadingProgressByBook = {}

  for (const row of rows) {
    const percent = readingProgressToPercent(
      row.displayProgression,
      row.locator,
    )
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
