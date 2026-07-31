import { useCallback, useEffect, useMemo, useRef } from "react"

import { useQuery } from "@tanstack/react-query"

import {
  COVER_THUMBNAIL_GENERATED_FLUSH_DELAY_MS,
  COVER_THUMBNAIL_GENERATION_CONCURRENCY,
} from "@/src/config/library-list-performance"
import type { BookItem, Library } from "@/src/domain/types"
import {
  deleteBookCoverThumbnailCache,
  listBookCoverThumbnailCache,
  type BookCoverThumbnailCache,
  upsertBookCoverThumbnailCache,
} from "@/src/services/core/content"
import { queryKeys } from "@/src/services/query/query-keys"
import {
  COVER_THUMBNAIL_CACHE_VERSION,
  getCachedCoverThumbnailFile,
  getCachedCoverThumbnailFileByName,
  type CoverThumbnailCacheInput,
} from "@/src/services/fs/cover-thumbnail-cache"
import {
  coverThumbnailSizeKey,
  resolveCoverThumbnailPixelSize,
  selectNearestCoverThumbnailSize,
  uniqueCoverThumbnailSizes,
  type CoverThumbnailSize,
} from "@/src/features/library/utils/cover-thumbnail-profiles"
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
export { resolveCoverThumbnailPixelSize }

type UseCoverThumbnailsInput = {
  enabled: boolean
  backgroundGenerationBookIds?: ReadonlySet<string>
  generateMissing?: boolean
  generationConcurrency?: number
  generationBookIds?: ReadonlySet<string>
  paused?: boolean
  thumbnailSizes?: readonly CoverThumbnailSize[]
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
  return `${libraryId ?? ""}:${coverThumbnailSizeKey(size)}`
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

function manifestEntryKey(bookId: string | number, size: CoverThumbnailSize) {
  return `${coverThumbnailSizeKey(size)}:${bookId}`
}

function createManifestBySizeAndBookId(
  rows: BookCoverThumbnailCache[] | undefined,
): Map<string, BookCoverThumbnailCache> {
  const next = new Map<string, BookCoverThumbnailCache>()
  for (const row of rows ?? []) {
    next.set(
      manifestEntryKey(row.bookId, {
        heightPx: row.heightPx,
        widthPx: row.widthPx,
      }),
      row,
    )
  }
  return next
}

function createThumbnailSizes(
  displaySize: CoverThumbnailSize,
  thumbnailSizes: readonly CoverThumbnailSize[] | undefined,
): CoverThumbnailSize[] {
  const candidates = uniqueCoverThumbnailSizes(
    thumbnailSizes && thumbnailSizes.length > 0
      ? thumbnailSizes
      : [displaySize],
  )
  const activeSize = selectNearestCoverThumbnailSize(displaySize, candidates)
  const activeKey = coverThumbnailSizeKey(activeSize)
  return [
    activeSize,
    ...candidates.filter((size) => coverThumbnailSizeKey(size) !== activeKey),
  ]
}

function numericBookId(bookId: string): number | null {
  const value = Number(bookId)
  return Number.isFinite(value) && value > 0 ? value : null
}

export function useCoverThumbnails({
  backgroundGenerationBookIds,
  enabled,
  generateMissing = true,
  generationConcurrency = COVER_THUMBNAIL_GENERATION_CONCURRENCY,
  generationBookIds,
  paused = false,
  thumbnailSizes,
  library,
  books,
  width,
  height,
}: UseCoverThumbnailsInput): string {
  const displaySize = resolveCoverThumbnailPixelSize(width, height)
  const sizes = useMemo(
    () => createThumbnailSizes(displaySize, thumbnailSizes),
    [displaySize.heightPx, displaySize.widthPx, thumbnailSizes],
  )
  const size = sizes[0] ?? displaySize
  const companionSizes = useMemo(() => sizes.slice(1), [sizes])
  const sizeSignature = sizes.map(coverThumbnailSizeKey).join("|")
  const libraryId = library?.id
  const scopeKey = createThumbnailScopeKey(libraryId, size)
  const manifestQuery = useQuery({
    queryKey: queryKeys.bookCoverThumbnailCacheProfiles(
      libraryId,
      sizeSignature,
      COVER_THUMBNAIL_CACHE_VERSION,
    ),
    queryFn: async () => {
      if (!library) return []
      const rowsBySize = await Promise.all(
        sizes.map((candidateSize) =>
          listBookCoverThumbnailCache(library, {
            heightPx: candidateSize.heightPx,
            thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
            widthPx: candidateSize.widthPx,
          }),
        ),
      )
      return rowsBySize.flat()
    },
    enabled: !!library,
    // The sidecar DB is the manifest source of truth. Keep this stale so a
    // persisted React Query cache never becomes the long-lived authority.
    staleTime: 0,
  })
  const manifestBySizeAndBookId = useMemo(
    () => createManifestBySizeAndBookId(manifestQuery.data),
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
    if (enabled && !paused && generateMissing) {
      scheduleGeneratedThumbnailsFlush()
    } else if (flushGeneratedThumbnailsTimerRef.current) {
      clearTimeout(flushGeneratedThumbnailsTimerRef.current)
      flushGeneratedThumbnailsTimerRef.current = null
    }
  }, [enabled, generateMissing, paused, scheduleGeneratedThumbnailsFlush])

  useEffect(() => {
    if (!generateMissing) return
    coverThumbnailGenerationQueue.setConcurrency(generationConcurrency)
  }, [generateMissing, generationConcurrency])

  useEffect(() => {
    if (!generateMissing) return
    coverThumbnailGenerationQueue.setPaused(!enabled || paused)
    return () => {
      coverThumbnailGenerationQueue.setPaused(true)
    }
  }, [enabled, generateMissing, paused])

  useEffect(() => {
    if (!generateMissing) return

    return coverThumbnailGenerationQueue.subscribe((result) => {
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

      if (result.scopeKey !== scopeKeyRef.current) {
        setCoverThumbnailSessionEntries(result.scopeKey, [
          {
            bookId: result.bookId,
            identity: result.identity,
            uri: result.file.uri,
          },
        ])
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
    })
  }, [generateMissing, scheduleGeneratedThumbnailsFlush])

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
      const manifestRow = manifestReady
        ? manifestBySizeAndBookId.get(manifestEntryKey(book.id, size))
        : null
      let activeReady = sessionEntry?.identity === identity

      if (!activeReady && manifestRow?.coverIdentity === input.coverIdentity) {
        const manifestFile = getCachedCoverThumbnailFileByName({
          fileName: manifestRow.fileName,
          heightPx: input.heightPx,
          libraryId,
          widthPx: input.widthPx,
        })

        if (manifestFile) {
          visibleEntries.push({
            bookId: book.id,
            identity,
            uri: manifestFile.uri,
          })
          activeReady = true
        } else {
          const id = numericBookId(book.id)
          if (id !== null) {
            staleManifestRows.push({ bookId: id, input })
          }
        }
      }

      if (!activeReady) {
        const cachedFile = getCachedCoverThumbnailFile(input)
        if (cachedFile) {
          visibleEntries.push({
            bookId: book.id,
            identity,
            uri: cachedFile.uri,
          })
          activeReady = true
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
        }
      }

      const companionThumbnails: CoverThumbnailGenerationRequest["companionThumbnails"] =
        []
      for (const companionSize of companionSizes) {
        const companionInput = createThumbnailInput(
          libraryId,
          book,
          companionSize,
        )
        if (!companionInput) continue

        const companionScopeKey = createThumbnailScopeKey(
          libraryId,
          companionSize,
        )
        const companionIdentity = createThumbnailIdentity(
          companionScopeKey,
          companionInput,
        )
        const companionManifestRow = manifestReady
          ? manifestBySizeAndBookId.get(
              manifestEntryKey(book.id, companionSize),
            )
          : null
        let companionReady = false

        if (
          companionManifestRow?.coverIdentity === companionInput.coverIdentity
        ) {
          const companionManifestFile = getCachedCoverThumbnailFileByName({
            fileName: companionManifestRow.fileName,
            heightPx: companionInput.heightPx,
            libraryId,
            widthPx: companionInput.widthPx,
          })
          if (companionManifestFile) {
            companionReady = true
          } else {
            const id = numericBookId(book.id)
            if (id !== null) {
              staleManifestRows.push({ bookId: id, input: companionInput })
            }
          }
        }

        if (!companionReady) {
          const companionCachedFile =
            getCachedCoverThumbnailFile(companionInput)
          if (companionCachedFile) {
            companionReady = true
            const id = numericBookId(book.id)
            if (
              id !== null &&
              (!companionManifestRow ||
                companionManifestRow.coverIdentity !==
                  companionInput.coverIdentity)
            ) {
              void upsertBookCoverThumbnailCache(activeLibrary, {
                bookId: id,
                coverIdentity: companionInput.coverIdentity,
                fileName: companionCachedFile.fileName,
                fileSizeBytes: companionCachedFile.fileSizeBytes,
                heightPx: companionInput.heightPx,
                thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
                widthPx: companionInput.widthPx,
              })
            }
          }
        }

        if (!companionReady) {
          companionThumbnails.push({
            identity: companionIdentity,
            input: companionInput,
            scopeKey: companionScopeKey,
          })
        }
      }

      const shouldGenerateBook =
        !generationBookIds || generationBookIds.has(book.id)
      const shouldGenerateBackgroundBook =
        backgroundGenerationBookIds?.has(book.id) ?? false
      const shouldGenerateCompanionBook =
        shouldGenerateBook || shouldGenerateBackgroundBook
      const request =
        !activeReady || companionThumbnails.length > 0
          ? {
              bookId: book.id,
              companionThumbnails,
              identity,
              input,
              scopeKey,
            }
          : null

      if (!request) {
        continue
      }

      if (activeReady) {
        if (manifestReady && !paused && shouldGenerateCompanionBook) {
          backgroundMissing.push(request)
        }
      } else {
        if (manifestReady && !paused) {
          if (shouldGenerateBook) {
            priorityMissing.push(request)
          } else if (shouldGenerateBackgroundBook) {
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

    if (paused || !generateMissing) {
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
    generateMissing,
    generationBookIds,
    library,
    libraryId,
    manifestReady,
    manifestBySizeAndBookId,
    paused,
    scopeKey,
    size,
    companionSizes,
  ])

  return scopeKey
}
