import {
  canonicalizeReaderLocatorForStorage,
  readerBookmarkLocatorKey,
  sortReaderBookmarks,
} from "@my-reader/tools/reader-bookmarks"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"

import {
  addReaderBookmark as addCoreReaderBookmark,
  listReaderBookmarks as listCoreReaderBookmarks,
  type ReaderBookmark,
  removeReaderBookmark as removeCoreReaderBookmark,
} from "@/src/services/core/reading"
import type { Library } from "../types"

export type { ReaderBookmark } from "@/src/services/core/reading"

export async function listReaderBookmarks(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderBookmark[]> {
  return sortReaderBookmarks(
    await listCoreReaderBookmarks(library, bookId, format),
  )
}

export async function addReaderBookmark(
  library: Library,
  bookId: number,
  format: string,
  locator: ReaderLocator,
): Promise<ReaderBookmark> {
  const canonicalLocator = canonicalizeReaderLocatorForStorage(locator)
  const locatorKey = readerBookmarkLocatorKey(canonicalLocator)
  const normalizedFormat = format.toUpperCase()
  return addCoreReaderBookmark(
    library,
    bookId,
    normalizedFormat,
    locatorKey,
    canonicalLocator,
  )
}

export async function removeReaderBookmark(
  library: Library,
  bookId: number,
  format: string,
  locator: ReaderLocator,
): Promise<void> {
  const canonicalLocator = canonicalizeReaderLocatorForStorage(locator)
  const locatorKey = readerBookmarkLocatorKey(canonicalLocator)
  await removeCoreReaderBookmark(
    library,
    bookId,
    format.toUpperCase(),
    locatorKey,
  )
}
