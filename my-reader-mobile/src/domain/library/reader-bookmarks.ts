import {
  canonicalizeReaderLocatorForStorage,
  readerBookmarkLocatorKey,
  sortReaderBookmarks,
} from "@my-reader/tools/reader-bookmarks"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"

import {
  addOrReviveReaderBookmarkRow,
  listActiveReaderBookmarkRows,
  tombstoneReaderBookmarkRow,
} from "@/src/repos/bookmarks"
import { uuid } from "@/src/utils/common"
import type { Library } from "../types"

export type ReaderBookmark = {
  id: string
  bookId: number
  format: string
  locatorKey: string
  locator: ReaderLocator
  createdAt: number
  updatedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseReaderBookmarkLocatorJson(
  locatorJson: string,
): ReaderLocator | null {
  let value: unknown
  try {
    value = JSON.parse(locatorJson)
  } catch {
    return null
  }

  if (!isRecord(value)) return null
  if (typeof value.href !== "string" || value.href.length === 0) return null
  if (typeof value.type !== "string" || value.type.length === 0) return null
  return value as unknown as ReaderLocator
}

function toReaderBookmark(row: {
  id: string
  bookId: number
  format: string
  locatorKey: string
  locatorJson: string
  createdAt: number
  updatedAt: number
}): ReaderBookmark | null {
  const locator = parseReaderBookmarkLocatorJson(row.locatorJson)
  if (!locator) return null
  return {
    id: row.id,
    bookId: row.bookId,
    format: row.format,
    locatorKey: row.locatorKey,
    locator,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  }
}

export async function listReaderBookmarks(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderBookmark[]> {
  const rows = await listActiveReaderBookmarkRows(library, bookId, format)
  const parsed = rows
    .map(toReaderBookmark)
    .filter((bookmark): bookmark is ReaderBookmark => bookmark !== null)
  return sortReaderBookmarks(parsed)
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
  const row = await addOrReviveReaderBookmarkRow(library, {
    id: uuid(),
    bookId,
    format: normalizedFormat,
    locatorKey,
    locatorJson: JSON.stringify(canonicalLocator),
  })
  const bookmark = toReaderBookmark(row)
  if (!bookmark)
    throw new Error("Invalid bookmark locator returned from storage")
  return bookmark
}

export async function removeReaderBookmark(
  library: Library,
  bookId: number,
  format: string,
  locator: ReaderLocator,
): Promise<void> {
  const canonicalLocator = canonicalizeReaderLocatorForStorage(locator)
  const locatorKey = readerBookmarkLocatorKey(canonicalLocator)
  await tombstoneReaderBookmarkRow(library, {
    bookId,
    format: format.toUpperCase(),
    locatorKey,
  })
}
