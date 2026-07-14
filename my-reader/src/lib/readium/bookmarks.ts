import {
  canonicalizeReaderLocatorForStorage,
  sameReaderBookmarkLocation,
} from "@my-reader/tools/reader-bookmarks"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { Locator } from "@readium/shared"

/**
 * Serializes Readium's Locator class before canonicalization so extension
 * locations (for example `cssSelector`) are flattened out of its Map.
 */
export function serializeReaderBookmarkLocator(
  locator: Locator,
  format: string,
): ReaderLocator {
  const serialized = locator.serialize() as ReaderLocator
  const portable =
    format.toUpperCase() === "PDF"
      ? { ...serialized, href: "publication.pdf" }
      : serialized
  return canonicalizeReaderLocatorForStorage(portable)
}

export function deserializeReaderBookmarkLocator(
  locator: ReaderLocator,
): Locator | null {
  return Locator.deserialize(locator) ?? null
}

export function readerBookmarkMatchesLocator(
  bookmark: ReaderLocator,
  locator: Locator,
  format: string,
): boolean {
  return sameReaderBookmarkLocation(
    bookmark,
    serializeReaderBookmarkLocator(locator, format),
  )
}

export function pdfPageForBookmark(
  bookmark: ReaderLocator,
  totalPages: number,
): number | null {
  const position = bookmark.locations?.position
  if (typeof position !== "number" || !Number.isFinite(position)) return null
  const page = Math.floor(position)
  return page >= 1 && page <= totalPages ? page : null
}

/** Resolves a portable CBZ bookmark against process-local publication hrefs. */
export function divinaPageForBookmark(
  bookmark: ReaderLocator,
  positions: readonly Locator[],
): number | null {
  const canonicalBookmark = canonicalizeReaderLocatorForStorage(bookmark)
  const byHref = positions.findIndex((position) => {
    const canonicalPosition = serializeReaderBookmarkLocator(position, "CBZ")
    return canonicalPosition.href === canonicalBookmark.href
  })
  if (byHref >= 0) return byHref + 1

  const position = canonicalBookmark.locations?.position
  if (
    typeof position === "number" &&
    Number.isFinite(position) &&
    position >= 1 &&
    position <= positions.length
  ) {
    return Math.floor(position)
  }
  return null
}
