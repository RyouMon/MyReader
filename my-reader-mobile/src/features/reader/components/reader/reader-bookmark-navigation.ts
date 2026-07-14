import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { positionIndexForLocator } from "@my-reader/tools/reader-toc"

export function resolveReaderBookmarkNavigationLocator(
  storedLocator: ReaderLocator,
  positions: ReaderLocator[],
  layout: "reflowable" | "fixed",
): ReaderLocator {
  if (layout === "reflowable" || positions.length === 0) {
    return storedLocator
  }

  return (
    positions[positionIndexForLocator(positions, storedLocator)] ??
    storedLocator
  )
}
