import { useSyncExternalStore } from "react"

import type { BookItem } from "@/src/domain/types"
import { COVER_THUMBNAIL_CACHE_VERSION } from "@/src/services/fs/cover-thumbnail-cache"

type ThumbnailEntry = {
  identity: string
  uri: string
}

export type CoverThumbnailSessionEntry = ThumbnailEntry & {
  bookId: string
}

const EMPTY_THUMBNAIL_ENTRIES = new Map<string, ThumbnailEntry>()
const entriesByScope = new Map<string, Map<string, ThumbnailEntry>>()
const listenersByEntryKey = new Map<string, Set<() => void>>()

function entryKey(scopeKey: string, bookId: string) {
  return `${scopeKey}:${bookId}`
}

function notifyEntry(scopeKey: string, bookId: string): void {
  const listeners = listenersByEntryKey.get(entryKey(scopeKey, bookId))
  if (!listeners) return

  for (const listener of listeners) {
    listener()
  }
}

function getScopeEntries(scopeKey: string): Map<string, ThumbnailEntry> {
  return entriesByScope.get(scopeKey) ?? EMPTY_THUMBNAIL_ENTRIES
}

function sourceIdentity(source: BookItem["coverUri"]): string {
  if (!source) return ""
  return typeof source === "string" ? source : source.uri
}

export function createCoverThumbnailCoverIdentity(book: BookItem): string {
  if (!book.coverUri) return ""
  return [sourceIdentity(book.coverUri), book.timestamp ?? ""].join("|")
}

export function createCoverThumbnailSessionIdentity(
  scopeKey: string,
  book: BookItem,
): string | undefined {
  const coverIdentity = createCoverThumbnailCoverIdentity(book)
  if (!coverIdentity) return undefined

  return [scopeKey, book.id, coverIdentity, COVER_THUMBNAIL_CACHE_VERSION].join(
    "|",
  )
}

export function createCoverThumbnailInputIdentity(
  scopeKey: string,
  bookId: string,
  coverIdentity: string,
): string {
  return [scopeKey, bookId, coverIdentity, COVER_THUMBNAIL_CACHE_VERSION].join(
    "|",
  )
}

export function getCoverThumbnailSessionEntries(
  scopeKey: string,
): Map<string, ThumbnailEntry> {
  return new Map(getScopeEntries(scopeKey))
}

export function setCoverThumbnailSessionEntries(
  scopeKey: string,
  entries: CoverThumbnailSessionEntry[],
): void {
  if (entries.length === 0) return

  const current = new Map(getScopeEntries(scopeKey))
  const changedBookIds: string[] = []

  for (const entry of entries) {
    const currentEntry = current.get(entry.bookId)
    if (
      currentEntry?.identity === entry.identity &&
      currentEntry.uri === entry.uri
    ) {
      continue
    }

    current.set(entry.bookId, {
      identity: entry.identity,
      uri: entry.uri,
    })
    changedBookIds.push(entry.bookId)
  }

  if (changedBookIds.length === 0) return

  entriesByScope.set(scopeKey, current)
  for (const bookId of changedBookIds) {
    notifyEntry(scopeKey, bookId)
  }
}

export function getCoverThumbnailSessionUri(
  scopeKey: string | undefined,
  bookId: string,
  identity: string | undefined,
): string | undefined {
  if (!scopeKey || !identity) return undefined

  const entry = getScopeEntries(scopeKey).get(bookId)
  return entry?.identity === identity ? entry.uri : undefined
}

export function subscribeCoverThumbnailSessionUri(
  scopeKey: string | undefined,
  bookId: string,
  listener: () => void,
): () => void {
  if (!scopeKey) return () => {}

  const key = entryKey(scopeKey, bookId)
  let listeners = listenersByEntryKey.get(key)
  if (!listeners) {
    listeners = new Set()
    listenersByEntryKey.set(key, listeners)
  }
  listeners.add(listener)

  return () => {
    listeners?.delete(listener)
    if (listeners?.size === 0) {
      listenersByEntryKey.delete(key)
    }
  }
}

export function useCoverThumbnailSessionUri(
  scopeKey: string | undefined,
  book: BookItem,
): string | undefined {
  const identity = scopeKey
    ? createCoverThumbnailSessionIdentity(scopeKey, book)
    : undefined

  // This per-cover subscription replaces the previous FlashList `extraData`
  // Map update. A generated thumbnail now invalidates only its cover instead of
  // asking the virtualized list to re-run every visible cell render.
  return useSyncExternalStore(
    (listener) =>
      subscribeCoverThumbnailSessionUri(scopeKey, book.id, listener),
    () => getCoverThumbnailSessionUri(scopeKey, book.id, identity),
    () => getCoverThumbnailSessionUri(scopeKey, book.id, identity),
  )
}

export function resetCoverThumbnailSessionStoreForTests(): void {
  entriesByScope.clear()
  listenersByEntryKey.clear()
}
