import { useEffect, useMemo, useRef, useState } from "react"
import { PixelRatio } from "react-native"

import { useQuery } from "@tanstack/react-query"

import type { BookCoverUri, BookItem, Library } from "@/src/domain/types"
import {
  deleteBookCoverThumbnailCache,
  listBookCoverThumbnailCache,
  upsertBookCoverThumbnailCache,
} from "@/src/repos/book-cover-thumbnail-cache"
import { queryKeys } from "@/src/services/query/query-keys"
import {
  COVER_THUMBNAIL_CACHE_VERSION,
  ensureCoverThumbnailFileAsync,
  getCachedCoverThumbnailFile,
  getCachedCoverThumbnailFileByName,
  type CoverThumbnailCacheInput,
} from "@/src/services/fs/cover-thumbnail-cache"
import type { BookCoverThumbnailCache } from "@my-reader/db/types"

const MAX_THUMBNAIL_EDGE_PX = 768
const THUMBNAIL_GENERATION_CONCURRENCY = 4
const THUMBNAIL_IDLE_TIMEOUT_MS = 350

export type CoverThumbnailSize = {
  widthPx: number
  heightPx: number
}

type UseCoverThumbnailsInput = {
  enabled: boolean
  generationBookIds?: ReadonlySet<string>
  paused?: boolean
  library: Library | null
  books: BookItem[]
  width: number
  height: number
}

type ThumbnailEntry = {
  identity: string
  uri: string
}

type ThumbnailState = {
  scopeKey: string
  entries: Map<string, ThumbnailEntry>
}

type RequestIdleCallback = (
  callback: () => void,
  options?: { timeout?: number },
) => number
type CancelIdleCallback = (handle: number) => void

const EMPTY_THUMBNAIL_ENTRIES = new Map<string, ThumbnailEntry>()
const thumbnailSessionEntriesByScope = new Map<
  string,
  Map<string, ThumbnailEntry>
>()

export function resolveCoverThumbnailPixelSize(
  width: number,
  height: number,
  pixelRatio = PixelRatio.get(),
): CoverThumbnailSize {
  const rawWidth = Math.max(1, Math.ceil(width * pixelRatio))
  const rawHeight = Math.max(1, Math.ceil(height * pixelRatio))
  const longest = Math.max(rawWidth, rawHeight)

  if (longest <= MAX_THUMBNAIL_EDGE_PX) {
    return { widthPx: rawWidth, heightPx: rawHeight }
  }

  const scale = MAX_THUMBNAIL_EDGE_PX / longest
  return {
    widthPx: Math.max(1, Math.round(rawWidth * scale)),
    heightPx: Math.max(1, Math.round(rawHeight * scale)),
  }
}

function createThumbnailInput(
  libraryId: string,
  book: BookItem,
  size: CoverThumbnailSize,
): CoverThumbnailCacheInput | null {
  if (!book.coverUri) {
    return null
  }

  return {
    libraryId,
    bookId: book.id,
    source: book.coverUri,
    coverIdentity: createCoverIdentity(book),
    widthPx: size.widthPx,
    heightPx: size.heightPx,
  }
}

function createThumbnailScopeKey(
  libraryId: string | undefined,
  size: CoverThumbnailSize,
) {
  return `${libraryId ?? ""}:${size.widthPx}x${size.heightPx}`
}

function sourceIdentity(source: CoverThumbnailCacheInput["source"]): string {
  return typeof source === "string" ? source : source.uri
}

function createCoverIdentity(book: BookItem): string {
  if (!book.coverUri) return ""
  return [sourceIdentity(book.coverUri), book.timestamp ?? ""].join("|")
}

function createThumbnailIdentity(input: CoverThumbnailCacheInput) {
  return [
    input.libraryId,
    input.bookId,
    input.coverIdentity,
    input.widthPx,
    input.heightPx,
    COVER_THUMBNAIL_CACHE_VERSION,
  ].join("|")
}

function applyGeneratedThumbnail(
  current: ThumbnailState,
  scopeKey: string,
  bookId: string,
  identity: string,
  uri: string,
) {
  const entries =
    current.scopeKey === scopeKey ? current.entries : EMPTY_THUMBNAIL_ENTRIES
  const entry = entries.get(bookId)
  if (entry?.identity === identity && entry.uri === uri) return current

  const next = new Map(entries)
  next.set(bookId, { identity, uri })
  thumbnailSessionEntriesByScope.set(scopeKey, next)
  return { scopeKey, entries: next }
}

function getSessionEntries(scopeKey: string): Map<string, ThumbnailEntry> {
  return new Map(
    thumbnailSessionEntriesByScope.get(scopeKey) ?? EMPTY_THUMBNAIL_ENTRIES,
  )
}

function createManifestByBookId(
  rows: BookCoverThumbnailCache[] | undefined,
): Map<string, BookCoverThumbnailCache> {
  const next = new Map<string, BookCoverThumbnailCache>()
  for (const row of rows ?? []) {
    next.set(String(row.bookId), row)
  }
  return next
}

function numericBookId(bookId: string): number | null {
  const value = Number(bookId)
  return Number.isFinite(value) && value > 0 ? value : null
}

function requestThumbnailIdleCallback(callback: () => void): () => void {
  const idleApi = globalThis as typeof globalThis & {
    cancelIdleCallback?: CancelIdleCallback
    requestIdleCallback?: RequestIdleCallback
  }

  if (typeof idleApi.requestIdleCallback === "function") {
    const handle = idleApi.requestIdleCallback(callback, {
      timeout: THUMBNAIL_IDLE_TIMEOUT_MS,
    })
    return () => idleApi.cancelIdleCallback?.(handle)
  }

  const timeout = setTimeout(callback, 0)
  return () => clearTimeout(timeout)
}

export function useCoverThumbnails({
  enabled,
  generationBookIds,
  paused = false,
  library,
  books,
  width,
  height,
}: UseCoverThumbnailsInput): ReadonlyMap<string, BookCoverUri> {
  const size = useMemo(
    () => resolveCoverThumbnailPixelSize(width, height),
    [height, width],
  )
  const libraryId = library?.id
  const scopeKey = createThumbnailScopeKey(libraryId, size)
  const manifestQuery = useQuery({
    queryKey: queryKeys.bookCoverThumbnailCache(
      libraryId,
      size.widthPx,
      size.heightPx,
      COVER_THUMBNAIL_CACHE_VERSION,
    ),
    queryFn: () => {
      if (!library) return []
      return listBookCoverThumbnailCache(library, {
        heightPx: size.heightPx,
        thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
        widthPx: size.widthPx,
      })
    },
    enabled: !!library,
    // The sidecar DB is the manifest source of truth. Keep this stale so a
    // persisted React Query cache never becomes the long-lived authority.
    staleTime: 0,
  })
  const manifestByBookId = useMemo(
    () => createManifestByBookId(manifestQuery.data),
    [manifestQuery.data],
  )
  const manifestReady = manifestQuery.status !== "pending"
  const [thumbnailState, setThumbnailState] = useState<ThumbnailState>(() => ({
    entries: getSessionEntries(scopeKey),
    scopeKey,
  }))
  const activeThumbnailEntries =
    thumbnailState.scopeKey === scopeKey
      ? thumbnailState.entries
      : EMPTY_THUMBNAIL_ENTRIES
  const activeThumbnailEntriesRef = useRef(activeThumbnailEntries)
  activeThumbnailEntriesRef.current = activeThumbnailEntries
  const thumbnailUrisByBookId = useMemo(() => {
    const next = new Map<string, BookCoverUri>()
    for (const [bookId, entry] of activeThumbnailEntries) {
      next.set(bookId, entry.uri)
    }
    return next
  }, [activeThumbnailEntries])

  useEffect(() => {
    setThumbnailState((current) => {
      if (current.scopeKey === scopeKey) return current
      return { scopeKey, entries: getSessionEntries(scopeKey) }
    })
  }, [scopeKey])

  useEffect(() => {
    if (!enabled || !libraryId || !library) {
      return
    }
    const activeLibrary = library

    if (books.length === 0) {
      return
    }

    let cancelled = false
    const cancelIdleCallbacks: Array<() => void> = []
    const visibleEntries: Array<{
      bookId: string
      entry?: ThumbnailEntry
      expectedIdentity?: string
    }> = []
    const missing: Array<{
      bookId: string
      identity: string
      input: CoverThumbnailCacheInput
    }> = []
    const staleManifestRows: Array<{
      bookId: number
      input: CoverThumbnailCacheInput
    }> = []

    for (const book of books) {
      const input = createThumbnailInput(libraryId, book, size)
      if (!input) {
        visibleEntries.push({ bookId: book.id })
        continue
      }

      const identity = createThumbnailIdentity(input)
      const sessionEntry = activeThumbnailEntriesRef.current.get(book.id)
      if (sessionEntry?.identity === identity) {
        visibleEntries.push({
          bookId: book.id,
          entry: sessionEntry,
          expectedIdentity: identity,
        })
        continue
      }

      const manifestRow = manifestReady ? manifestByBookId.get(book.id) : null
      if (manifestRow?.coverIdentity === input.coverIdentity) {
        const manifestFile = getCachedCoverThumbnailFileByName({
          fileName: manifestRow.fileName,
          heightPx: size.heightPx,
          libraryId,
          widthPx: size.widthPx,
        })

        if (manifestFile) {
          visibleEntries.push({
            bookId: book.id,
            entry: { identity, uri: manifestFile.uri },
            expectedIdentity: identity,
          })
          continue
        }

        const id = numericBookId(book.id)
        if (id !== null) {
          staleManifestRows.push({ bookId: id, input })
        }
      }

      const cachedFile = getCachedCoverThumbnailFile(input)
      if (cachedFile) {
        visibleEntries.push({
          bookId: book.id,
          entry: { identity, uri: cachedFile.uri },
          expectedIdentity: identity,
        })
        const id = numericBookId(book.id)
        if (
          id !== null &&
          (!manifestRow || manifestRow.coverIdentity !== input.coverIdentity)
        ) {
          void upsertBookCoverThumbnailCache(activeLibrary, {
            bookId: id,
            coverIdentity: input.coverIdentity,
            fileName: cachedFile.fileName,
            fileSizeBytes: cachedFile.fileSizeBytes,
            heightPx: input.heightPx,
            thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
            widthPx: input.widthPx,
          })
        }
      } else {
        visibleEntries.push({
          bookId: book.id,
          expectedIdentity: identity,
        })
        // Scrolling only pauses expensive thumbnail generation. The fast path
        // above still publishes memory, manifest, and existing-file hits.
        if (
          manifestReady &&
          !paused &&
          (!generationBookIds || generationBookIds.has(book.id))
        ) {
          missing.push({ bookId: book.id, identity, input })
        }
      }
    }

    for (const stale of staleManifestRows) {
      void deleteBookCoverThumbnailCache(activeLibrary, {
        bookId: stale.bookId,
        heightPx: stale.input.heightPx,
        thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
        widthPx: stale.input.widthPx,
      })
    }

    setThumbnailState((current) => {
      const entries =
        current.scopeKey === scopeKey
          ? current.entries
          : EMPTY_THUMBNAIL_ENTRIES
      let changed = current.scopeKey !== scopeKey
      const next = new Map(entries)

      for (const { bookId, entry, expectedIdentity } of visibleEntries) {
        const currentEntry = next.get(bookId)
        if (!entry) {
          if (currentEntry && currentEntry.identity !== expectedIdentity) {
            next.delete(bookId)
            changed = true
          }
          continue
        }

        if (
          currentEntry?.identity !== entry.identity ||
          currentEntry.uri !== entry.uri
        ) {
          next.set(bookId, entry)
          changed = true
        }
      }

      if (!changed) return current
      thumbnailSessionEntriesByScope.set(scopeKey, next)
      return { scopeKey, entries: next }
    })

    if (paused || missing.length === 0) {
      return
    }

    let nextIndex = 0
    function waitForThumbnailIdle() {
      return new Promise<void>((resolve) => {
        let cancelIdleCallback: () => void
        cancelIdleCallback = requestThumbnailIdleCallback(() => {
          const index = cancelIdleCallbacks.indexOf(cancelIdleCallback)
          if (index >= 0) {
            cancelIdleCallbacks.splice(index, 1)
          }
          resolve()
        })
        cancelIdleCallbacks.push(cancelIdleCallback)
      })
    }

    async function runWorker() {
      while (!cancelled) {
        const entry = missing[nextIndex]
        nextIndex += 1

        if (!entry) return

        try {
          await waitForThumbnailIdle()
          if (cancelled) return

          const file = await ensureCoverThumbnailFileAsync(entry.input)
          if (cancelled) return

          // Do not batch generated thumbnails: a visible cell should swap from
          // fallback as soon as its derived file is ready. React still coalesces
          // nearby async updates, while this avoids a whole row changing at once.
          setThumbnailState((current) =>
            applyGeneratedThumbnail(
              current,
              scopeKey,
              entry.bookId,
              entry.identity,
              file.uri,
            ),
          )
          const bookId = numericBookId(entry.bookId)
          if (bookId !== null) {
            void upsertBookCoverThumbnailCache(activeLibrary, {
              bookId,
              coverIdentity: entry.input.coverIdentity,
              fileName: file.fileName,
              fileSizeBytes: file.fileSizeBytes,
              heightPx: entry.input.heightPx,
              thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
              widthPx: entry.input.widthPx,
            })
          }
        } catch (error) {
          if (__DEV__) {
            console.warn("[cover-thumbnail-cache] failed to build thumbnail", {
              bookId: entry.bookId,
              error,
            })
          }
        }
      }
    }

    void Promise.all(
      Array.from(
        { length: Math.min(THUMBNAIL_GENERATION_CONCURRENCY, missing.length) },
        () => runWorker(),
      ),
    )

    return () => {
      cancelled = true
      for (const cancelIdleCallback of cancelIdleCallbacks) {
        cancelIdleCallback()
      }
    }
  }, [
    books,
    enabled,
    generationBookIds,
    library,
    libraryId,
    manifestReady,
    manifestByBookId,
    paused,
    scopeKey,
    size,
  ])

  return thumbnailUrisByBookId
}
