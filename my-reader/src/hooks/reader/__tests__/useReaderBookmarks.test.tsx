import { readerBookmarkLocatorKey } from "@my-reader/tools/reader-bookmarks"
import { Locator, LocatorLocations } from "@readium/shared"
import { act, renderHook, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { serializeReaderBookmarkLocator } from "@/lib/readium/bookmarks"
import { api, type ReaderBookmarkDto } from "@/lib/tauri-api"
import { useReaderBookmarks } from "../useReaderBookmarks"

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

vi.mock("@/lib/tauri-api", () => ({
  api: {
    listReaderBookmarks: vi.fn(),
    addReaderBookmark: vi.fn(),
    deleteReaderBookmark: vi.fn(),
  },
}))

function pdfLocator(position = 3) {
  return new Locator({
    href: "/Users/me/Book.pdf",
    type: "application/pdf",
    locations: new LocatorLocations({
      fragments: [`page=${position}`],
      position,
    }),
  })
}

function bookmark(position = 3, bookId = 7): ReaderBookmarkDto {
  const locator = {
    href: "publication.pdf",
    type: "application/pdf",
    locations: {
      progression: 0,
      fragments: [`page=${position}`],
      position,
    },
  }
  return {
    id: `bookmark-${position}`,
    libraryId: "library-1",
    bookId,
    format: "PDF",
    locatorKey: readerBookmarkLocatorKey(locator),
    locator,
    createdAt: position,
    updatedAt: position,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.listReaderBookmarks).mockResolvedValue([])
  vi.mocked(api.addReaderBookmark).mockImplementation(
    async (_libraryId, bookId, _format, locatorKey, locator) => ({
      ...bookmark(locator.locations.position, bookId),
      locatorKey,
      locator,
    }),
  )
  vi.mocked(api.deleteReaderBookmark).mockResolvedValue(null)
})

describe("useReaderBookmarks", () => {
  it("should add and remove current location when bookmark is toggled", async () => {
    const { result } = renderHook(() =>
      useReaderBookmarks({
        libraryId: "library-1",
        bookId: 7,
        format: "pdf",
        currentLocator: pdfLocator(),
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    const locatorKey = readerBookmarkLocatorKey(
      serializeReaderBookmarkLocator(pdfLocator(), "PDF"),
    )

    await act(async () => {
      await result.current.toggleCurrentBookmark()
    })
    expect(api.addReaderBookmark).toHaveBeenCalledWith(
      "library-1",
      7,
      "PDF",
      locatorKey,
      expect.objectContaining({ href: "publication.pdf" }),
    )
    expect(result.current.bookmarked).toBe(true)
    expect(result.current.currentBookmarkLocatorKey).toBe(locatorKey)

    await act(async () => {
      await result.current.toggleCurrentBookmark()
    })
    expect(api.deleteReaderBookmark).toHaveBeenCalledWith(
      "library-1",
      7,
      "PDF",
      locatorKey,
    )
    expect(result.current.bookmarked).toBe(false)
    expect(result.current.currentBookmarkLocatorKey).toBeNull()
  })

  it("should ignore rapid toggle when bookmark mutation is already pending", async () => {
    let resolveAdd: ((row: ReaderBookmarkDto) => void) | undefined
    vi.mocked(api.addReaderBookmark).mockReturnValue(
      new Promise((resolve) => {
        resolveAdd = resolve
      }),
    )
    const { result } = renderHook(() =>
      useReaderBookmarks({
        libraryId: "library-1",
        bookId: 7,
        format: "PDF",
        currentLocator: pdfLocator(),
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    let first = Promise.resolve()
    await act(async () => {
      first = result.current.toggleCurrentBookmark()
      void result.current.toggleCurrentBookmark()
      await Promise.resolve()
    })
    expect(api.addReaderBookmark).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveAdd?.(bookmark())
      await first
    })
  })

  it("should clear prior bookmarks when book scope changes", async () => {
    vi.mocked(api.listReaderBookmarks).mockResolvedValueOnce([bookmark()])
    const { result, rerender } = renderHook(
      ({ bookId }) =>
        useReaderBookmarks({
          libraryId: "library-1",
          bookId,
          format: "PDF",
          currentLocator: pdfLocator(),
        }),
      { initialProps: { bookId: 7 } },
    )
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(1))

    act(() => rerender({ bookId: 8 }))

    expect(result.current.bookmarks).toEqual([])
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it("should disable toggle after list failure and recover when retried", async () => {
    vi.mocked(api.listReaderBookmarks)
      .mockRejectedValueOnce(new Error("list failed"))
      .mockResolvedValueOnce([])
    const { result } = renderHook(() =>
      useReaderBookmarks({
        libraryId: "library-1",
        bookId: 7,
        format: "PDF",
        currentLocator: pdfLocator(),
      }),
    )
    await waitFor(() => expect(result.current.error).toBe("list failed"))
    expect(result.current.canToggle).toBe(false)

    await act(async () => {
      await result.current.toggleCurrentBookmark()
    })
    expect(api.addReaderBookmark).not.toHaveBeenCalled()

    act(() => result.current.retry())
    await waitFor(() =>
      expect(api.listReaderBookmarks).toHaveBeenCalledTimes(2),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.canToggle).toBe(true)
  })

  it("should keep new scope mutation pending when old add resolves", async () => {
    let resolveOld: ((row: ReaderBookmarkDto) => void) | undefined
    let resolveCurrent: ((row: ReaderBookmarkDto) => void) | undefined
    vi.mocked(api.addReaderBookmark).mockImplementation(
      (_libraryId, bookId, _format, locatorKey, locator) =>
        new Promise((resolve) => {
          const complete = () =>
            resolve({
              ...bookmark(locator.locations.position, bookId),
              locatorKey,
              locator,
            })
          if (bookId === 7) resolveOld = complete
          else resolveCurrent = complete
        }),
    )
    const { result, rerender } = renderHook(
      ({ bookId }) =>
        useReaderBookmarks({
          libraryId: "library-1",
          bookId,
          format: "PDF",
          currentLocator: pdfLocator(),
        }),
      { initialProps: { bookId: 7 } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    let oldMutation = Promise.resolve()
    act(() => {
      oldMutation = result.current.toggleCurrentBookmark()
    })
    act(() => rerender({ bookId: 8 }))
    await waitFor(() => expect(result.current.canToggle).toBe(true))

    let currentMutation = Promise.resolve()
    act(() => {
      currentMutation = result.current.toggleCurrentBookmark()
    })
    expect(result.current.mutating).toBe(true)
    await act(async () => {
      resolveOld?.(bookmark(3, 7))
      await oldMutation
    })
    expect(result.current.mutating).toBe(true)
    expect(result.current.bookmarks).toEqual([])

    await act(async () => {
      resolveCurrent?.(bookmark(3, 8))
      await currentMutation
    })
    expect(result.current.mutating).toBe(false)
    expect(result.current.bookmarks).toHaveLength(1)
    expect(result.current.bookmarks[0]?.bookId).toBe(8)
  })

  it("should preserve new scope rows when old delete resolves", async () => {
    let resolveDelete: (() => void) | undefined
    vi.mocked(api.listReaderBookmarks)
      .mockResolvedValueOnce([bookmark(3, 7)])
      .mockResolvedValueOnce([bookmark(3, 8)])
    vi.mocked(api.deleteReaderBookmark).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = () => resolve(null)
      }),
    )
    const { result, rerender } = renderHook(
      ({ bookId }) =>
        useReaderBookmarks({
          libraryId: "library-1",
          bookId,
          format: "PDF",
          currentLocator: pdfLocator(),
        }),
      { initialProps: { bookId: 7 } },
    )
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(1))

    let deletion = Promise.resolve()
    act(() => {
      deletion = result.current.deleteBookmark(result.current.bookmarks[0])
    })
    act(() => rerender({ bookId: 8 }))
    await waitFor(() => expect(result.current.bookmarks[0]?.bookId).toBe(8))
    expect(result.current.mutating).toBe(false)

    await act(async () => {
      resolveDelete?.()
      await deletion
    })
    expect(result.current.bookmarks).toHaveLength(1)
    expect(result.current.bookmarks[0]?.bookId).toBe(8)
  })

  it("should reject stale add when scope returns through an A B A transition", async () => {
    let resolveAdd: ((row: ReaderBookmarkDto) => void) | undefined
    vi.mocked(api.addReaderBookmark).mockReturnValue(
      new Promise((resolve) => {
        resolveAdd = resolve
      }),
    )
    const { result, rerender } = renderHook(
      ({ bookId }) =>
        useReaderBookmarks({
          libraryId: "library-1",
          bookId,
          format: "PDF",
          currentLocator: pdfLocator(),
        }),
      { initialProps: { bookId: 7 } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    let staleMutation = Promise.resolve()
    act(() => {
      staleMutation = result.current.toggleCurrentBookmark()
    })
    act(() => rerender({ bookId: 8 }))
    act(() => rerender({ bookId: 7 }))
    await waitFor(() => expect(result.current.canToggle).toBe(true))

    await act(async () => {
      resolveAdd?.(bookmark(3, 7))
      await staleMutation
    })
    expect(result.current.bookmarks).toEqual([])
    expect(result.current.bookmarked).toBe(false)
  })

  it("should suppress stale mutation error after scope changes", async () => {
    let rejectAdd: ((reason: Error) => void) | undefined
    vi.mocked(api.addReaderBookmark).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectAdd = reject
      }),
    )
    const { result, rerender } = renderHook(
      ({ bookId }) =>
        useReaderBookmarks({
          libraryId: "library-1",
          bookId,
          format: "PDF",
          currentLocator: pdfLocator(),
        }),
      { initialProps: { bookId: 7 } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    let staleMutation = Promise.resolve()
    act(() => {
      staleMutation = result.current.toggleCurrentBookmark()
    })
    act(() => rerender({ bookId: 8 }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      rejectAdd?.(new Error("old bookmark failed"))
      await staleMutation
    })
    expect(result.current.error).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
