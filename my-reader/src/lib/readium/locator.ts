import { canonicalizeReaderLocatorForStorage } from "@my-reader/tools/reader-bookmarks"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { Locator } from "@readium/shared"

export function parseSavedLocator(data: unknown): Locator | null {
  if (data == null || typeof data !== "object") return null
  return Locator.deserialize(data) ?? null
}

export function locatorToJson(locator: Locator): ReaderLocator {
  const raw = locator.serialize() as unknown as ReaderLocator
  return canonicalizeReaderLocatorForStorage(raw)
}

export function locatorDisplayPosition(
  locator: Locator | null,
  positionCount: number,
): number {
  const locations = locator?.locations
  if (locations?.position != null) return locations.position
  if (locations?.totalProgression != null && positionCount > 1) {
    return Math.round(locations.totalProgression * (positionCount - 1)) + 1
  }
  return 1
}

function clampProgression(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function locatorAtTotalProgression(
  positions: Locator[],
  totalProgression: number,
): Locator | null {
  if (positions.length === 0) return null
  const index = Math.round(
    clampProgression(totalProgression) * (positions.length - 1),
  )
  return positions[index] ?? null
}

export function resolveInitialEpubPosition(
  positions: Locator[],
  initialSavedLocator: Locator | null,
): Locator | null {
  if (positions.length === 0) return null
  if (!initialSavedLocator) return positions[0]

  // A position list samples a resource; it is not precise enough to restore a page.
  const savedHref = locatorToJson(initialSavedLocator).href
  const resource = positions.find(
    (position) => locatorToJson(position).href === savedHref,
  )
  if (resource) {
    return (
      Locator.deserialize({
        ...initialSavedLocator.serialize(),
        href: resource.href,
      }) ?? resource
    )
  }

  const savedTotalProgression = initialSavedLocator.locations.totalProgression
  if (typeof savedTotalProgression === "number") {
    return locatorAtTotalProgression(positions, savedTotalProgression)
  }

  const savedPosition = initialSavedLocator.locations.position
  if (typeof savedPosition === "number") {
    const position = positions[savedPosition - 1]
    if (position) return position
  }

  return positions[0]
}
