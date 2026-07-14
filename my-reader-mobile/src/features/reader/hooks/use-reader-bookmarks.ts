import type { Locator } from "@my-reader/readium"
import {
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

export function useReaderBookmarks(
  library: Library | null,
  bookId: number | null,
  format: string | null,
  currentLocator: Locator | null | undefined,
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

  const isCurrentLocationBookmarked = useMemo(
    () =>
      Boolean(
        currentLocator &&
          bookmarks.some((bookmark) =>
            sameReaderBookmarkLocation(bookmark.locator, currentLocator),
          ),
      ),
    [bookmarks, currentLocator],
  )

  const toggleCurrentBookmark = useCallback(() => {
    if (!currentLocator) return
    void mutateLocator(
      isCurrentLocationBookmarked ? "remove" : "add",
      currentLocator,
    )
  }, [currentLocator, isCurrentLocationBookmarked, mutateLocator])

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
    isLoading: bookmarksQuery.isLoading,
    isPending: pendingMutationId !== null,
    error,
    retryBookmarks,
    toggleCurrentBookmark,
    removeBookmark,
  }
}
