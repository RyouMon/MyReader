import type { ComponentProps } from "react"

import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import { COVER_THUMBNAIL_GENERATION_CONCURRENCY } from "@/src/config/library-list-performance"
import type { BookItem, Library } from "@/src/domain/types"
import {
  deleteBookCoverThumbnailCache,
  listBookCoverThumbnailCache,
  upsertBookCoverThumbnailCache,
} from "@/src/services/core/content"
import {
  COVER_THUMBNAIL_CACHE_VERSION,
  ensureCoverThumbnailFilesAsync,
  ensureCoverThumbnailFileAsync,
  getCachedCoverThumbnailFile,
  getCachedCoverThumbnailFileByName,
} from "@/src/services/fs/cover-thumbnail-cache"
import { resetCoverThumbnailGenerationQueueForTests } from "../cover-thumbnail-generation-queue"
import {
  createCoverThumbnailSessionIdentity,
  getCoverThumbnailSessionUri,
  resetCoverThumbnailSessionStoreForTests,
} from "../cover-thumbnail-session-store"

import {
  resolveCoverThumbnailPixelSize,
  useCoverThumbnails,
} from "./use-cover-thumbnails"

jest.mock("@/src/services/core/content", () => ({
  deleteBookCoverThumbnailCache: jest.fn(),
  listBookCoverThumbnailCache: jest.fn(),
  upsertBookCoverThumbnailCache: jest.fn(),
}))

jest.mock("@/src/services/fs/cover-thumbnail-cache", () => ({
  COVER_THUMBNAIL_CACHE_VERSION: "v3",
  ensureCoverThumbnailFilesAsync: jest.fn(),
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

function sessionUri(
  scopeKey: string,
  targetBook: BookItem,
): string | undefined {
  return getCoverThumbnailSessionUri(
    scopeKey,
    targetBook.id,
    createCoverThumbnailSessionIdentity(scopeKey, targetBook),
  )
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

beforeAll(() => {
  notifyManager.setNotifyFunction((callback) => {
    act(() => {
      callback()
    })
  })
})

afterAll(() => {
  notifyManager.setNotifyFunction((callback) => callback())
})

beforeEach(() => {
  resetCoverThumbnailGenerationQueueForTests()
  resetCoverThumbnailSessionStoreForTests()
  jest.clearAllMocks()
  libraryIndex += 1
  library = { id: `library-${libraryIndex}` } as Library
  jest.mocked(listBookCoverThumbnailCache).mockResolvedValue([])
  jest.mocked(getCachedCoverThumbnailFile).mockReturnValue(undefined)
  jest.mocked(getCachedCoverThumbnailFileByName).mockReturnValue(undefined)
})

describe("resolveCoverThumbnailPixelSize", () => {
  it("should resolve physical pixels from the display size when generating cover thumbnails", () => {
    expect(resolveCoverThumbnailPixelSize(150, 214.5, 2)).toEqual({
      widthPx: 300,
      heightPx: 429,
    })
    expect(resolveCoverThumbnailPixelSize(400, 600, 3)).toEqual({
      heightPx: 1800,
      widthPx: 1200,
    })
  })

  it("should not generate missing thumbnails when only reusing the cover cache", async () => {
    renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          generateMissing: false,
          library,
          books: [book("1")],
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(listBookCoverThumbnailCache).toHaveBeenCalled())
    await act(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 20)
        }),
    )

    expect(ensureCoverThumbnailFileAsync).not.toHaveBeenCalled()
    expect(ensureCoverThumbnailFilesAsync).not.toHaveBeenCalled()
  })

  it("should publish generated thumbnails in batches while generation continues when generating cover thumbnails", async () => {
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
    expect(ensureCoverThumbnailFileAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bookId: "1" }),
    )
    expect(ensureCoverThumbnailFileAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ bookId: "2" }),
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
      expect(sessionUri(result.current, books[0]!)).toBe("file:///cache/1.jpg"),
    )
    expect(sessionUri(result.current, books[1]!)).toBeUndefined()

    await act(async () => {
      secondThumbnail.resolve({
        fileName: "2-second.jpg",
        fileSizeBytes: 456,
        uri: "file:///cache/2.jpg",
      })
      await secondThumbnail.promise
    })

    await waitFor(() =>
      expect(sessionUri(result.current, books[1]!)).toBe("file:///cache/2.jpg"),
    )
  })

  it("should write generated thumbnails to the persistent manifest when generating cover thumbnails", async () => {
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

  it("should use a valid persistent manifest entry without regenerating when generating cover thumbnails", async () => {
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
      expect(sessionUri(result.current, book("1"))).toBe(
        "file:///cache/1-persisted.jpg",
      ),
    )
    expect(ensureCoverThumbnailFileAsync).not.toHaveBeenCalled()
  })

  it("should publish existing cached files while generation is paused when generating cover thumbnails", async () => {
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
      expect(sessionUri(result.current, book("1"))).toBe(
        "file:///cache/1-existing.jpg",
      ),
    )
    expect(ensureCoverThumbnailFileAsync).not.toHaveBeenCalled()
  })

  it("should only generate thumbnails for books in the generation window when generating cover thumbnails", async () => {
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

  it("should respect the configured thumbnail generation concurrency when generating cover thumbnails", async () => {
    const books = Array.from(
      { length: COVER_THUMBNAIL_GENERATION_CONCURRENCY + 1 },
      (_, index) => book(String(index + 1)),
    )
    const thumbnailsByBookId = new Map(
      books.map((targetBook) => [
        targetBook.id,
        deferred<{
          fileName: string
          fileSizeBytes: number
          uri: string
        }>(),
      ]),
    )

    jest.mocked(ensureCoverThumbnailFileAsync).mockImplementation((input) => {
      return thumbnailsByBookId.get(input.bookId)!.promise
    })

    renderHook(
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
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(
        COVER_THUMBNAIL_GENERATION_CONCURRENCY,
      ),
    )

    await act(async () => {
      thumbnailsByBookId.get("1")!.resolve({
        fileName: "1-generated.jpg",
        fileSizeBytes: 123,
        uri: "file:///cache/1.jpg",
      })
      await thumbnailsByBookId.get("1")!.promise
    })

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(
        COVER_THUMBNAIL_GENERATION_CONCURRENCY + 1,
      ),
    )
    expect(ensureCoverThumbnailFileAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bookId: String(COVER_THUMBNAIL_GENERATION_CONCURRENCY + 1),
      }),
    )

    await act(async () => {
      for (const [bookId, thumbnail] of thumbnailsByBookId) {
        thumbnail.resolve({
          fileName: `${bookId}-generated.jpg`,
          fileSizeBytes: 123,
          uri: `file:///cache/${bookId}.jpg`,
        })
      }
      await Promise.allSettled(
        Array.from(
          thumbnailsByBookId.values(),
          (thumbnail) => thumbnail.promise,
        ),
      )
    })
  })

  it("should apply runtime thumbnail generation concurrency when generating cover thumbnails", async () => {
    const runtimeConcurrency = 2
    const books = [book("1"), book("2"), book("3")]
    const thumbnailsByBookId = new Map(
      books.map((targetBook) => [
        targetBook.id,
        deferred<{
          fileName: string
          fileSizeBytes: number
          uri: string
        }>(),
      ]),
    )

    jest.mocked(ensureCoverThumbnailFileAsync).mockImplementation((input) => {
      return thumbnailsByBookId.get(input.bookId)!.promise
    })

    renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          generationConcurrency: runtimeConcurrency,
          library,
          books,
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(
        runtimeConcurrency,
      ),
    )

    await act(async () => {
      thumbnailsByBookId.get("1")!.resolve({
        fileName: "1-generated.jpg",
        fileSizeBytes: 123,
        uri: "file:///cache/1.jpg",
      })
      await thumbnailsByBookId.get("1")!.promise
    })

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(
        runtimeConcurrency + 1,
      ),
    )
    expect(ensureCoverThumbnailFileAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ bookId: "3" }),
    )

    await act(async () => {
      for (const [bookId, thumbnail] of thumbnailsByBookId) {
        thumbnail.resolve({
          fileName: `${bookId}-generated.jpg`,
          fileSizeBytes: 123,
          uri: `file:///cache/${bookId}.jpg`,
        })
      }
      await Promise.allSettled(
        Array.from(
          thumbnailsByBookId.values(),
          (thumbnail) => thumbnail.promise,
        ),
      )
    })
  })

  it("should queue background thumbnails after visible-priority thumbnails when generating cover thumbnails", async () => {
    jest.mocked(ensureCoverThumbnailFileAsync).mockResolvedValue({
      fileName: "generated.jpg",
      fileSizeBytes: 123,
      uri: "file:///cache/generated.jpg",
    })

    renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          backgroundGenerationBookIds: new Set(["1", "2"]),
          generationBookIds: new Set(["1"]),
          library,
          books: [book("1"), book("2")],
          width: 100,
          height: 150,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(2),
    )
    expect(ensureCoverThumbnailFileAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bookId: "1" }),
    )
    expect(ensureCoverThumbnailFileAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ bookId: "2" }),
    )
  })

  it("should generate the nearest grid thumbnail first and then the companion profile when generating cover thumbnails", async () => {
    jest
      .mocked(ensureCoverThumbnailFilesAsync)
      .mockImplementation(async (inputs, onFile) => {
        const files = inputs.map((input) => ({
          fileName: `${input.widthPx}x${input.heightPx}.jpg`,
          fileSizeBytes: input.widthPx + input.heightPx,
          uri: `file:///cache/${input.widthPx}x${input.heightPx}.jpg`,
        }))
        files.forEach((file, index) => onFile?.(file, index, inputs[index]!))
        return files
      })

    const books = [book("1")]
    const { result } = renderHook(
      () =>
        useCoverThumbnails({
          enabled: true,
          backgroundGenerationBookIds: new Set(["1"]),
          generationBookIds: new Set(["1"]),
          library,
          books,
          thumbnailSizes: [
            { widthPx: 100, heightPx: 150 },
            { widthPx: 220, heightPx: 330 },
          ],
          width: 50,
          height: 75,
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(ensureCoverThumbnailFilesAsync).toHaveBeenCalledTimes(1),
    )
    expect(ensureCoverThumbnailFilesAsync).toHaveBeenCalledWith(
      [
        expect.objectContaining({ widthPx: 100, heightPx: 150 }),
        expect.objectContaining({ widthPx: 220, heightPx: 330 }),
      ],
      expect.any(Function),
    )
    await waitFor(() =>
      expect(sessionUri(result.current, books[0]!)).toBe(
        "file:///cache/100x150.jpg",
      ),
    )
    await waitFor(() =>
      expect(sessionUri(`${library.id}:220x330`, books[0]!)).toBe(
        "file:///cache/220x330.jpg",
      ),
    )
    await waitFor(() =>
      expect(upsertBookCoverThumbnailCache).toHaveBeenCalledTimes(2),
    )
    expect(upsertBookCoverThumbnailCache).toHaveBeenNthCalledWith(
      2,
      library,
      expect.objectContaining({
        heightPx: 330,
        widthPx: 220,
      }),
    )
  })

  it("should defer publishing generated thumbnails while thumbnail work is paused when generating cover thumbnails", async () => {
    const firstThumbnail = deferred<{
      fileName: string
      fileSizeBytes: number
      uri: string
    }>()

    jest
      .mocked(ensureCoverThumbnailFileAsync)
      .mockReturnValue(firstThumbnail.promise)
    const books = [book("1")]

    const { rerender, result } = renderHook(
      ({ paused }: { paused: boolean }) =>
        useCoverThumbnails({
          enabled: true,
          generationBookIds: new Set(["1"]),
          paused,
          library,
          books,
          width: 100,
          height: 150,
        }),
      { initialProps: { paused: false }, wrapper: createWrapper() },
    )

    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(1),
    )

    act(() => {
      rerender({ paused: true })
    })

    await act(async () => {
      firstThumbnail.resolve({
        fileName: "1-first.jpg",
        fileSizeBytes: 123,
        uri: "file:///cache/1.jpg",
      })
      await firstThumbnail.promise
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    expect(sessionUri(result.current, books[0]!)).toBeUndefined()

    act(() => {
      rerender({ paused: false })
    })
    await waitFor(() =>
      expect(sessionUri(result.current, books[0]!)).toBe("file:///cache/1.jpg"),
    )
  })

  it("should not enqueue duplicate generation when the hook rerenders", async () => {
    const firstThumbnail = deferred<{
      fileName: string
      fileSizeBytes: number
      uri: string
    }>()

    jest
      .mocked(ensureCoverThumbnailFileAsync)
      .mockReturnValue(firstThumbnail.promise)
    const books = [book("1")]

    const { rerender } = renderHook(
      ({ width }: { width: number }) =>
        useCoverThumbnails({
          enabled: true,
          generationBookIds: new Set(["1"]),
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

    act(() => {
      rerender({ width: 100 })
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(1)

    await act(async () => {
      firstThumbnail.resolve({
        fileName: "1-first.jpg",
        fileSizeBytes: 123,
        uri: "file:///cache/1.jpg",
      })
      await firstThumbnail.promise
    })
  })

  it("should remove a manifest row when the cached file is gone", async () => {
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

  it("should keep ready thumbnails for books that leave the visible window when generating cover thumbnails", async () => {
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
      expect(sessionUri(result.current, firstVisibleBooks[0]!)).toBe(
        "file:///cache/1.jpg",
      ),
    )

    act(() => {
      rerender({ books: secondVisibleBooks })
    })
    await waitFor(() =>
      expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(2),
    )

    expect(sessionUri(result.current, firstVisibleBooks[0]!)).toBe(
      "file:///cache/1.jpg",
    )

    act(() => {
      rerender({ books: firstVisibleBooks })
    })

    expect(sessionUri(result.current, firstVisibleBooks[0]!)).toBe(
      "file:///cache/1.jpg",
    )
    expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(2)
  })

  it("should not clear ready thumbnails while disabled when generating cover thumbnails", async () => {
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
      expect(sessionUri(result.current, book("1"))).toBe("file:///cache/1.jpg"),
    )

    act(() => {
      rerender({ enabled: false })
    })

    expect(sessionUri(result.current, book("1"))).toBe("file:///cache/1.jpg")
  })

  it("should reuse a ready thumbnail after the rendered size changes when generating cover thumbnails", async () => {
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
          thumbnailSizes: [{ widthPx: 100, heightPx: 150 }],
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
      expect(sessionUri(result.current, books[0]!)).toBe("file:///cache/1.jpg"),
    )

    act(() => {
      rerender({ width: 120 })
    })

    expect(sessionUri(result.current, books[0]!)).toBe("file:///cache/1.jpg")
    expect(ensureCoverThumbnailFileAsync).toHaveBeenCalledTimes(1)
  })
})
