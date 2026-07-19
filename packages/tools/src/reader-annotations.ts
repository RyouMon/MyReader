import { canonicalizeReaderLocatorForStorage } from "./reader-bookmarks"
import type { ReaderLocator } from "./reader-toc"

export const READER_ANNOTATION_COLORS = {
  yellow: "#D9A928",
  orange: "#C4622D",
  green: "#5F8468",
  blue: "#607E9D",
} as const

export type ReaderAnnotationColor = keyof typeof READER_ANNOTATION_COLORS
export type ReaderAnnotationKind = "highlight"

export type ReaderAnnotationLike = {
  id: string
  locator: ReaderLocator
  createdAt: number
}

export function isReaderAnnotationColor(
  value: string,
): value is ReaderAnnotationColor {
  return value in READER_ANNOTATION_COLORS
}

export function readerAnnotationTint(color: ReaderAnnotationColor): string {
  return READER_ANNOTATION_COLORS[color]
}

export function canonicalizeReaderAnnotationLocator(
  locator: ReaderLocator,
): ReaderLocator {
  return canonicalizeReaderLocatorForStorage(locator)
}

export function readerAnnotationExcerpt(locator: ReaderLocator): string {
  return locator.text?.highlight?.trim() ?? ""
}

function normalizedSelectionText(value: string | undefined): string {
  return value?.trim() ?? ""
}

function selectionAnchor(locator: ReaderLocator): unknown {
  const locations = locator.locations
  if (locations?.partialCfi) return ["partialCfi", locations.partialCfi]
  if (locations?.domRange) return ["domRange", locations.domRange]
  if (locations?.cssSelector) return ["cssSelector", locations.cssSelector]
  if (locations?.fragments?.length) return ["fragments", locations.fragments]
  return null
}

export function readerAnnotationMatchesSelection(
  annotation: ReaderLocator,
  selection: ReaderLocator,
): boolean {
  const saved = canonicalizeReaderAnnotationLocator(annotation)
  const selected = canonicalizeReaderAnnotationLocator(selection)
  return (
    saved.href === selected.href &&
    JSON.stringify(selectionAnchor(saved)) ===
      JSON.stringify(selectionAnchor(selected)) &&
    normalizedSelectionText(saved.text?.highlight) ===
      normalizedSelectionText(selected.text?.highlight) &&
    normalizedSelectionText(saved.text?.before) ===
      normalizedSelectionText(selected.text?.before) &&
    normalizedSelectionText(saved.text?.after) ===
      normalizedSelectionText(selected.text?.after)
  )
}

export function sortReaderAnnotations<T extends ReaderAnnotationLike>(
  annotations: readonly T[],
): T[] {
  return [...annotations].sort((left, right) => {
    const leftPosition = left.locator.locations?.position
    const rightPosition = right.locator.locations?.position
    if (leftPosition !== rightPosition) {
      if (leftPosition == null) return 1
      if (rightPosition == null) return -1
      return leftPosition - rightPosition
    }

    const leftProgression =
      left.locator.locations?.totalProgression ??
      left.locator.locations?.progression
    const rightProgression =
      right.locator.locations?.totalProgression ??
      right.locator.locations?.progression
    if (leftProgression !== rightProgression) {
      if (leftProgression == null) return 1
      if (rightProgression == null) return -1
      return leftProgression - rightProgression
    }

    if (left.locator.href !== right.locator.href) {
      return left.locator.href < right.locator.href ? -1 : 1
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
}
