import { canonicalizeReaderLocatorForStorage } from "@my-reader/tools/reader-bookmarks"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { Locator } from "@readium/shared"

export function parseSavedLocator(data: unknown): Locator | null {
  if (data == null || typeof data !== "object") return null
  return Locator.deserialize(data) ?? null
}

export function locatorToJson(locator: Locator): Record<string, unknown> {
  const raw = locator.serialize() as Record<string, unknown>
  return canonicalizeReaderLocatorForStorage(
    raw as unknown as ReaderLocator,
  ) as Record<string, unknown>
}
