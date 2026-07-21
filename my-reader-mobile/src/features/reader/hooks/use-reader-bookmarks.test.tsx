import type { Locator } from "@my-reader/readium"
import { readerBookmarkLocatorKey } from "@my-reader/tools/reader-bookmarks"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { PropsWithChildren } from "react"

import type { ReaderBookmark } from "@/src/domain/library/reader-bookmarks"
import type { Library } from "@/src/domain/types"
import { queryKeys } from "@/src/services/query/query-keys"
import { useReaderBookmarks } from "./use-reader-bookmarks"

const mockListReaderBookmarks = jest.fn()
const mockAddReaderBookmark = jest.fn()
const mockRemoveReaderBookmark = jest.fn()

jest.mock("@/src/domain/library/reader-bookmarks", () => ({
  listReaderBookmarks: (...args: unknown[]) => mockListReaderBookmarks(...args),
  addReaderBookmark: (...args: unknown[]) => mockAddReaderBookmark(...args),
  removeReaderBookmark: (...args: unknown[]) =>
    mockRemoveReaderBookmark(...args),
}))

const library: Library = {
  id: "library-1",
  name: "Library",
  path: "/library",
  bookCount: 1,
}

function locator(position: number): Locator {
  return {
    href: "chapter.xhtml",
    type: "application/xhtml+xml",
    locations: {
      progression: 0,
      position,
      totalProgression: position / 10,
    },
  }
}

function bookmark(position: number): ReaderBookmark {
  const itemLocator = locator(position)
  return {
    id: `bookmark-${position}`,
    bookId: 7,
    format: "EPUB",
    locatorKey: readerBookmarkLocatorKey(itemLocator),
    locator: itemLocator,
    createdAt: position,
    updatedAt: position,
  }
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        {children as never}
      </QueryClientProvider>
    )
  }
  return { client, Wrapper }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe("useReaderBookmarks", () => {
  let rows: ReaderBookmark[]

  beforeEach(() => {
    jest.clearAllMocks()
    rows = []
    mockListReaderBookmarks.mockImplementation(async () => rows)
    mockAddReaderBookmark.mockImplementation(
      async (
        _library: Library,
        _bookId: number,
        _format: string,
        itemLocator: Locator,
      ) => {
        const next = bookmark(itemLocator.locations?.position ?? 1)
        rows = [...rows, next]
        return next
      },
    )
    mockRemoveReaderBookmark.mockImplementation(
      async (
        _library: Library,
        _bookId: number,
        _format: string,
        itemLocator: Locator,
      ) => {
        rows = rows.filter(
          (row) =>
            row.locator.locations?.position !== itemLocator.locations?.position,
        )
      },
    )
  })

  it("should scope the bookmark list query by library, book, and format", async () => {
    rows = [bookmark(2)]
    const { client, Wrapper } = createWrapper()
    const currentLocator = locator(2)
    const { result } = renderHook(
      () => useReaderBookmarks(library, 7, "epub", currentLocator),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(result.current.bookmarks).toHaveLength(1))

    expect(mockListReaderBookmarks).toHaveBeenCalledWith(library, 7, "EPUB")
    expect(
      client.getQueryData(queryKeys.readerBookmarks(library.id, 7, "EPUB")),
    ).toEqual(rows)
    expect(result.current.isCurrentLocationBookmarked).toBe(true)
  })

  it("should add once when the current bookmark action is tapped repeatedly while pending", async () => {
    let resolveAdd: ((value: ReaderBookmark) => void) | undefined
    mockAddReaderBookmark.mockImplementation(
      (_library, _bookId, _format, _itemLocator: Locator) =>
        new Promise<ReaderBookmark>((resolve) => {
          resolveAdd = (value) => {
            rows = [value]
            resolve(value)
          }
        }),
    )
    const { Wrapper } = createWrapper()
    const currentLocator = locator(3)
    const { result } = renderHook(
      () => useReaderBookmarks(library, 7, "EPUB", currentLocator),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.toggleCurrentBookmark()
      result.current.toggleCurrentBookmark()
    })

    await waitFor(() => expect(mockAddReaderBookmark).toHaveBeenCalledTimes(1))
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      resolveAdd?.(bookmark(3))
    })
    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
      expect(result.current.isCurrentLocationBookmarked).toBe(true)
    })
  })

  it("should block bookmark mutations when the query is loading or failed", async () => {
    const request = deferred<ReaderBookmark[]>()
    const queryError = new Error("bookmark query failed")
    mockListReaderBookmarks.mockReturnValueOnce(request.promise)
    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () => useReaderBookmarks(library, 7, "EPUB", locator(3)),
      { wrapper: Wrapper },
    )

    expect(result.current.isLoading).toBe(true)
    act(() => result.current.toggleCurrentBookmark())
    expect(mockAddReaderBookmark).not.toHaveBeenCalled()

    act(() => request.reject(queryError))
    await waitFor(() => expect(result.current.error).toBe(queryError))

    act(() => result.current.toggleCurrentBookmark())
    expect(mockAddReaderBookmark).not.toHaveBeenCalled()
  })

  it("should expose mutation errors and refetch bookmarks when retrying", async () => {
    const mutationError = new Error("bookmark write failed")
    mockAddReaderBookmark.mockRejectedValueOnce(mutationError)
    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () => useReaderBookmarks(library, 7, "EPUB", locator(3)),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.toggleCurrentBookmark())

    await waitFor(() => {
      expect(result.current.isPending).toBe(false)
      expect(result.current.error).toBe(mutationError)
    })
    const listCallsBeforeRetry = mockListReaderBookmarks.mock.calls.length

    act(() => result.current.retryBookmarks())

    await waitFor(() =>
      expect(mockListReaderBookmarks).toHaveBeenCalledTimes(
        listCallsBeforeRetry + 1,
      ),
    )
    await waitFor(() => expect(result.current.error).toBeNull())
  })

  it("should isolate pending mutations when the bookmark scope changes and returns", async () => {
    const firstMutation = deferred<ReaderBookmark>()
    const secondMutation = deferred<ReaderBookmark>()
    mockAddReaderBookmark
      .mockReturnValueOnce(firstMutation.promise)
      .mockReturnValueOnce(secondMutation.promise)
    const { Wrapper } = createWrapper()
    const currentLocator = locator(3)
    const { result, rerender } = renderHook(
      ({ bookId }: { bookId: number }) =>
        useReaderBookmarks(library, bookId, "EPUB", currentLocator),
      { initialProps: { bookId: 7 }, wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.toggleCurrentBookmark())
    await waitFor(() => expect(result.current.isPending).toBe(true))

    rerender({ bookId: 8 })
    await waitFor(() => {
      expect(mockListReaderBookmarks).toHaveBeenCalledWith(library, 8, "EPUB")
      expect(result.current.isPending).toBe(false)
    })

    rerender({ bookId: 7 })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.toggleCurrentBookmark())
    await waitFor(() => {
      expect(mockAddReaderBookmark).toHaveBeenCalledTimes(2)
      expect(result.current.isPending).toBe(true)
    })

    await act(async () => {
      firstMutation.resolve(bookmark(3))
      await firstMutation.promise
    })
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      secondMutation.resolve(bookmark(3))
      await secondMutation.promise
    })
    expect(result.current.isPending).toBe(false)
  })

  it("should ignore a previous scope error when its mutation rejects after the scope changes", async () => {
    const firstMutation = deferred<ReaderBookmark>()
    const previousScopeError = new Error("previous scope failed")
    mockAddReaderBookmark.mockReturnValueOnce(firstMutation.promise)
    const { Wrapper } = createWrapper()
    const currentLocator = locator(3)
    const { result, rerender } = renderHook(
      ({ bookId }: { bookId: number }) =>
        useReaderBookmarks(library, bookId, "EPUB", currentLocator),
      { initialProps: { bookId: 7 }, wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.toggleCurrentBookmark())
    await waitFor(() => expect(result.current.isPending).toBe(true))

    rerender({ bookId: 8 })
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isPending).toBe(false)
    })

    await act(async () => {
      firstMutation.reject(previousScopeError)
      await firstMutation.promise.catch(() => undefined)
    })

    expect(result.current.error).toBeNull()
    act(() => result.current.toggleCurrentBookmark())
    await waitFor(() => expect(mockAddReaderBookmark).toHaveBeenCalledTimes(2))
    expect(result.current.error).toBeNull()
  })

  it("should preserve the current scope error when an older scope rejects later", async () => {
    const firstMutation = deferred<ReaderBookmark>()
    const secondMutation = deferred<ReaderBookmark>()
    const previousScopeError = new Error("previous scope failed")
    const currentScopeError = new Error("current scope failed")
    mockAddReaderBookmark
      .mockReturnValueOnce(firstMutation.promise)
      .mockReturnValueOnce(secondMutation.promise)
    const { Wrapper } = createWrapper()
    const currentLocator = locator(3)
    const { result, rerender } = renderHook(
      ({ bookId }: { bookId: number }) =>
        useReaderBookmarks(library, bookId, "EPUB", currentLocator),
      { initialProps: { bookId: 7 }, wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.toggleCurrentBookmark())
    await waitFor(() => expect(result.current.isPending).toBe(true))

    rerender({ bookId: 8 })
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isPending).toBe(false)
    })
    act(() => result.current.toggleCurrentBookmark())
    await waitFor(() => expect(result.current.isPending).toBe(true))

    await act(async () => {
      secondMutation.reject(currentScopeError)
      await secondMutation.promise.catch(() => undefined)
    })
    await waitFor(() => expect(result.current.error).toBe(currentScopeError))

    await act(async () => {
      firstMutation.reject(previousScopeError)
      await firstMutation.promise.catch(() => undefined)
    })

    expect(result.current.error).toBe(currentScopeError)
  })

  it("should remove the current bookmark when it is already active", async () => {
    rows = [bookmark(4)]
    const { Wrapper } = createWrapper()
    const currentLocator = locator(4)
    const { result } = renderHook(
      () => useReaderBookmarks(library, 7, "EPUB", currentLocator),
      { wrapper: Wrapper },
    )
    await waitFor(() =>
      expect(result.current.isCurrentLocationBookmarked).toBe(true),
    )

    act(() => result.current.toggleCurrentBookmark())

    await waitFor(() =>
      expect(mockRemoveReaderBookmark).toHaveBeenCalledWith(
        library,
        7,
        "EPUB",
        currentLocator,
      ),
    )
    await waitFor(() =>
      expect(result.current.isCurrentLocationBookmarked).toBe(false),
    )
  })

  it("should use viewport visibility instead of a coarse EPUB position", async () => {
    const anchoredLocator: Locator = {
      ...locator(2),
      locations: {
        ...locator(2).locations!,
        domRange: {
          start: {
            cssSelector: "#paragraph",
            textNodeIndex: 0,
            charOffset: 18,
          },
        },
      },
    }
    rows = [
      {
        ...bookmark(2),
        locator: anchoredLocator,
        locatorKey: readerBookmarkLocatorKey(anchoredLocator),
      },
    ]
    const isLocatorVisible = jest.fn().mockResolvedValue(true)
    const currentLocator = locator(9)
    const locationResolver = {
      captureCurrentLocator: jest.fn().mockResolvedValue(null),
      isLocatorVisible,
      visibilityRevision: "large-text",
    }
    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useReaderBookmarks(
          library,
          7,
          "EPUB",
          currentLocator,
          locationResolver,
        ),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(isLocatorVisible).toHaveBeenCalled())
    await waitFor(() =>
      expect(result.current.isCurrentLocationBookmarked).toBe(true),
    )

    act(() => result.current.toggleCurrentBookmark())
    await waitFor(() =>
      expect(mockRemoveReaderBookmark).toHaveBeenCalledWith(
        library,
        7,
        "EPUB",
        anchoredLocator,
      ),
    )
  })

  it("should persist the captured center locator when adding an EPUB bookmark", async () => {
    const centerLocator: Locator = {
      ...locator(4),
      locations: {
        ...locator(4).locations!,
        domRange: {
          start: {
            cssSelector: "#center",
            textNodeIndex: 0,
            charOffset: 12,
          },
        },
      },
      text: { highlight: "中" },
    }
    const currentLocator = locator(3)
    const locationResolver = {
      captureCurrentLocator: jest.fn().mockResolvedValue(centerLocator),
      isLocatorVisible: jest.fn().mockResolvedValue(false),
    }
    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useReaderBookmarks(
          library,
          7,
          "EPUB",
          currentLocator,
          locationResolver,
        ),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.toggleCurrentBookmark()
    })

    await waitFor(() =>
      expect(mockAddReaderBookmark).toHaveBeenCalledWith(
        library,
        7,
        "EPUB",
        centerLocator,
      ),
    )
    expect(result.current.isPending).toBe(false)
  })

  it("should remove a selected bookmark independently of the current locator", async () => {
    rows = [bookmark(2), bookmark(6)]
    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () => useReaderBookmarks(library, 7, "PDF", locator(2)),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(2))

    await act(async () => {
      await result.current.removeBookmark(locator(6))
    })

    await waitFor(() =>
      expect(mockRemoveReaderBookmark).toHaveBeenCalledWith(
        library,
        7,
        "PDF",
        locator(6),
      ),
    )
    await waitFor(() =>
      expect(result.current.bookmarks.map((item) => item.id)).toEqual([
        "bookmark-2",
      ]),
    )
  })

  it("should remove selected bookmarks sequentially", async () => {
    rows = [bookmark(2), bookmark(6)]
    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () => useReaderBookmarks(library, 7, "EPUB", locator(2)),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(2))

    let firstRemoved: boolean | undefined
    let secondRemoved: boolean | undefined
    await act(async () => {
      firstRemoved = await result.current.removeBookmark(locator(2))
      secondRemoved = await result.current.removeBookmark(locator(6))
    })

    expect(firstRemoved).toBe(true)
    expect(secondRemoved).toBe(true)
    expect(mockRemoveReaderBookmark).toHaveBeenNthCalledWith(
      1,
      library,
      7,
      "EPUB",
      locator(2),
    )
    expect(mockRemoveReaderBookmark).toHaveBeenNthCalledWith(
      2,
      library,
      7,
      "EPUB",
      locator(6),
    )
    await waitFor(() => expect(result.current.bookmarks).toEqual([]))
  })
})
