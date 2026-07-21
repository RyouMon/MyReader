import { displayProgressionForPosition } from "@/src/domain/library/display-progression"

export type ReaderProgressPreview = {
  chapterTitle?: string
  positionLabel: string
}

export type ReaderProgressDirection = "ltr" | "rtl"

export function clampReaderPositionIndex(
  positionIndex: number,
  positionCount: number,
): number {
  "worklet"
  const lastPositionIndex = Math.max(0, positionCount - 1)
  return Math.max(0, Math.min(lastPositionIndex, Math.round(positionIndex)))
}

export function readerPositionIndexForScrubberTranslation(
  startPositionIndex: number,
  translationX: number,
  width: number,
  positionCount: number,
  direction: ReaderProgressDirection = "ltr",
): number {
  "worklet"
  if (width <= 0 || positionCount <= 1) return 0
  const logicalTranslation = direction === "rtl" ? -translationX : translationX
  const translatedPositions = (logicalTranslation / width) * positionCount
  return clampReaderPositionIndex(
    startPositionIndex + translatedPositions,
    positionCount,
  )
}

export function readerProgressPercentForPosition(
  positionIndex: number,
  positionCount: number,
): number {
  "worklet"
  return displayProgressionForPosition(positionIndex, positionCount) * 100
}

export function readerProgressOffset(
  width: number,
  progressPercent: number,
  direction: ReaderProgressDirection = "ltr",
): number {
  "worklet"
  if (width <= 0) return 0
  const clampedProgress = Math.max(0, Math.min(100, progressPercent))
  const physicalProgress =
    direction === "rtl" ? 100 - clampedProgress : clampedProgress
  return (width * physicalProgress) / 100
}
