import {
  canonicalizeReaderLocatorForStorage,
  readerBookmarkLocatorKey,
  sameReaderBookmarkLocation,
  sortReaderBookmarks,
} from "@my-reader/tools/reader-bookmarks"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Locator } from "@readium/shared"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"
import i18n from "@/i18n"
import { serializeReaderBookmarkLocator } from "@/lib/readium/bookmarks"
import type { ReaderBookmarkDto } from "@/lib/tauri-api"
import { api } from "@/lib/tauri-api"

export type ReaderBookmark = Omit<
  ReaderBookmarkDto,
  "locator" | "createdAt" | "updatedAt"
> & {
  locator: ReaderLocator
  createdAt: number
  updatedAt: number
}

type UseReaderBookmarksOptions = {
  libraryId: string | null
  bookId: number
  format: string
  currentLocator: Locator | null
}

type BookmarkScope = {
  libraryId: string | null
  bookId: number
  format: string
}

function readerBookmarkFromDto(row: ReaderBookmarkDto): ReaderBookmark {
  return {
    ...row,
    locator: canonicalizeReaderLocatorForStorage(row.locator as ReaderLocator),
    createdAt: row.createdAt ?? 0,
    updatedAt: row.updatedAt ?? 0,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useReaderBookmarks({
  libraryId,
  bookId,
  format,
  currentLocator,
}: UseReaderBookmarksOptions) {
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([])
  const [loading, setLoading] = useState(false)
  const [mutationScope, setMutationScope] = useState<BookmarkScope | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [loadGeneration, setLoadGeneration] = useState(0)
  const mountedRef = useRef(true)
  const mutatingRef = useRef(false)
  const normalizedFormat = format.toUpperCase()
  const scope = useMemo<BookmarkScope>(
    () => ({
      libraryId,
      bookId,
      format: normalizedFormat,
    }),
    [bookId, libraryId, normalizedFormat],
  )
  const scopeRef = useRef(scope)
  useLayoutEffect(() => {
    scopeRef.current = scope
    mutatingRef.current = false
  }, [scope])
  const mutating = mutationScope === scope

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void loadGeneration
    let cancelled = false
    if (!libraryId || !normalizedFormat) {
      setBookmarks([])
      setLoading(false)
      setLoadError(null)
      setMutationError(null)
      return
    }

    setBookmarks([])
    setLoading(true)
    setLoadError(null)
    setMutationError(null)
    void api
      .listReaderBookmarks(libraryId, bookId, normalizedFormat)
      .then((rows) => {
        if (cancelled) return
        setBookmarks(sortReaderBookmarks(rows.map(readerBookmarkFromDto)))
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setLoadError(errorMessage(reason))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId, libraryId, loadGeneration, normalizedFormat])

  const storedCurrentLocator = useMemo(
    () =>
      currentLocator
        ? serializeReaderBookmarkLocator(currentLocator, normalizedFormat)
        : null,
    [currentLocator, normalizedFormat],
  )

  const scopedBookmarks = useMemo(
    () =>
      bookmarks.filter(
        (bookmark) =>
          bookmark.libraryId === libraryId &&
          bookmark.bookId === bookId &&
          bookmark.format === normalizedFormat,
      ),
    [bookId, bookmarks, libraryId, normalizedFormat],
  )

  const currentBookmark = useMemo(() => {
    if (!storedCurrentLocator) return null
    return (
      scopedBookmarks.find((bookmark) =>
        sameReaderBookmarkLocation(bookmark.locator, storedCurrentLocator),
      ) ?? null
    )
  }, [scopedBookmarks, storedCurrentLocator])

  const isCurrentScope = useCallback(
    (scope: BookmarkScope) => mountedRef.current && scopeRef.current === scope,
    [],
  )

  const reportMutationError = useCallback(
    (reason: unknown, scope: BookmarkScope) => {
      if (!isCurrentScope(scope)) return
      const message = errorMessage(reason)
      setMutationError(message)
      toast.error(i18n.t("reader.bookmarkSaveFailed"), {
        description: message,
      })
    },
    [isCurrentScope],
  )

  const deleteBookmark = useCallback(
    async (bookmark: Pick<ReaderBookmark, "locatorKey">) => {
      if (!libraryId || mutatingRef.current) return
      const mutationScope = scope
      mutatingRef.current = true
      setMutationScope(mutationScope)
      setMutationError(null)
      try {
        await api.deleteReaderBookmark(
          libraryId,
          bookId,
          normalizedFormat,
          bookmark.locatorKey,
        )
        if (isCurrentScope(mutationScope)) {
          setBookmarks((rows) =>
            rows.filter((row) => row.locatorKey !== bookmark.locatorKey),
          )
        }
      } catch (reason) {
        reportMutationError(reason, mutationScope)
      } finally {
        if (isCurrentScope(mutationScope)) {
          mutatingRef.current = false
          setMutationScope(null)
        }
      }
    },
    [
      bookId,
      isCurrentScope,
      libraryId,
      normalizedFormat,
      reportMutationError,
      scope,
    ],
  )

  const toggleCurrentBookmark = useCallback(async () => {
    if (
      !libraryId ||
      !storedCurrentLocator ||
      mutatingRef.current ||
      loading ||
      loadError
    )
      return
    if (currentBookmark) {
      await deleteBookmark(currentBookmark)
      return
    }

    const locatorKey = readerBookmarkLocatorKey(storedCurrentLocator)
    const mutationScope = scope
    mutatingRef.current = true
    setMutationScope(mutationScope)
    setMutationError(null)
    try {
      const row = await api.addReaderBookmark(
        libraryId,
        bookId,
        normalizedFormat,
        locatorKey,
        storedCurrentLocator,
      )
      if (isCurrentScope(mutationScope)) {
        setBookmarks((rows) =>
          sortReaderBookmarks([
            ...rows.filter((item) => item.locatorKey !== locatorKey),
            readerBookmarkFromDto(row),
          ]),
        )
      }
    } catch (reason) {
      reportMutationError(reason, mutationScope)
    } finally {
      if (isCurrentScope(mutationScope)) {
        mutatingRef.current = false
        setMutationScope(null)
      }
    }
  }, [
    bookId,
    currentBookmark,
    deleteBookmark,
    isCurrentScope,
    libraryId,
    loadError,
    loading,
    normalizedFormat,
    reportMutationError,
    scope,
    storedCurrentLocator,
  ])

  const retry = useCallback(() => {
    setLoadGeneration((generation) => generation + 1)
  }, [])

  return {
    bookmarks: scopedBookmarks,
    bookmarked: currentBookmark !== null,
    currentBookmarkLocatorKey: currentBookmark?.locatorKey ?? null,
    loading,
    mutating,
    error: loadError ?? mutationError,
    loadError,
    canToggle: Boolean(
      libraryId && storedCurrentLocator && !loading && !mutating && !loadError,
    ),
    retry,
    toggleCurrentBookmark,
    deleteBookmark,
  }
}
