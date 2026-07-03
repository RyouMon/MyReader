import { useCallback, useEffect, useMemo, useRef } from "react"
import { PixelRatio } from "react-native"

import { useQuery } from "@tanstack/react-query"

import {
  COVER_THUMBNAIL_GENERATED_FLUSH_DELAY_MS,
  COVER_THUMBNAIL_MAX_EDGE_PX,
} from "@/src/config/library-list-performance"
import type { BookItem, Library } from "@/src/domain/types"
import {
  deleteBookCoverThumbnailCache,
  listBookCoverThumbnailCache,
  upsertBookCoverThumbnailCache,
} from "@/src/repos/book-cover-thumbnail-cache"
import { queryKeys } from "@/src/services/query/query-keys"
import {
  COVER_THUMBNAIL_CACHE_VERSION,
  getCachedCoverThumbnailFile,
  getCachedCoverThumbnailFileByName,
  type CoverThumbnailCacheInput,
} from "@/src/services/fs/cover-thumbnail-cache"
import {
  coverThumbnailGenerationQueue,
  type CoverThumbnailGenerationRequest,
  type CoverThumbnailGenerationResult,
} from "../cover-thumbnail-generation-queue"
import {
  createCoverThumbnailCoverIdentity,
  createCoverThumbnailInputIdentity,
  getCoverThumbnailSessionEntries,
  setCoverThumbnailSessionEntries,
  type CoverThumbnailSessionEntry,
} from "../cover-thumbnail-session-store"
import type { BookCoverThumbnailCache } from "@my-reader/db/types"

export type CoverThumbnailSize = {
  widthPx: number
  heightPx: number
}

type UseCoverThumbnailsInput = {
  enabled: boolean
  backgroundGenerationBookIds?: ReadonlySet<string>
  generationBookIds?: ReadonlySet<string>
  paused?: boolean
  library: Library | null
  books: BookItem[]
  width: number
  height: number
}

type PendingGeneratedThumbnail = Pick<
  CoverThumbnailGenerationResult,
  "bookId" | "identity" | "scopeKey"
> &
  Pick<CoverThumbnailSessionEntry, "uri">

export function resolveCoverThumbnailPixelSize(
  width: number,
  height: number,
  pixelRatio = PixelRatio.get(),
): CoverThumbnailSize {
  const rawWidth = Math.max(1, Math.ceil(width * pixelRatio))
  const rawHeight = Math.max(1, Math.ceil(height * pixelRatio))
  const longest = Math.max(rawWidth, rawHeight)

  if (longest <= COVER_THUMBNAIL_MAX_EDGE_PX) {
    return { widthPx: rawWidth, heightPx: rawHeight }
  }

  const scale = COVER_THUMBNAIL_MAX_EDGE_PX / longest
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
    coverIdentity: createCoverThumbnailCoverIdentity(book),
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

function createThumbnailIdentity(
  scopeKey: string,
  input: CoverThumbnailCacheInput,
) {
  return createCoverThumbnailInputIdentity(
    scopeKey,
    input.bookId,
    input.coverIdentity,
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

export function useCoverThumbnails({
  backgroundGenerationBookIds,
  enabled,
  generationBookIds,
  paused = false,
  library,
  books,
  width,
  height,
}: UseCoverThumbnailsInput): string {
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
  const libraryRef = useRef(library)
  const pausedRef = useRef(paused)
  const pendingGeneratedThumbnailsRef = useRef(
    new Map<string, PendingGeneratedThumbnail>(),
  )
  const flushGeneratedThumbnailsTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const scopeKeyRef = useRef(scopeKey)
  libraryRef.current = library
  pausedRef.current = !enabled || paused
  scopeKeyRef.current = scopeKey

  const flushGeneratedThumbnails = useCallback(() => {
    if (flushGeneratedThumbnailsTimerRef.current) {
      clearTimeout(flushGeneratedThumbnailsTimerRef.current)
      flushGeneratedThumbnailsTimerRef.current = null
    }
    if (pausedRef.current) {
      return
    }

    const activeScopeKey = scopeKeyRef.current
    const pending = pendingGeneratedThumbnailsRef.current
    const ready = Array.from(pending.values()).filter(
      (thumbnail) => thumbnail.scopeKey === activeScopeKey,
    )
    if (ready.length === 0) {
      return
    }

    for (const thumbnail of ready) {
      pending.delete(`${thumbnail.scopeKey}:${thumbnail.bookId}`)
    }

    setCoverThumbnailSessionEntries(
      activeScopeKey,
      ready.map((thumbnail) => ({
        bookId: thumbnail.bookId,
        identity: thumbnail.identity,
        uri: thumbnail.uri,
      })),
    )
  }, [])

  const scheduleGeneratedThumbnailsFlush = useCallback(() => {
    if (pausedRef.current || flushGeneratedThumbnailsTimerRef.current) {
      return
    }

    // Thumbnail generation finishes on background/native work. Batch store
    // notifications so cold-cache scrolling does not ask many visible covers to
    // swap fallback/image in separate commits.
    flushGeneratedThumbnailsTimerRef.current = setTimeout(
      flushGeneratedThumbnails,
      COVER_THUMBNAIL_GENERATED_FLUSH_DELAY_MS,
    )
  }, [flushGeneratedThumbnails])

  useEffect(() => {
    pendingGeneratedThumbnailsRef.current.clear()
    if (flushGeneratedThumbnailsTimerRef.current) {
      clearTimeout(flushGeneratedThumbnailsTimerRef.current)
      flushGeneratedThumbnailsTimerRef.current = null
    }
  }, [scopeKey])

  useEffect(
    () => () => {
      if (flushGeneratedThumbnailsTimerRef.current) {
        clearTimeout(flushGeneratedThumbnailsTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (enabled && !paused) {
      scheduleGeneratedThumbnailsFlush()
    } else if (flushGeneratedThumbnailsTimerRef.current) {
      clearTimeout(flushGeneratedThumbnailsTimerRef.current)
      flushGeneratedThumbnailsTimerRef.current = null
    }
  }, [enabled, paused, scheduleGeneratedThumbnailsFlush])

  useEffect(() => {
    coverThumbnailGenerationQueue.setPaused(!enabled || paused)
    return () => {
      coverThumbnailGenerationQueue.setPaused(true)
    }
  }, [enabled, paused])

  useEffect(
    () =>
      coverThumbnailGenerationQueue.subscribe((result) => {
        if (result.scopeKey !== scopeKeyRef.current) {
          return
        }

        pendingGeneratedThumbnailsRef.current.set(
          `${result.scopeKey}:${result.bookId}`,
          {
            bookId: result.bookId,
            identity: result.identity,
            scopeKey: result.scopeKey,
            uri: result.file.uri,
          },
        )
        scheduleGeneratedThumbnailsFlush()

        const activeLibrary = libraryRef.current
        const bookId = numericBookId(result.bookId)
        if (activeLibrary && bookId !== null) {
          void upsertBookCoverThumbnailCache(activeLibrary, {
            bookId,
            coverIdentity: result.input.coverIdentity,
            fileName: result.file.fileName,
            fileSizeBytes: result.file.fileSizeBytes,
            heightPx: result.input.heightPx,
            thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
            widthPx: result.input.widthPx,
          })
        }
      }),
    [scheduleGeneratedThumbnailsFlush],
  )

  useEffect(() => {
    if (!enabled || !libraryId || !library) {
      return
    }
    const activeLibrary = library

    if (books.length === 0) {
      return
    }

    const activeThumbnailEntries = getCoverThumbnailSessionEntries(scopeKey)
    const visibleEntries: CoverThumbnailSessionEntry[] = []
    const priorityMissing: CoverThumbnailGenerationRequest[] = []
    const backgroundMissing: CoverThumbnailGenerationRequest[] = []
    const staleManifestRows: Array<{
      bookId: number
      input: CoverThumbnailCacheInput
    }> = []

    for (const book of books) {
      const input = createThumbnailInput(libraryId, book, size)
      if (!input) {
        continue
      }

      const identity = createThumbnailIdentity(scopeKey, input)
      const sessionEntry = activeThumbnailEntries.get(book.id)
      if (sessionEntry?.identity === identity) {
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
            identity,
            uri: manifestFile.uri,
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
          identity,
          uri: cachedFile.uri,
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
        // Scrolling only pauses expensive thumbnail generation. The fast path
        // above still publishes memory, manifest, and existing-file hits.
        if (manifestReady && !paused) {
          const request = { bookId: book.id, identity, input, scopeKey }
          if (!generationBookIds || generationBookIds.has(book.id)) {
            priorityMissing.push(request)
          } else if (backgroundGenerationBookIds?.has(book.id)) {
            backgroundMissing.push(request)
          }
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

    setCoverThumbnailSessionEntries(scopeKey, visibleEntries)

    if (paused) {
      return
    }

    coverThumbnailGenerationQueue.enqueue([
      ...priorityMissing,
      ...backgroundMissing,
    ])
  }, [
    backgroundGenerationBookIds,
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

  return scopeKey
}
