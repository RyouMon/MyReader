import { canonicalizeReaderLocatorForStorage } from "./reader-bookmarks"
import {
  hrefRoughlyMatches,
  positionIndexForLocator,
  type ReaderLocator,
} from "./reader-toc"

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

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function publicationPositionIndex(
  positions: readonly ReaderLocator[],
  locator: ReaderLocator,
): number | undefined {
  if (positions.length === 0) return undefined
  const locations = locator.locations
  const canResolve =
    finiteNumber(locations?.position) !== undefined ||
    finiteNumber(locations?.totalProgression) !== undefined ||
    positions.some((position) =>
      hrefRoughlyMatches(position.href, locator.href),
    )
  return canResolve ? positionIndexForLocator(positions, locator) : undefined
}

export function sortReaderAnnotations<T extends ReaderAnnotationLike>(
  annotations: readonly T[],
  positions: readonly ReaderLocator[] = [],
): T[] {
  return annotations
    .map((annotation) => ({
      annotation,
      positionIndex: publicationPositionIndex(positions, annotation.locator),
    }))
    .sort((leftEntry, rightEntry) => {
      const left = leftEntry.annotation
      const right = rightEntry.annotation
      const leftPositionIndex = leftEntry.positionIndex
      const rightPositionIndex = rightEntry.positionIndex
      if (leftPositionIndex !== rightPositionIndex) {
        if (leftPositionIndex == null) return 1
        if (rightPositionIndex == null) return -1
        return leftPositionIndex - rightPositionIndex
      }

      if (hrefRoughlyMatches(left.locator.href, right.locator.href)) {
        const leftProgression = finiteNumber(
          left.locator.locations?.progression,
        )
        const rightProgression = finiteNumber(
          right.locator.locations?.progression,
        )
        if (
          leftProgression != null &&
          rightProgression != null &&
          leftProgression !== rightProgression
        ) {
          return leftProgression - rightProgression
        }
      }

      const leftTotalProgression = finiteNumber(
        left.locator.locations?.totalProgression,
      )
      const rightTotalProgression = finiteNumber(
        right.locator.locations?.totalProgression,
      )
      if (
        leftTotalProgression != null &&
        rightTotalProgression != null &&
        leftTotalProgression !== rightTotalProgression
      ) {
        return leftTotalProgression - rightTotalProgression
      }

      const leftPosition = finiteNumber(left.locator.locations?.position)
      const rightPosition = finiteNumber(right.locator.locations?.position)
      if (
        leftPosition != null &&
        rightPosition != null &&
        leftPosition !== rightPosition
      ) {
        return leftPosition - rightPosition
      }

      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt
      }
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
    .map(({ annotation }) => annotation)
}
