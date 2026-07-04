import { PixelRatio } from "react-native"

import {
  LIBRARY_GRID_CARD_GAP,
  LIBRARY_GRID_COVER_ASPECT_RATIO,
  LIBRARY_GRID_MAX_COLUMNS,
  LIBRARY_GRID_MIN_CARD_WIDTH,
  LIBRARY_GRID_MIN_COLUMNS,
  LIBRARY_GRID_PADDING_X,
} from "@/src/config/library-list-performance"

export type CoverThumbnailSize = {
  widthPx: number
  heightPx: number
}

export function resolveLibraryGridColumns(containerWidth: number): number {
  const availableWidth = Math.max(
    0,
    containerWidth - LIBRARY_GRID_PADDING_X * 2,
  )
  const estimatedColumns = Math.floor(
    (availableWidth + LIBRARY_GRID_CARD_GAP) /
      (LIBRARY_GRID_MIN_CARD_WIDTH + LIBRARY_GRID_CARD_GAP),
  )
  return Math.max(
    LIBRARY_GRID_MIN_COLUMNS,
    Math.min(
      LIBRARY_GRID_MAX_COLUMNS,
      estimatedColumns || LIBRARY_GRID_MIN_COLUMNS,
    ),
  )
}

export function resolveLibraryGridCardWidth(
  containerWidth: number,
  gridColumns = resolveLibraryGridColumns(containerWidth),
): number {
  return (
    (containerWidth -
      LIBRARY_GRID_PADDING_X * 2 -
      LIBRARY_GRID_CARD_GAP * (gridColumns - 1)) /
    gridColumns
  )
}

export function resolveCoverThumbnailPixelSize(
  width: number,
  height: number,
  pixelRatio = PixelRatio.get(),
): CoverThumbnailSize {
  return {
    widthPx: Math.max(1, Math.round(width * pixelRatio)),
    heightPx: Math.max(1, Math.round(height * pixelRatio)),
  }
}

export function coverThumbnailSizeKey(size: CoverThumbnailSize): string {
  return `${size.widthPx}x${size.heightPx}`
}

export function uniqueCoverThumbnailSizes(
  sizes: readonly CoverThumbnailSize[],
): CoverThumbnailSize[] {
  const seen = new Set<string>()
  const result: CoverThumbnailSize[] = []

  for (const size of sizes) {
    const normalized = {
      widthPx: Math.max(1, Math.round(size.widthPx)),
      heightPx: Math.max(1, Math.round(size.heightPx)),
    }
    const key = coverThumbnailSizeKey(normalized)
    if (seen.has(key)) continue

    seen.add(key)
    result.push(normalized)
  }

  return result
}

export function selectNearestCoverThumbnailSize(
  displaySize: CoverThumbnailSize,
  candidates: readonly CoverThumbnailSize[],
): CoverThumbnailSize {
  const uniqueCandidates = uniqueCoverThumbnailSizes(candidates)
  if (uniqueCandidates.length === 0) return displaySize

  let best = uniqueCandidates[0]!
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of uniqueCandidates) {
    const widthDelta = candidate.widthPx - displaySize.widthPx
    const heightDelta = candidate.heightPx - displaySize.heightPx
    const distance = widthDelta * widthDelta + heightDelta * heightDelta
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }

  return best
}

export function resolveFullscreenGridCoverThumbnailSizes({
  pixelRatio = PixelRatio.get(),
  screenHeight,
  screenWidth,
}: {
  pixelRatio?: number
  screenHeight: number
  screenWidth: number
}): CoverThumbnailSize[] {
  const portraitWidth = Math.min(screenWidth, screenHeight)
  const landscapeWidth = Math.max(screenWidth, screenHeight)

  return uniqueCoverThumbnailSizes(
    [portraitWidth, landscapeWidth].map((containerWidth) => {
      const cardWidth = resolveLibraryGridCardWidth(containerWidth)
      return resolveCoverThumbnailPixelSize(
        cardWidth,
        Math.round(cardWidth * LIBRARY_GRID_COVER_ASPECT_RATIO),
        pixelRatio,
      )
    }),
  )
}
