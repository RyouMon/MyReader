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
