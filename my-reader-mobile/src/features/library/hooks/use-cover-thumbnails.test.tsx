import type { ComponentProps } from "react"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import type { BookItem, Library } from "@/src/domain/types"
import {
  deleteBookCoverThumbnailCache,
  listBookCoverThumbnailCache,
  upsertBookCoverThumbnailCache,
} from "@/src/repos/book-cover-thumbnail-cache"
import {
  COVER_THUMBNAIL_CACHE_VERSION,
  ensureCoverThumbnailFileAsync,
  getCachedCoverThumbnailFile,
  getCachedCoverThumbnailFileByName,
} from "@/src/services/fs/cover-thumbnail-cache"

import {
  resolveCoverThumbnailPixelSize,
  useCoverThumbnails,
} from "./use-cover-thumbnails"

jest.mock("@/src/repos/book-cover-thumbnail-cache", () => ({
  deleteBookCoverThumbnailCache: jest.fn(),
  listBookCoverThumbnailCache: jest.fn(),
  upsertBookCoverThumbnailCache: jest.fn(),
}))

jest.mock("@/src/services/fs/cover-thumbnail-cache", () => ({
  COVER_THUMBNAIL_CACHE_VERSION: "v1",
  ensureCoverThumbnailFileAsync: jest.fn(),
  getCachedCoverThumbnailFile: jest.fn(),
  getCachedCoverThumbnailFileByName: jest.fn(),
}))

let library: Library
let libraryIndex = 0

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function book(id: string): BookItem {
  return {
    id,
    author: `Author ${id}`,
    coverUri: `https://example.com/${id}.jpg`,
    timestamp: `timestamp-${id}`,
    title: `Book ${id}`,
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
      },
    },
  })

  function Wrapper({
    children,
  }: {
    children: ComponentProps<typeof QueryClientProvider>["children"]
  }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  return Wrapper
}

beforeEach(() => {
  jest.clearAllMocks()
  libraryIndex += 1
  library = { id: `library-${libraryIndex}` } as Library
  jest.mocked(listBookCoverThumbnailCache).mockResolvedValue([])
  jest.mocked(getCachedCoverThumbnailFile).mockReturnValue(undefined)
  jest.mocked(getCachedCoverThumbnailFileByName).mockReturnValue(undefined)
})

describe("resolveCoverThumbnailPixelSize", () => {
  it("uses the display size scaled by device pixel ratio", () => {
    expect(resolveCoverThumbnailPixelSize(150, 214.5, 2)).toEqual({
      widthPx: 300,
      heightPx: 429,
    })
  })

  it("caps very large thumbnails while preserving aspect ratio", () => {
    expect(resolveCoverThumbnailPixelSize(400, 600, 3)).toEqual({
      widthPx: 512,
      heightPx: 768,
    })
  })

  it("publishes each generated thumbnail as soon as it is ready", async () => {
    const firstThumbnail = deferred<{
      fileName: string
      fileSizeBytes: number
      uri: string
    }>()
    const secondThumbnail = deferred<{
      fileName: string
      fileSizeBytes: number
      uri: string
    }>()

    jest.mocked(ensureCoverThumbnailFileAsync).mockImplementation((input) => {
      if (input.bookId === "1") return firstThumbnail.promise
      return secondThumbnail.promise
    })
    const books = [book("1"), book("2")]

    const { result } = renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          library,
          books,
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(2),
    )

    await act(async () => {
      firstThumbnail.resolve({
        fileName: "1-first.jpg",
        fileSizeBytes: 123,
        uri: "file:///cache/1.jpg",
      })
      await firstThumbnail.promise
    })

    await waitFor(() =>
      expect(result.current.get("1")).toBe("file:///cache/1.jpg"),
    )
    expect(result.current.has("2")).toBe(false)

    await act(async () => {
      secondThumbnail.resolve({
        fileName: "2-second.jpg",
        fileSizeBytes: 456,
        uri: "file:///cache/2.jpg",
      })
      await secondThumbnail.promise
    })

    await waitFor(() =>
      expect(result.current.get("2")).toBe("file:///cache/2.jpg"),
    )
  })

  it("writes generated thumbnails to the persistent manifest", async () => {
    const size = resolveCoverThumbnailPixelSize(100, 150)
    jest.mocked(ensureCoverThumbnailFileAsync).mockResolvedValue({
      fileName: "1-generated.jpg",
      fileSizeBytes: 321,
      uri: "file:///cache/1.jpg",
    })

    renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          library,
          books: [book("1")],
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(upsertBookCoverThumbnailCache).toHaveBeenCalledWith(
        library,
        expect.objectContaining({
          bookId: 1,
          coverIdentity: "https://example.com/1.jpg|timestamp-1",
          fileName: "1-generated.jpg",
          fileSizeBytes: 321,
          heightPx: size.heightPx,
          thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
          widthPx: size.widthPx,
        }),
      ),
    )
  })

  it("uses a valid persistent manifest entry without regenerating", async () => {
    const size = resolveCoverThumbnailPixelSize(100, 150)
    jest.mocked(listBookCoverThumbnailCache).mockResolvedValue([
      {
        id: "row",
        bookId: 1,
        coverIdentity: "https://example.com/1.jpg|timestamp-1",
        thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        fileName: "1-persisted.jpg",
        fileSizeBytes: 222,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    jest.mocked(getCachedCoverThumbnailFileByName).mockReturnValue({
      fileName: "1-persisted.jpg",
      fileSizeBytes: 222,
      uri: "file:///cache/1-persisted.jpg",
    })

    const { result } = renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          library,
          books: [book("1")],
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(result.current.get("1")).toBe("file:///cache/1-persisted.jpg"),
    )
    expect(ensureCoverThumbnailFileAsync).not.toHaveBeenCalled()
  })

  it("publishes existing cached files while generation is paused", async () => {
    jest.mocked(getCachedCoverThumbnailFile).mockReturnValue({
      fileName: "1-existing.jpg",
      fileSizeBytes: 222,
      uri: "file:///cache/1-existing.jpg",
    })

    const { result } = renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          library,
          paused: true,
          books: [book("1")],
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(result.current.get("1")).toBe("file:///cache/1-existing.jpg"),
    )
    expect(ensureCoverThumbnailFileAsync).not.toHaveBeenCalled()
  })

  it("only generates thumbnails for books in the generation window", async () => {
    jest.mocked(ensureCoverThumbnailFileAsync).mockResolvedValue({
      fileName: "1-generated.jpg",
      fileSizeBytes: 123,
      uri: "file:///cache/1.jpg",
    })

    renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          generationBookIds: new Set(["1"]),
          library,
          books: [book("1"), book("2")],
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(1),
    )
    expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: "1" }),
    )
  })

  it("removes a manifest row when the cached file is gone", async () => {
    const size = resolveCoverThumbnailPixelSize(100, 150)
    jest.mocked(listBookCoverThumbnailCache).mockResolvedValue([
      {
        id: "row",
        bookId: 1,
        coverIdentity: "https://example.com/1.jpg|timestamp-1",
        thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        fileName: "missing.jpg",
        fileSizeBytes: 222,
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    jest.mocked(ensureCoverThumbnailFileAsync).mockResolvedValue({
      fileName: "1-regenerated.jpg",
      fileSizeBytes: 333,
      uri: "file:///cache/1-regenerated.jpg",
    })

    renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          library,
          books: [book("1")],
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(deleteBookCoverThumbnailCache).toHaveBeenCalledWith(library, {
        bookId: 1,
        heightPx: size.heightPx,
        thumbnailVersion: COVER_THUMBNAIL_CACHE_VERSION,
        widthPx: size.widthPx,
      }),
    )
  })

  it("keeps ready thumbnails for books that leave the visible window", async () => {
    const firstThumbnail = deferred<{
      fileName: string
      fileSizeBytes: number
      uri: string
    }>()
    const secondThumbnail = deferred<{
      fileName: string
      fileSizeBytes: number
      uri: string
    }>()
    const firstVisibleBooks = [book("1")]
    const secondVisibleBooks = [book("2")]

    jest.mocked(ensureCoverThumbnailFileAsync).mockImplementation((input) => {
      if (input.bookId === "1") return firstThumbnail.promise
      return secondThumbnail.promise
    })

    const { rerender, result } = renderHook(
      ({ books }: { books: BookItem[] }) =>
        useCoverThumbnails({
          enabled: true,
          library,
          books,
          width: 100,
          height: 150,
        }),
      { initialProps: { books: firstVisibleBooks }, wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(1),
    )

    await act(async () => {
      firstThumbnail.resolve({
        fileName: "1-first.jpg",
        fileSizeBytes: 123,
        uri: "file:///cache/1.jpg",
      })
      await firstThumbnail.promise
    })

    await waitFor(() =>
      expect(result.current.get("1")).toBe("file:///cache/1.jpg"),
    )

    act(() => {
      rerender({ books: secondVisibleBooks })
    })
    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(2),
    )

    expect(result.current.get("1")).toBe("file:///cache/1.jpg")

    act(() => {
      rerender({ books: firstVisibleBooks })
    })

    expect(result.current.get("1")).toBe("file:///cache/1.jpg")
    expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(2)
  })

  it("does not clear ready thumbnails while disabled", async () => {
    jest.mocked(ensureCoverThumbnailFileAsync).mockResolvedValue({
      fileName: "1-generated.jpg",
      fileSizeBytes: 123,
      uri: "file:///cache/1.jpg",
    })

    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useCoverThumbnails({
          enabled,
          library,
          books: [book("1")],
          width: 100,
          height: 150,
        }),
      { initialProps: { enabled: true }, wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(result.current.get("1")).toBe("file:///cache/1.jpg"),
    )

    act(() => {
      rerender({ enabled: false })
    })

    expect(result.current.get("1")).toBe("file:///cache/1.jpg")
  })

  it("does not reuse a ready thumbnail after the target size changes", async () => {
    const firstThumbnail = deferred<{
      fileName: string
      fileSizeBytes: number
      uri: string
    }>()
    const books = [book("1")]

    jest
      .mocked(ensureCoverThumbnailFileAsync)
      .mockReturnValue(firstThumbnail.promise)

    const { rerender, result } = renderHook(
      ({ width }: { width: number }) =>
        useCoverThumbnails({
          enabled: true,
          library,
          books,
          width,
          height: 150,
        }),
      { initialProps: { width: 100 }, wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(1),
    )

    await act(async () => {
      firstThumbnail.resolve({
        fileName: "1-first.jpg",
        fileSizeBytes: 123,
        uri: "file:///cache/1.jpg",
      })
      await firstThumbnail.promise
    })

    await waitFor(() =>
      expect(result.current.get("1")).toBe("file:///cache/1.jpg"),
    )

    act(() => {
      rerender({ width: 120 })
    })

    expect(result.current.has("1")).toBe(false)
  })
})
