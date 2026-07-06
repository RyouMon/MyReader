import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  renderHook as baseRenderHook,
  waitFor,
  type RenderHookOptions,
} from "@testing-library/react-native"
import type { ReactNode } from "react"
import { Alert } from "react-native"

import type { BookDetail } from "@my-reader/tools/types/book"

import * as downloadStore from "@/src/domain/download/download-store"
import { getBookFormatPaths } from "@/src/domain/library/calibre"
import * as shareBookFileModule from "@/src/domain/library/share-book-file"
import { useFileStates } from "@/src/domain/sync/hooks/use-file-states"
import type { Library } from "@/src/domain/types"
import { confirmDeleteLocalDownload } from "@/src/features/library/utils/delete-download"

import { useBookDetailFormats } from "../hooks/use-book-detail-formats"

jest.mock("expo-file-system", () => ({
  File: jest.fn(),
}))

jest.mock("@/src/domain/download/download-store", () => ({
  cancel: jest.fn(),
  enqueue: jest.fn(),
  isTaskErrorAlerted: jest.fn(() => false),
  markTaskErrorAlerted: jest.fn(),
  useDownloadStatusTasks: jest.fn(() => []),
}))

jest.mock("@/src/domain/library/calibre", () => ({
  getBookFormatPaths: jest.fn(),
}))

jest.mock("@/src/domain/library/share-book-file", () => ({
  resolveShareableFormat: jest.fn(),
  shareBookFile: jest.fn(),
}))

jest.mock("@/src/domain/sync/hooks/use-file-states", () => ({
  useFileStates: jest.fn(),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  libraryBookFileUri: jest.fn(
    (library: Library, relativePath: string) =>
      `file:///library/${library.id}/${relativePath}`,
  ),
}))

jest.mock("@/src/features/library/utils/delete-download", () => ({
  confirmDeleteLocalDownload: jest.fn(),
}))

jest.mock("react-i18next", () => {
  const t = (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  return {
    initReactI18next: { type: "3rdParty", init: jest.fn() },
    useTranslation: () => ({ t }),
  }
})

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

const detail = {
  id: 1,
  title: "Test Book",
  formats: ["EPUB", "PDF"],
} as unknown as BookDetail

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

async function renderHook<T, P = unknown>(
  callback: (props: P) => T,
  options?: RenderHookOptions<P>,
) {
  const result = baseRenderHook(callback, options)
  await act(async () => {})
  return result
}

function mockFile(exists: boolean, size: number | null = null) {
  const { File } = jest.requireMock("expo-file-system")
  File.mockImplementation(() => ({
    exists,
    size,
    modificationTime: null,
  }))
}

function mockFormatPaths() {
  jest.mocked(getBookFormatPaths).mockResolvedValue([
    { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
    { format: "PDF", relativePath: "Author/Test Book/Test Book.pdf" },
  ])
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("useBookDetailFormats", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(useFileStates)
      .mockReturnValue({ data: [] } as unknown as ReturnType<
        typeof useFileStates
      >)
    mockFormatPaths()
  })

  describe("local library", () => {
    it("should mark format as present when local file exists and is non-empty", async () => {
      mockFile(true, 1024)

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })
    })

    it("should mark format as absent when local file is missing", async () => {
      mockFile(false, 0)

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBeNull()
      })
    })

    it("should treat file with null size as absent when resolving book detail formats", async () => {
      mockFile(true, null)

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBeNull()
      })
    })

    it("should alert when reading local format paths fails", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest.mocked(getBookFormatPaths).mockRejectedValue(new Error("Disk error"))
      mockFile(true, 1024)

      await renderHook(() => useBookDetailFormats(localLibrary, "1", detail), {
        wrapper,
      })

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled()
      })
    })

    it("should stringify non-Error when reading local format paths fails", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest.mocked(getBookFormatPaths).mockRejectedValue("disk failure")
      mockFile(true, 1024)

      await renderHook(() => useBookDetailFormats(localLibrary, "1", detail), {
        wrapper,
      })

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          expect.any(String),
          "disk failure",
        )
      })
    })

    it("should ignore local format path updates after unmount when resolving book detail formats", async () => {
      const { promise, resolve } =
        createDeferred<Array<{ format: string; relativePath: string }>>()
      jest.mocked(getBookFormatPaths).mockReturnValue(promise)
      mockFile(true, 1024)

      const { unmount } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      unmount()
      resolve([
        { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
      ])
      await act(async () => {})
    })

    it("should ignore local format path errors after unmount when resolving book detail formats", async () => {
      const { promise, reject } =
        createDeferred<Array<{ format: string; relativePath: string }>>()
      jest.mocked(getBookFormatPaths).mockReturnValue(promise)
      mockFile(true, 1024)

      const { unmount } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      unmount()
      reject(new Error("Disk error"))
      await act(async () => {})
    })
  })

  describe("remote library", () => {
    it("should map file state rows to format info when resolving book detail formats", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          { path: "Author/Test Book/Test Book.epub", localState: "present" },
          { path: "Author/Test Book/Test Book.pdf", localState: "remote_only" },
        ],
      } as unknown as ReturnType<typeof useFileStates>)

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
        expect(result.current.formatInfoMap.PDF?.localState).toBe("remote_only")
      })
    })

    it("should clear format info when dataSourceId is missing", async () => {
      const libraryWithoutDataSource = {
        ...remoteLibrary,
        dataSourceId: undefined,
      }

      const { result } = await renderHook(
        () => useBookDetailFormats(libraryWithoutDataSource, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap).toEqual({})
      })
    })

    it("should alert when reading remote format paths fails", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest
        .mocked(getBookFormatPaths)
        .mockRejectedValue(new Error("Network error"))

      await renderHook(() => useBookDetailFormats(remoteLibrary, "1", detail), {
        wrapper,
      })

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled()
      })
    })

    it("should stringify non-Error when reading remote format paths fails", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest.mocked(getBookFormatPaths).mockRejectedValue("network failure")

      await renderHook(() => useBookDetailFormats(remoteLibrary, "1", detail), {
        wrapper,
      })

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          expect.any(String),
          "network failure",
        )
      })
    })

    it("should ignore remote format path updates after unmount when resolving book detail formats", async () => {
      const { promise, resolve } =
        createDeferred<Array<{ format: string; relativePath: string }>>()
      jest.mocked(getBookFormatPaths).mockReturnValue(promise)

      const { unmount } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      unmount()
      resolve([
        { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
      ])
      await act(async () => {})
    })

    it("should ignore remote format path errors after unmount when resolving book detail formats", async () => {
      const { promise, reject } =
        createDeferred<Array<{ format: string; relativePath: string }>>()
      jest.mocked(getBookFormatPaths).mockReturnValue(promise)

      const { unmount } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      unmount()
      reject(new Error("Network error"))
      await act(async () => {})
    })

    it("should use default empty file state rows when data is undefined", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: undefined,
      } as unknown as ReturnType<typeof useFileStates>)

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBeNull()
      })
    })
  })

  describe("download task status", () => {
    it("should update format to present when download task completes", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          {
            path: "Author/Test Book/Test Book.epub",
            localState: "remote_only",
          },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([])

      const { result, rerender } = await renderHook(
        ({ tick }: { tick: number }) => {
          void tick
          return useBookDetailFormats(remoteLibrary, "1", detail)
        },
        { wrapper, initialProps: { tick: 0 } },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe(
          "remote_only",
        )
      })

      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "done",
          error: null,
        },
      ])

      rerender({ tick: 1 })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })
    })

    it("should alert when a task errors", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest
        .mocked(useFileStates)
        .mockReturnValue({ data: [] } as unknown as ReturnType<
          typeof useFileStates
        >)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "error",
          error: "Network error",
        },
      ])

      await renderHook(() => useBookDetailFormats(remoteLibrary, "1", detail), {
        wrapper,
      })

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled()
      })
    })

    it("should use default message when task error is undefined", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest
        .mocked(useFileStates)
        .mockReturnValue({ data: [] } as unknown as ReturnType<
          typeof useFileStates
        >)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "error",
          error: null,
        },
      ])

      await renderHook(() => useBookDetailFormats(remoteLibrary, "1", detail), {
        wrapper,
      })

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled()
      })
    })

    it("should match download task by relative path when bookId differs", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          {
            path: "Author/Test Book/Test Book.epub",
            localState: "remote_only",
          },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "other-book",
          format: undefined,
          relativePath: "Author/Test Book/Test Book.epub",
          status: "done",
          error: null,
        },
      ])

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })
    })

    it("should skip update when done task format is already present", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          { path: "Author/Test Book/Test Book.epub", localState: "present" },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([])

      const { result, rerender } = await renderHook(
        ({ tick }: { tick: number }) => {
          void tick
          return useBookDetailFormats(remoteLibrary, "1", detail)
        },
        { wrapper, initialProps: { tick: 0 } },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })

      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "done",
          error: null,
        },
      ])
      rerender({ tick: 1 })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })
    })

    it("should preserve existing relativePath when done task reports a different path", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          { path: "Author/Test Book/Test Book.epub", localState: "present" },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Different/Test Book.epub",
          status: "done",
          error: null,
        },
      ])

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
        expect(result.current.formatInfoMap.EPUB?.relativePath).toBe(
          "Author/Test Book/Test Book.epub",
        )
      })
    })

    it("should ignore done task when format cannot be determined", async () => {
      jest
        .mocked(useFileStates)
        .mockReturnValue({ data: [] } as unknown as ReturnType<
          typeof useFileStates
        >)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: undefined,
          relativePath: "Unknown/Path.epub",
          status: "done",
          error: null,
        },
      ])

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap).toEqual({
          EPUB: {
            relativePath: "Author/Test Book/Test Book.epub",
            localState: null,
          },
          PDF: {
            relativePath: "Author/Test Book/Test Book.pdf",
            localState: null,
          },
        })
      })
    })

    it("should clear consumed task ids when task is removed", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          {
            path: "Author/Test Book/Test Book.epub",
            localState: "remote_only",
          },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([])

      const { result, rerender } = await renderHook(
        ({ tick }: { tick: number }) => {
          void tick
          return useBookDetailFormats(remoteLibrary, "1", detail)
        },
        { wrapper, initialProps: { tick: 0 } },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe(
          "remote_only",
        )
      })

      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "done",
          error: null,
        },
      ])
      rerender({ tick: 1 })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })

      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([])
      rerender({ tick: 2 })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })
    })

    it("should clear consumed task ids when task is no longer done", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          {
            path: "Author/Test Book/Test Book.epub",
            localState: "remote_only",
          },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([])

      const { result, rerender } = await renderHook(
        ({ tick }: { tick: number }) => {
          void tick
          return useBookDetailFormats(remoteLibrary, "1", detail)
        },
        { wrapper, initialProps: { tick: 0 } },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe(
          "remote_only",
        )
      })

      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "done",
          error: null,
        },
      ])
      rerender({ tick: 1 })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })

      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "queued",
          error: null,
        },
      ])
      rerender({ tick: 2 })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })
    })
  })

  describe("handleDownloadFormat", () => {
    it("should enqueue download when format path exists", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          {
            path: "Author/Test Book/Test Book.epub",
            localState: "remote_only",
          },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.enqueue).mockResolvedValue("task-id")

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.relativePath).toBeDefined()
      })

      await result.current.handleDownloadFormat("EPUB")

      expect(downloadStore.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ bookId: "1", format: "EPUB" }),
      )
    })

    it("should alert when format path is missing", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await result.current.handleDownloadFormat("UNKNOWN")

      expect(alertSpy).toHaveBeenCalled()
    })
    it("should alert when enqueue fails", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          {
            path: "Author/Test Book/Test Book.epub",
            localState: "remote_only",
          },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest
        .mocked(downloadStore.enqueue)
        .mockRejectedValue(new Error("Enqueue failed"))

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.relativePath).toBeDefined()
      })

      await result.current.handleDownloadFormat("EPUB")

      expect(alertSpy).toHaveBeenCalled()
    })
  })

  describe("handleDeleteFormat", () => {
    it("should confirm delete when format is present", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          { path: "Author/Test Book/Test Book.epub", localState: "present" },
        ],
      } as unknown as ReturnType<typeof useFileStates>)

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })

      result.current.handleDeleteFormat("EPUB")

      expect(confirmDeleteLocalDownload).toHaveBeenCalled()
    })

    it("should show download prompt when format is not present", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          {
            path: "Author/Test Book/Test Book.epub",
            localState: "remote_only",
          },
        ],
      } as unknown as ReturnType<typeof useFileStates>)

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe(
          "remote_only",
        )
      })

      result.current.handleDeleteFormat("EPUB")

      expect(confirmDeleteLocalDownload).not.toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("EPUB"),
      )
    })

    it("should do nothing when format is unknown", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      result.current.handleDeleteFormat("UNKNOWN")

      expect(confirmDeleteLocalDownload).not.toHaveBeenCalled()
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("should update format state and consume done tasks on delete confirm when resolving book detail formats", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          { path: "Author/Test Book/Test Book.epub", localState: "present" },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "done",
          error: null,
        },
      ])
      let onConfirmCallback: (() => void) | undefined
      jest
        .mocked(confirmDeleteLocalDownload)
        .mockImplementation((_title, _libraryId, _path, callbacks) => {
          onConfirmCallback = callbacks!.onConfirm
        })

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })

      result.current.handleDeleteFormat("EPUB")
      act(() => {
        onConfirmCallback?.()
      })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe(
          "remote_only",
        )
      })
    })

    it("should not consume task id when task is not done on delete confirm", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          { path: "Author/Test Book/Test Book.epub", localState: "present" },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      jest.mocked(downloadStore.useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "queued",
          error: null,
        },
      ])
      let onConfirmCallback: (() => void) | undefined
      jest
        .mocked(confirmDeleteLocalDownload)
        .mockImplementation((_title, _libraryId, _path, callbacks) => {
          onConfirmCallback = callbacks!.onConfirm
        })

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })

      result.current.handleDeleteFormat("EPUB")
      act(() => {
        onConfirmCallback?.()
      })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe(
          "remote_only",
        )
      })
    })

    it("should restore format state on delete error when resolving book detail formats", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          { path: "Author/Test Book/Test Book.epub", localState: "present" },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      let onErrorCallback: ((err: Error) => void) | undefined
      jest
        .mocked(confirmDeleteLocalDownload)
        .mockImplementation((_title, _libraryId, _path, callbacks) => {
          onErrorCallback = callbacks!.onError
        })

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })

      result.current.handleDeleteFormat("EPUB")
      act(() => {
        onErrorCallback?.(new Error("Delete failed"))
      })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })
    })

    it("should handle non-Error delete failure when resolving book detail formats", async () => {
      jest.mocked(useFileStates).mockReturnValue({
        data: [
          { path: "Author/Test Book/Test Book.epub", localState: "present" },
        ],
      } as unknown as ReturnType<typeof useFileStates>)
      let onErrorCallback: ((err: unknown) => void) | undefined
      jest
        .mocked(confirmDeleteLocalDownload)
        .mockImplementation((_title, _libraryId, _path, callbacks) => {
          onErrorCallback = callbacks!.onError
        })

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })

      result.current.handleDeleteFormat("EPUB")
      act(() => {
        onErrorCallback?.("plain error")
      })

      await waitFor(() => {
        expect(result.current.formatInfoMap.EPUB?.localState).toBe("present")
      })
    })
  })

  describe("handleShareFormat", () => {
    it("should share local file when resolving book detail formats", async () => {
      jest
        .mocked(shareBookFileModule.resolveShareableFormat)
        .mockResolvedValue({
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          fileUri: "file:///tmp/Test%20Book.epub",
          isLocal: true,
        })

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      await result.current.handleShareFormat("EPUB")

      expect(shareBookFileModule.shareBookFile).toHaveBeenCalledWith(
        "file:///tmp/Test%20Book.epub",
        "EPUB",
      )
    })

    it("should show download prompt when file is not local", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest
        .mocked(shareBookFileModule.resolveShareableFormat)
        .mockResolvedValue({
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          fileUri: "",
          isLocal: false,
        })

      const { result } = await renderHook(
        () => useBookDetailFormats(remoteLibrary, "1", detail),
        { wrapper },
      )

      await result.current.handleShareFormat("EPUB")

      expect(shareBookFileModule.shareBookFile).not.toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("EPUB"),
      )
    })

    it("should show alert when shareable format cannot be resolved", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest
        .mocked(shareBookFileModule.resolveShareableFormat)
        .mockResolvedValue(null)

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      await result.current.handleShareFormat("EPUB")

      expect(alertSpy).toHaveBeenCalled()
    })

    it("should do nothing when detail is null", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", null),
        { wrapper },
      )

      await result.current.handleShareFormat("EPUB")

      expect(shareBookFileModule.resolveShareableFormat).not.toHaveBeenCalled()
      expect(shareBookFileModule.shareBookFile).not.toHaveBeenCalled()
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("should ignore user cancellation when sharing", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest
        .mocked(shareBookFileModule.resolveShareableFormat)
        .mockResolvedValue({
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          fileUri: "file:///tmp/Test%20Book.epub",
          isLocal: true,
        })
      jest
        .mocked(shareBookFileModule.shareBookFile)
        .mockRejectedValue(new Error("User cancelled"))

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      await result.current.handleShareFormat("EPUB")

      expect(shareBookFileModule.shareBookFile).toHaveBeenCalled()
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("should alert when sharing fails", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest
        .mocked(shareBookFileModule.resolveShareableFormat)
        .mockResolvedValue({
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          fileUri: "file:///tmp/Test%20Book.epub",
          isLocal: true,
        })
      jest
        .mocked(shareBookFileModule.shareBookFile)
        .mockRejectedValue(new Error("Share failed"))

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      await result.current.handleShareFormat("EPUB")

      expect(alertSpy).toHaveBeenCalled()
    })

    it("should alert when sharing fails with a non-Error rejection", async () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {})
      jest
        .mocked(shareBookFileModule.resolveShareableFormat)
        .mockResolvedValue({
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          fileUri: "file:///tmp/Test%20Book.epub",
          isLocal: true,
        })
      jest
        .mocked(shareBookFileModule.shareBookFile)
        .mockRejectedValue("plain failure")

      const { result } = await renderHook(
        () => useBookDetailFormats(localLibrary, "1", detail),
        { wrapper },
      )

      await result.current.handleShareFormat("EPUB")

      expect(alertSpy).toHaveBeenCalledWith(expect.any(String), "plain failure")
    })
  })
})
