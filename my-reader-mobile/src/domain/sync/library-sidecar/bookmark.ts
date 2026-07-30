import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@my-reader/tools/types/library"

import {
  readLibrarySidecarBookmark,
  withLibrarySidecarSyncTransaction,
  type LibrarySidecarBookmarkRow,
} from "@/src/repos/library-sidecar-sync"
import { uuid } from "@/src/utils/common"
import { librarySidecarBookmarkProjections } from "./document-contract"
import { commitLibrarySidecarMutation } from "./database-store"
import { ensureLibrarySidecarIdentity } from "./identity"

function normalizedBookmarkFormat(format: string): "EPUB" | "PDF" | "CBZ" {
  const normalized = format.trim().toUpperCase()
  if (!["EPUB", "PDF", "CBZ"].includes(normalized)) {
    throw new Error("Unsupported bookmark format")
  }
  return normalized as "EPUB" | "PDF" | "CBZ"
}

function validateBookmarkIdentity(bookId: number, locatorKey: string): void {
  if (!Number.isSafeInteger(bookId) || bookId < 1 || locatorKey.length === 0) {
    throw new Error("Invalid bookmark identity")
  }
}

async function writeLocalBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  locator: ReaderLocator | null,
  present: boolean,
  nowMs: number,
): Promise<LibrarySidecarBookmarkRow | null> {
  validateBookmarkIdentity(bookId, locatorKey)
  const normalizedFormat = normalizedBookmarkFormat(format)
  if (locator && (locator.href.length === 0 || locator.type.length === 0)) {
    throw new Error("Invalid bookmark locator")
  }
  const identity = await ensureLibrarySidecarIdentity(library)
  let changed = false
  await commitLibrarySidecarMutation(library, identity, nowMs, (document) => {
    const current = librarySidecarBookmarkProjections(document).find(
      (item) =>
        item.bookId === bookId &&
        item.format === normalizedFormat &&
        item.locatorKey === locatorKey,
    )
    const currentIsPresent = current?.deletedAt === null
    if ((present && currentIsPresent) || (!present && !currentIsPresent)) {
      return null
    }
    const locatorJson =
      locator === null ? current?.locatorJson : JSON.stringify(locator)
    if (!locatorJson) throw new Error("Bookmark does not exist")
    changed = true
    return {
      type: "setBookmark",
      value: {
        id: current?.id ?? uuid(),
        bookId,
        format: normalizedFormat,
        locatorKey,
        locatorJson,
        createdAt: current?.createdAt ?? nowMs,
        deletedAt: present ? null : nowMs,
        recordedAt: nowMs,
        replicaId: identity.replicaId,
      },
    }
  })
  const row = await withLibrarySidecarSyncTransaction(library, (tx) =>
    readLibrarySidecarBookmark(tx, bookId, normalizedFormat, locatorKey),
  )
  if (changed) {
    console.info("[reading-sync] bookmark:local-write", {
      libraryId: library.id,
      libraryUuid: identity.libraryUuid,
      replicaId: identity.replicaId,
      bookId,
      format: normalizedFormat,
      locatorKey,
      present,
    })
  }
  return present ? row : null
}

export async function addLocalBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  locator: ReaderLocator,
  nowMs = Date.now(),
): Promise<LibrarySidecarBookmarkRow> {
  const row = await writeLocalBookmark(
    library,
    bookId,
    format,
    locatorKey,
    locator,
    true,
    nowMs,
  )
  if (!row) throw new Error("Bookmark add returned no row")
  return row
}

export async function removeLocalBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  nowMs = Date.now(),
): Promise<void> {
  await writeLocalBookmark(
    library,
    bookId,
    format,
    locatorKey,
    null,
    false,
    nowMs,
  )
}
