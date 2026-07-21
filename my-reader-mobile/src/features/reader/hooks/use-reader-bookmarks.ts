import type { Locator } from "@my-reader/readium"
import {
  canonicalizeReaderLocatorForStorage,
  sameReaderBookmarkLocation,
  sortReaderBookmarks,
} from "@my-reader/tools/reader-bookmarks"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  addReaderBookmark,
  listReaderBookmarks,
  type ReaderBookmark,
  removeReaderBookmark,
} from "@/src/domain/library/reader-bookmarks"
import type { Library } from "@/src/domain/types"
import { queryKeys } from "@/src/services/query/query-keys"

const EMPTY_BOOKMARKS: ReaderBookmark[] = []

type BookmarkScope = {
  library: Library
  bookId: number
  format: string
}

type BookmarkMutation = BookmarkScope & {
  action: "add" | "remove"
  locator: Locator
  pendingId: number
  scopeKey: string
}

type BookmarkMutationResult = {
  action: BookmarkMutation["action"]
  bookmark?: ReaderBookmark
  locator: Locator
}

type PendingMutation = {
  id: number
  scopeKey: string
}

type ScopedMutationError = {
  error: Error
  scopeKey: string
}

type BookmarkLocationResolver = {
  captureCurrentLocator: () => Promise<Locator | null>
  isLocatorVisible: (locator: Locator) => Promise<boolean>
  visibilityRevision?: string
}

type BookmarkVisibilityRequest = {
  candidates: ReaderBookmark[]
  isLocatorVisible: BookmarkLocationResolver["isLocatorVisible"]
  key: string
}

type BookmarkVisibilityResult = {
  requestKey: string
  locatorKey: string | null
}

export function useReaderBookmarks(
  library: Library | null,
  bookId: number | null,
  format: string | null,
  currentLocator: Locator | null | undefined,
  locationResolver?: BookmarkLocationResolver,
) {
  const queryClient = useQueryClient()
  const normalizedFormat = format?.toUpperCase() ?? null
  const scope = useMemo<BookmarkScope | null>(() => {
    if (!library || bookId == null || !normalizedFormat) return null
    return { library, bookId, format: normalizedFormat }
  }, [bookId, library, normalizedFormat])
  const scopeKey = useMemo(
    () =>
      scope
        ? JSON.stringify([scope.library.id, scope.bookId, scope.format])
        : null,
    [scope],
  )
  const activeScopeKeyRef = useRef(scopeKey)
  useLayoutEffect(() => {
    activeScopeKeyRef.current = scopeKey
  }, [scopeKey])
  const queryKey = queryKeys.readerBookmarks(
    scope?.library.id,
    scope?.bookId,
    scope?.format,
  )

  const bookmarksQuery = useQuery({
    queryKey,
    enabled: scope !== null,
    queryFn: () => {
      if (!scope) return Promise.resolve([])
      return listReaderBookmarks(scope.library, scope.bookId, scope.format)
    },
  })
  const bookmarks = bookmarksQuery.data ?? EMPTY_BOOKMARKS
  const nextPendingIdRef = useRef(0)
  const pendingMutationRef = useRef<PendingMutation | null>(null)
  const capturePendingRef = useRef(false)
  const [capturePending, setCapturePending] = useState(false)
  const [pendingMutationId, setPendingMutationId] = useState<number | null>(
    null,
  )
  const [mutationError, setMutationError] =
    useState<ScopedMutationError | null>(null)

  const mutation = useMutation({
    mutationFn: async (
      input: BookmarkMutation,
    ): Promise<BookmarkMutationResult> => {
      if (input.action === "add") {
        const bookmark = await addReaderBookmark(
          input.library,
          input.bookId,
          input.format,
          input.locator,
        )
        return { action: input.action, bookmark, locator: input.locator }
      }

      await removeReaderBookmark(
        input.library,
        input.bookId,
        input.format,
        input.locator,
      )
      return { action: input.action, locator: input.locator }
    },
    onSuccess: (result, input) => {
      const mutationQueryKey = queryKeys.readerBookmarks(
        input.library.id,
        input.bookId,
        input.format,
      )
      queryClient.setQueryData<ReaderBookmark[]>(
        mutationQueryKey,
        (current = []) =>
          result.action === "add" && result.bookmark
            ? sortReaderBookmarks([...current, result.bookmark])
            : current.filter(
                (bookmark) =>
                  !sameReaderBookmarkLocation(bookmark.locator, result.locator),
              ),
      )
    },
    onError: (error, input) => {
      if (
        input.scopeKey !== activeScopeKeyRef.current ||
        input.pendingId !== nextPendingIdRef.current
      ) {
        return
      }
      setMutationError({ error, scopeKey: input.scopeKey })
    },
    onSettled: (_data, _error, input) => {
      if (pendingMutationRef.current?.id === input.pendingId) {
        pendingMutationRef.current = null
        setPendingMutationId((current) =>
          current === input.pendingId ? null : current,
        )
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.readerBookmarks(
          input.library.id,
          input.bookId,
          input.format,
        ),
      })
    },
  })
  const mutateBookmark = mutation.mutateAsync
  const resetMutation = mutation.reset
  const refetchBookmarks = bookmarksQuery.refetch
  const previousScopeKeyRef = useRef(scopeKey)

  useEffect(() => {
    if (previousScopeKeyRef.current === scopeKey) return

    previousScopeKeyRef.current = scopeKey
    resetMutation()
    setMutationError(null)
    capturePendingRef.current = false
    setCapturePending(false)
    const pendingMutation = pendingMutationRef.current
    if (!pendingMutation || pendingMutation.scopeKey === scopeKey) return

    pendingMutationRef.current = null
    setPendingMutationId((current) =>
      current === pendingMutation.id ? null : current,
    )
  }, [resetMutation, scopeKey])

  const error =
    bookmarksQuery.error ??
    (mutationError?.scopeKey === scopeKey ? mutationError.error : null)

  const [visibleBookmarkResult, setVisibleBookmarkResult] =
    useState<BookmarkVisibilityResult | null>(null)
  const currentStoredLocator = useMemo(
    () =>
      currentLocator
        ? canonicalizeReaderLocatorForStorage(currentLocator)
        : null,
    [currentLocator],
  )
  const isLocatorVisible = locationResolver?.isLocatorVisible
  const visibilityRevision = locationResolver?.visibilityRevision
  const visibilityRequest = useMemo<BookmarkVisibilityRequest | null>(() => {
    if (!currentStoredLocator || !isLocatorVisible) return null
    const candidates = bookmarks.filter(
      (bookmark) =>
        bookmark.locator.href === currentStoredLocator.href &&
        bookmark.locator.type === currentStoredLocator.type &&
        bookmark.locator.locations?.domRange,
    )
    return {
      candidates,
      isLocatorVisible,
      key: JSON.stringify([
        currentStoredLocator.href,
        currentStoredLocator.locations,
        candidates.map((bookmark) => bookmark.locatorKey),
        visibilityRevision,
      ]),
    }
  }, [bookmarks, currentStoredLocator, isLocatorVisible, visibilityRevision])

  useEffect(() => {
    if (!visibilityRequest) return

    let cancelled = false
    void (async () => {
      let locatorKey: string | null = null
      try {
        for (const bookmark of visibilityRequest.candidates) {
          if (await visibilityRequest.isLocatorVisible(bookmark.locator)) {
            locatorKey = bookmark.locatorKey
            break
          }
        }
      } catch {
        locatorKey = null
      }
      if (!cancelled) {
        setVisibleBookmarkResult((current) =>
          current?.requestKey === visibilityRequest.key &&
          current.locatorKey === locatorKey
            ? current
            : { requestKey: visibilityRequest.key, locatorKey },
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [visibilityRequest])

  const currentBookmark = useMemo(() => {
    if (!currentLocator) return null
    if (isLocatorVisible) {
      const visibleBookmarkLocatorKey =
        visibleBookmarkResult?.requestKey === visibilityRequest?.key
          ? visibleBookmarkResult.locatorKey
          : null
      return (
        bookmarks.find(
          (bookmark) => bookmark.locatorKey === visibleBookmarkLocatorKey,
        ) ?? null
      )
    }
    return (
      bookmarks.find((bookmark) =>
        sameReaderBookmarkLocation(bookmark.locator, currentLocator),
      ) ?? null
    )
  }, [
    bookmarks,
    currentLocator,
    isLocatorVisible,
    visibilityRequest,
    visibleBookmarkResult,
  ])

  const mutateLocator = useCallback(
    async (
      action: BookmarkMutation["action"],
      locator: Locator,
    ): Promise<boolean> => {
      if (
        !scope ||
        !scopeKey ||
        bookmarksQuery.isLoading ||
        error ||
        pendingMutationRef.current
      ) {
        return false
      }

      const pendingId = nextPendingIdRef.current + 1
      nextPendingIdRef.current = pendingId
      pendingMutationRef.current = { id: pendingId, scopeKey }
      setPendingMutationId(pendingId)
      try {
        await mutateBookmark({
          ...scope,
          action,
          locator,
          pendingId,
          scopeKey,
        })
        return true
      } catch {
        return false
      }
    },
    [bookmarksQuery.isLoading, error, mutateBookmark, scope, scopeKey],
  )

  const isCurrentLocationBookmarked = currentBookmark !== null

  const toggleCurrentBookmark = useCallback(() => {
    if (!currentLocator) return
    if (currentBookmark) {
      void mutateLocator("remove", currentBookmark.locator)
      return
    }
    if (!locationResolver) {
      void mutateLocator("add", currentLocator)
      return
    }
    if (!scopeKey || capturePendingRef.current) return
    const captureScopeKey = scopeKey
    capturePendingRef.current = true
    setCapturePending(true)
    return (async () => {
      try {
        const locator = await locationResolver.captureCurrentLocator()
        if (locator && activeScopeKeyRef.current === captureScopeKey) {
          await mutateLocator("add", locator)
        }
      } catch (reason) {
        if (activeScopeKeyRef.current === captureScopeKey) {
          setMutationError({
            error: reason instanceof Error ? reason : new Error(String(reason)),
            scopeKey: captureScopeKey,
          })
        }
      } finally {
        if (activeScopeKeyRef.current === captureScopeKey) {
          capturePendingRef.current = false
          setCapturePending(false)
        }
      }
    })()
  }, [
    currentBookmark,
    currentLocator,
    locationResolver,
    mutateLocator,
    scopeKey,
  ])

  const removeBookmark = useCallback(
    (locator: Locator) => mutateLocator("remove", locator),
    [mutateLocator],
  )

  const retryBookmarks = useCallback(() => {
    resetMutation()
    setMutationError(null)
    void refetchBookmarks()
  }, [refetchBookmarks, resetMutation])

  return {
    bookmarks,
    isCurrentLocationBookmarked,
    currentBookmarkLocatorKey: currentBookmark?.locatorKey ?? null,
    isLoading: bookmarksQuery.isLoading,
    isPending: capturePending || pendingMutationId !== null,
    error,
    retryBookmarks,
    toggleCurrentBookmark,
    removeBookmark,
  }
}
