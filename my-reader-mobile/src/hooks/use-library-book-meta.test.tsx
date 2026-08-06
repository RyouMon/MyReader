import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react-native"
import type { ReactNode } from "react"

import { useDownloadStatusTasks } from "@/src/domain/download/download-store"
import { getAllBookFormats } from "@/src/domain/library/catalog"
import { useFileStates } from "@/src/domain/sync/hooks/use-file-states"
import { useBookUploadBookUuid } from "@/src/domain/sync/book-upload-store"
import type { BookItem, Library } from "@/src/domain/types"

import { useLibraryBookMeta } from "./use-library-book-meta"

jest.mock("@/src/domain/download/download-store", () => ({
  useDownloadStatusTasks: jest.fn(),
}))

jest.mock("@/src/domain/library/catalog", () => ({
  getAllBookFormats: jest.fn(),
}))

jest.mock("@/src/domain/sync/hooks/use-file-states", () => ({
  useFileStates: jest.fn(),
}))

jest.mock("@/src/domain/sync/book-upload-store", () => ({
  useBookUploadBookUuid: jest.fn(),
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 0, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={client}>
      {children as never}
    </QueryClientProvider>
  )
}

const localLibrary: Library = {
  id: "lib-local",
  name: "Local Library",
  path: "/local",
  sourceType: "local",
} as Library

const remoteLibrary: Library = {
  id: "lib-remote",
  name: "Remote Library",
  path: "/remote",
  sourceType: "webdav",
  dataSourceId: "ds-1",
} as Library

const baseBook: BookItem = {
  id: "1",
  calibreId: 1,
  title: "Test Book",
  author: "Author",
  path: "Author/Test Book",
}

function makeBookWithFormatPolicy(
  readableFormats: string[],
  formats = readableFormats,
): BookItem {
  return {
    ...baseBook,
    formats,
    readableFormats,
    preferredFormat: readableFormats[0] ?? null,
  }
}

const fileStateRows = [
  {
    path: "Author/Test Book/Test Book.epub",
    localState: "present",
    isLocallyAvailable: true,
  },
  {
    path: "Author/Test Book/Test Book.pdf",
    localState: "present",
    isLocallyAvailable: true,
  },
]

describe("useLibraryBookMeta", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useDownloadStatusTasks).mockReturnValue([])
    jest.mocked(useBookUploadBookUuid).mockReturnValue(undefined)
    jest
      .mocked(useFileStates)
      .mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<
        typeof useFileStates
      >)
    jest.mocked(getAllBookFormats).mockResolvedValue({})
  })

  it("should return empty meta when no library is selected", async () => {
    const books = [baseBook]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(null, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookFormatsById).toEqual({})
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "downloaded",
      })
      expect(result.current.bookCanDeleteDownloadById).toEqual({ "1": false })
      expect(result.current.bookFormatMetaById.get("1")).toEqual({
        readableFormats: [],
        effectiveFormat: undefined,
      })
    })

    unmount()
  })

  it("should treat local library books as downloaded and use embedded formats when resolving library book metadata", async () => {
    const books = [makeBookWithFormatPolicy(["EPUB", "PDF"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(localLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "downloaded",
      })
      expect(result.current.bookFormatMetaById.get("1")).toEqual({
        readableFormats: ["EPUB", "PDF"],
        effectiveFormat: "EPUB",
      })
      expect(result.current.bookFormatsById).toEqual({})
    })

    unmount()
  })

  it("should fall back to bookFormatsById query when embedded formats are missing", async () => {
    jest.mocked(getAllBookFormats).mockResolvedValue({ "1": ["PDF"] })

    const books = [baseBook]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(localLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookFormatMetaById.get("1")).toEqual({
        readableFormats: ["PDF"],
        effectiveFormat: "PDF",
      })
    })

    unmount()
  })

  it("should use selected format when it exists in readable formats", async () => {
    const books = [makeBookWithFormatPolicy(["EPUB", "PDF"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(localLibrary, books, { "1": "pdf" }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookFormatMetaById.get("1")).toEqual({
        readableFormats: ["EPUB", "PDF"],
        effectiveFormat: "PDF",
      })
    })

    unmount()
  })

  it("should ignore selected format when it is not readable", async () => {
    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(localLibrary, books, { "1": "pdf" }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookFormatMetaById.get("1")).toEqual({
        readableFormats: ["EPUB"],
        effectiveFormat: "EPUB",
      })
    })

    unmount()
  })

  it("should fall back to empty file states when data is undefined", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "notDownloaded",
      })
    })

    unmount()
  })

  it("should compute remote download status from file state rows when resolving library book metadata", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: fileStateRows,
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)

    const books = [makeBookWithFormatPolicy(["EPUB", "PDF"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, { "1": "epub" }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "downloaded",
      })
      expect(result.current.bookCanDeleteDownloadById).toEqual({ "1": true })
      expect(result.current.bookFormatMetaById.get("1")).toEqual({
        readableFormats: ["EPUB", "PDF"],
        effectiveFormat: "EPUB",
      })
    })

    unmount()
  })

  it("should show a staged remote MyReader upload as pending while keeping it locally readable", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Books/book-uuid/book.epub",
          localState: "dirty_push",
          isLocallyAvailable: true,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)
    const book = {
      ...makeBookWithFormatPolicy(["EPUB"]),
      path: "Books/book-uuid",
      uuid: "book-uuid",
    }
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, [book], {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "downloaded",
      })
      expect(result.current.bookTransferStatusById).toEqual({
        "1": "uploadPending",
      })
      expect(result.current.bookLocalOnlyById).toEqual({ "1": true })
      expect(result.current.bookCanUploadById).toEqual({ "1": true })
      expect(result.current.bookCanDeleteDownloadById).toEqual({ "1": false })
    })

    unmount()
  })

  it("should show a remote-library file that exists only locally as upload pending", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Books/local-only/book.epub",
          localState: "local_only",
          isLocallyAvailable: true,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)
    const book = {
      ...makeBookWithFormatPolicy(["EPUB"]),
      path: "Books/local-only",
    }

    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, [book], {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookTransferStatusById).toEqual({
        "1": "uploadPending",
      })
      expect(result.current.bookLocalOnlyById).toEqual({ "1": true })
      expect(result.current.bookCanUploadById).toEqual({ "1": true })
      expect(result.current.bookCanDeleteDownloadById).toEqual({ "1": false })
    })

    unmount()
  })

  it("should show a dashed cloud when the pending upload source is missing", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Books/source-missing/book.epub",
          localState: "source_missing",
          isLocallyAvailable: false,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)
    const book = {
      ...makeBookWithFormatPolicy(["EPUB"]),
      path: "Books/source-missing",
    }

    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, [book], {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookTransferStatusById).toEqual({
        "1": "uploadPending",
      })
      expect(result.current.bookLocalOnlyById).toEqual({ "1": false })
      expect(result.current.bookCanUploadById).toEqual({ "1": false })
      expect(result.current.bookCanDeleteDownloadById).toEqual({ "1": false })
    })

    unmount()
  })

  it("should show an up-arrow upload state only for the book currently uploading", async () => {
    jest.mocked(useBookUploadBookUuid).mockReturnValue("book-uuid")
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Books/The Dispossessed (222222)/The Dispossessed.epub",
          localState: "dirty_push",
          isLocallyAvailable: true,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)
    const book = {
      ...makeBookWithFormatPolicy(["EPUB"]),
      path: "Books/The Dispossessed (222222)",
      uuid: "book-uuid",
    }

    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, [book], {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookTransferStatusById).toEqual({
        "1": "uploading",
      })
      expect(result.current.bookCanUploadById).toEqual({ "1": false })
    })

    unmount()
  })

  it("should mark remote book as not downloaded when effective format is missing", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Author/Test Book/Test Book.epub",
          localState: "present",
          isLocallyAvailable: true,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)

    const books = [makeBookWithFormatPolicy(["EPUB", "PDF"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, { "1": "pdf" }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "notDownloaded",
      })
    })

    unmount()
  })

  it("should ignore file state rows that do not belong to the book when resolving library book metadata", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Author/Other Book/Other Book.epub",
          localState: "present",
          isLocallyAvailable: true,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "notDownloaded",
      })
    })

    unmount()
  })

  it("should ignore file state rows with non-downloaded local states when resolving library book metadata", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Author/Test Book/Test Book.epub",
          localState: "remote_only",
          isLocallyAvailable: false,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "notDownloaded",
      })
    })

    unmount()
  })

  it("should mark remote book as not downloaded when dataSourceId is missing", async () => {
    const libraryWithoutDataSource = {
      ...remoteLibrary,
      dataSourceId: undefined,
    }
    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(libraryWithoutDataSource, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "notDownloaded",
      })
    })

    unmount()
  })

  it("should reflect downloading status from active tasks when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: "1",
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB", "PDF"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, { "1": "epub" }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "downloading",
      })
      expect(result.current.bookActiveFormatsById.get("1")).toBe("EPUB")
    })

    unmount()
  })

  it("should reflect downloaded status when task is done", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: "1",
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        status: "done",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "downloaded",
      })
    })

    unmount()
  })

  it("should resolve active format by path when task has no bookId", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: undefined,
        format: undefined,
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBe("EPUB")
    })

    unmount()
  })

  it("should ignore tasks with irrelevant statuses when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: "1",
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        status: "failed",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBeUndefined()
    })

    unmount()
  })

  it("should ignore path-lookup tasks with irrelevant statuses when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: undefined,
        format: undefined,
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
      {
        id: "task-2",
        libraryId: "lib-remote",
        bookId: undefined,
        format: undefined,
        relativePath: "Author/Test Book/Test Book.epub",
        status: "failed",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBe("EPUB")
    })

    unmount()
  })

  it("should skip tasks whose path does not match any book when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: undefined,
        format: undefined,
        relativePath: "Unknown/Path/book.epub",
        status: "downloading",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBeUndefined()
    })

    unmount()
  })

  it("should aggregate multiple tasks for the same book when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: "1",
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
      {
        id: "task-2",
        libraryId: "lib-remote",
        bookId: "1",
        format: "PDF",
        relativePath: "Author/Test Book/Test Book.pdf",
        status: "queued",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB", "PDF"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, { "1": "epub" }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBe("EPUB")
    })

    unmount()
  })

  it("should skip book-bound tasks during path lookup when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: undefined,
        format: undefined,
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
      {
        id: "task-2",
        libraryId: "lib-remote",
        bookId: "1",
        format: "PDF",
        relativePath: "Author/Test Book/Test Book.pdf",
        status: "downloading",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB", "PDF"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBeDefined()
    })

    unmount()
  })

  it("should skip path-lookup tasks for other libraries when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: undefined,
        format: undefined,
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
      {
        id: "task-2",
        libraryId: "other-lib",
        bookId: undefined,
        format: undefined,
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBe("EPUB")
    })

    unmount()
  })

  it("should aggregate multiple path-lookup tasks for the same book when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: undefined,
        format: undefined,
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
      {
        id: "task-2",
        libraryId: "lib-remote",
        bookId: undefined,
        format: undefined,
        relativePath: "Author/Test Book/Test Book.pdf",
        status: "queued",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB", "PDF"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, { "1": "epub" }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBe("EPUB")
    })

    unmount()
  })

  it("should mark remote book without readable formats as not downloaded when resolving library book metadata", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Author/Test Book/Test Book.mobi",
          localState: "present",
          isLocallyAvailable: true,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)

    const books = [makeBookWithFormatPolicy([], ["MOBI"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "notDownloaded",
      })
    })

    unmount()
  })

  it("should keep downloaded status when an active download exists", async () => {
    jest.mocked(useFileStates).mockReturnValue({
      data: [
        {
          path: "Author/Test Book/Test Book.epub",
          localState: "present",
          isLocallyAvailable: true,
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useFileStates>)
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: "1",
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookDownloadStatusById).toEqual({
        "1": "downloaded",
      })
    })

    unmount()
  })

  it("should skip active tasks with unresolvable format when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "lib-remote",
        bookId: "1",
        format: undefined,
        relativePath: "Author/Test Book/Test Book",
        status: "downloading",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBeUndefined()
    })

    unmount()
  })

  it("should skip tasks for other libraries when resolving library book metadata", async () => {
    jest.mocked(useDownloadStatusTasks).mockReturnValue([
      {
        id: "task-1",
        libraryId: "other-lib",
        bookId: "1",
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        status: "downloading",
      },
    ] as unknown as ReturnType<typeof useDownloadStatusTasks>)

    const books = [makeBookWithFormatPolicy(["EPUB"])]
    const { result, unmount } = renderHook(
      () => useLibraryBookMeta(remoteLibrary, books, {}),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.bookActiveFormatsById.get("1")).toBeUndefined()
    })

    unmount()
  })
})
