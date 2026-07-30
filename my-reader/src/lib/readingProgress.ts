import {
  readingProgressDisplay,
  type ReadingProgressByBook,
} from "@my-reader/tools/reading-progress"

export type {
  ReadingProgressByBook,
  ReadingProgressRowLike,
} from "@my-reader/tools/reading-progress"
export { readingProgressRowsToMap } from "@my-reader/tools/reading-progress"

export type BookProgressSnapshot = {
  percent?: number
  statusLabel?: string
  syncedLabel?: string
}

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
): ReturnType<typeof readingProgressDisplay> {
  return readingProgressDisplay(progress, {
    finished: t("bookRow.finished"),
    unread: t("bookRow.unread"),
  })
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
