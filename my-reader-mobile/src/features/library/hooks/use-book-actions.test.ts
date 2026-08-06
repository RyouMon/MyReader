import { act, renderHook, waitFor } from "@testing-library/react-native"

import { router } from "expo-router"

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  cancel as cancelDownload,
  enqueue as enqueueDownload,
  useDownloadStatusTasks,
} from "@/src/domain/download/download-store"
import { getBookFormatPaths } from "@/src/domain/library/catalog"
import { deleteManagedBook } from "@/src/domain/library/hooks/library-actions"
import {
  resolveShareableFormat,
  shareBookFile,
} from "@/src/domain/library/share-book-file"
import { requestPendingBookUploads } from "@/src/domain/sync/book-upload-store"
import type { BookItem, Library } from "@/src/domain/types"
import { confirmDeleteLocalDownload } from "@/src/features/library/utils/delete-download"
import type { FileState as FileStateRow } from "@/src/services/core/content"

import { useBookActions } from "./use-book-actions"

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

jest.mock("@/src/domain/download/download-store", () => ({
  cancel: jest.fn(),
  enqueue: jest.fn(),
  useDownloadStatusTasks: jest.fn(),
}))

jest.mock("@/src/domain/library/catalog", () => ({
  getBookFormatPaths: jest.fn(),
}))

jest.mock("@/src/domain/library/hooks/library-actions", () => ({
  deleteManagedBook: jest.fn(),
}))

jest.mock("@/src/domain/library/share-book-file", () => ({
  resolveShareableFormat: jest.fn(),
  shareBookFile: jest.fn(),
}))

jest.mock("@/src/domain/sync/book-upload-store", () => ({
  requestPendingBookUploads: jest.fn(),
}))

jest.mock("@/src/features/library/utils/delete-download", () => ({
  confirmDeleteLocalDownload: jest.fn(),
}))

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

const managedLibrary: Library = {
  id: "lib-managed",
  name: "My Library",
  path: "/managed",
  libraryType: "myreader",
  bookCount: 1,
}

const remoteManagedLibrary: Library = {
  id: "lib-managed-remote",
  name: "Remote MyReader Library",
  path: "/managed-remote",
  sourceType: "webdav",
  dataSourceId: "ds-1",
  libraryType: "myreader",
  bookCount: 1,
} as Library

const baseBook: BookItem = {
  id: "1",
  uuid: "book-uuid",
  calibreId: 1,
  title: "Test Book",
  author: "Author",
  path: "Author/Test Book",
}

function buildMetaMap(formats: string[] = [], effectiveFormat?: string) {
  return new Map([["1", { readableFormats: formats, effectiveFormat }]])
}

function buildFileStateBundle(
  rows: Record<
    string,
    { path: string; localState: string; isLocallyAvailable?: boolean }[]
  > = {},
) {
  const fullRows: Record<string, FileStateRow[]> = {}
  for (const [bookId, bookRows] of Object.entries(rows)) {
    fullRows[bookId] = bookRows.map((row, index) => ({
      id: `fs-${bookId}-${index}`,
      path: row.path,
      localState: row.localState as FileStateRow["localState"],
      isLocallyAvailable:
        row.isLocallyAvailable ?? row.localState === "present",
      localSha256: null,
      localSize: null,
      localMtime: null,
      updatedAt: 0,
    }))
  }
  return { rows: fullRows }
}

describe("useBookActions", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useDownloadStatusTasks).mockReturnValue([])
    jest.mocked(enqueueDownload).mockResolvedValue("task-1")
    jest.mocked(deleteManagedBook).mockResolvedValue(undefined)
  })

  describe("handleBookPress", () => {
    it("should ignore consecutive presses when within navigation debounce", () => {
      jest.useFakeTimers()

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          { "1": "downloaded" },
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookPress("1")
      result.current.handleBookPress("1")

      jest.advanceTimersByTime(1200)

      expect(router.push).toHaveBeenCalledTimes(1)

      jest.useRealTimers()
    })

    it("should treat missing download status as not downloaded when remote book is pressed", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      await act(async () => {
        result.current.handleBookPress("1")
        await Promise.resolve()
      })

      expect(enqueueDownload).toHaveBeenCalled()
      expect(router.push).not.toHaveBeenCalled()
    })

    it("should navigate to reader when local book with format is pressed", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          { "1": "downloaded" },
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookPress("1")
      expect(router.push).toHaveBeenCalledWith({
        pathname: "/reader/[id]",
        params: { id: "1", format: "EPUB" },
      })
    })

    it("should navigate to reader without format when none is selected", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          { "1": "downloaded" },
          buildMetaMap([], undefined),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookPress("1")
      expect(router.push).toHaveBeenCalledWith({
        pathname: "/reader/[id]",
        params: { id: "1" },
      })
    })

    it("should trigger download when remote book is not downloaded", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          { "1": "notDownloaded" },
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      await act(async () => {
        result.current.handleBookPress("1")
        await Promise.resolve()
      })

      expect(enqueueDownload).toHaveBeenCalledWith(
        expect.objectContaining({ bookId: "1", format: "EPUB" }),
      )
    })

    it("should open a remote book after its requested download completes", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])
      const { result, rerender } = renderHook(() =>
        useBookActions(
          [baseBook],
          { "1": "notDownloaded" },
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      act(() => result.current.handleBookPress("1"))
      await waitFor(() => expect(enqueueDownload).toHaveBeenCalled())

      jest.mocked(useDownloadStatusTasks).mockReturnValue([
        {
          id: "task-1",
          libraryId: "lib-remote",
          bookId: "1",
          format: "EPUB",
          relativePath: "Author/Test Book/Test Book.epub",
          status: "done",
        },
      ] as ReturnType<typeof useDownloadStatusTasks>)
      rerender({})

      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith({
          pathname: "/reader/[id]",
          params: { id: "1", format: "EPUB" },
        }),
      )
    })

    it("should ignore press when a menu is open", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          { "1": "downloaded" },
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          "1",
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookPress("1")
      expect(router.push).not.toHaveBeenCalled()
    })

    it("should ignore press when book is not found", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          { "1": "downloaded" },
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookPress("unknown")
      expect(router.push).not.toHaveBeenCalled()
    })
  })

  describe("handleBookMenuAction", () => {
    it("should request pending uploads when upload file action is invoked for a remote MyReader library", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          { "1": "downloaded" },
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle({
            "1": [
              {
                path: "Books/book-uuid/book.epub",
                localState: "dirty_push",
                isLocallyAvailable: true,
              },
            ],
          }),
          null,
          {},
          remoteManagedLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "uploadFile")

      expect(requestPendingBookUploads).toHaveBeenCalledWith(
        "lib-managed-remote",
        "book-uuid",
      )
    })

    it("should open the metadata editor only for a managed book", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          managedLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "editMetadata")

      expect(router.push).toHaveBeenCalledWith({
        pathname: "/library-book/edit",
        params: { id: "1" },
      })
    })

    it("should confirm before deleting a managed book", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          managedLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "deleteBook")
      const buttons = jest.mocked(showAlertWithStatusBarRestore).mock
        .calls[0]?.[2]
      buttons?.find((button) => button.style === "destructive")?.onPress?.()

      expect(deleteManagedBook).toHaveBeenCalledWith(managedLibrary, 1)
    })

    it("should navigate to book detail when detail action is invoked", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "detail")
      expect(router.push).toHaveBeenCalledWith({
        pathname: "/library-book/[id]",
        params: { id: "1" },
      })
    })

    it("should toggle favorite when toggle handler exists", () => {
      const toggle = jest.fn()
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
          toggle,
        ),
      )

      result.current.handleBookMenuAction("1", "favorite")
      expect(toggle).toHaveBeenCalledWith("1")
    })

    it("should do nothing when favorite action is invoked and toggle handler is missing", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      expect(() =>
        result.current.handleBookMenuAction("1", "favorite"),
      ).not.toThrow()
    })

    it("should do nothing when downloading for local library", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "download")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(enqueueDownload).not.toHaveBeenCalled()
    })

    it("should do nothing when downloading with invalid book id", async () => {
      const invalidBook = { ...baseBook, id: "abc" }
      const { result } = renderHook(() =>
        useBookActions(
          [invalidBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("abc", "download")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(enqueueDownload).not.toHaveBeenCalled()
    })

    it("should do nothing when downloading with no library", async () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          null,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "download")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(enqueueDownload).not.toHaveBeenCalled()
    })

    it("should do nothing when matching path is missing for selected format", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "mobi", relativePath: "Author/Test Book/Test Book.mobi" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "download")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(enqueueDownload).not.toHaveBeenCalled()
    })

    it("should show alert when download enqueue fails", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])
      jest.mocked(enqueueDownload).mockRejectedValue(new Error("Network error"))

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "download")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).toHaveBeenCalled()
    })

    it("should download a specific format when format action is invoked", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "PDF", relativePath: "Author/Test Book/Test Book.pdf" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB", "PDF"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "download:PDF")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(enqueueDownload).toHaveBeenCalledWith(
        expect.objectContaining({ bookId: "1", format: "PDF" }),
      )
    })

    it("should download effective format when no specific format is requested", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "download")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(enqueueDownload).toHaveBeenCalledWith(
        expect.objectContaining({ bookId: "1", format: "EPUB" }),
      )
    })

    it("should show alert when no readable format is available for download", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "mobi", relativePath: "Author/Test Book/Test Book.mobi" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap([], undefined),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "download")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).toHaveBeenCalled()
      expect(enqueueDownload).not.toHaveBeenCalled()
    })

    it("should cancel active downloads when cancel action is invoked", () => {
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
          status: "done",
        },
      ] as ReturnType<typeof useDownloadStatusTasks>)

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "cancelDownload")
      expect(cancelDownload).toHaveBeenCalledWith("task-1")
      expect(cancelDownload).not.toHaveBeenCalledWith("task-2")
    })

    it("should do nothing when setting default format for invalid book id", async () => {
      const invalidBook = { ...baseBook, id: "abc" }
      const { result } = renderHook(() =>
        useBookActions(
          [invalidBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          jest.fn(),
        ),
      )

      result.current.handleBookMenuAction("abc", "setDefaultFormat")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).not.toHaveBeenCalled()
    })

    it("should do nothing when setting default format with no library", async () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          null,
          jest.fn(),
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).not.toHaveBeenCalled()
    })

    it("should not crash when setFormat is missing for single format", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).toHaveBeenCalled()
    })

    it("should invoke setFormat from default format prompt when opening the default format prompt", async () => {
      jest.mocked(getBookFormatPaths).mockResolvedValue([
        { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        { format: "PDF", relativePath: "Author/Test Book/Test Book.pdf" },
      ])

      const setFormat = jest.fn()
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB", "PDF"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          setFormat,
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat")
      await new Promise((resolve) => setTimeout(resolve, 50))

      const buttons = jest.mocked(showAlertWithStatusBarRestore).mock
        .calls[0]![2] as { text: string; onPress?: () => void }[] | undefined
      const formatButton = buttons?.find((button) => button.text === "PDF")
      formatButton?.onPress?.()

      expect(setFormat).toHaveBeenCalledWith("1", "PDF")
    })

    it("should not crash when setFormat is missing in default format prompt", async () => {
      jest.mocked(getBookFormatPaths).mockResolvedValue([
        { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        { format: "PDF", relativePath: "Author/Test Book/Test Book.pdf" },
      ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB", "PDF"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat")
      await new Promise((resolve) => setTimeout(resolve, 50))

      const buttons = jest.mocked(showAlertWithStatusBarRestore).mock
        .calls[0]![2] as { text: string; onPress?: () => void }[] | undefined
      const formatButton = buttons?.find((button) => button.text === "PDF")
      expect(() => formatButton?.onPress?.()).not.toThrow()
    })

    it("should do nothing when setting default format with no setFormat handler", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      expect(() =>
        result.current.handleBookMenuAction("1", "setDefaultFormat:EPUB"),
      ).not.toThrow()
    })

    it("should set a specific default format when format action is invoked", () => {
      const setFormat = jest.fn()
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          setFormat,
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat:PDF")
      expect(setFormat).toHaveBeenCalledWith("1", "PDF")
    })

    it("should clear default format when auto selection action is invoked", () => {
      const setFormat = jest.fn()
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          setFormat,
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat:auto")
      expect(setFormat).toHaveBeenCalledWith("1", null)
    })

    it("should open default format prompt when multiple formats exist", async () => {
      jest.mocked(getBookFormatPaths).mockResolvedValue([
        { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        { format: "PDF", relativePath: "Author/Test Book/Test Book.pdf" },
      ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB", "PDF"], "EPUB"),
          buildFileStateBundle(),
          null,
          { "1": "epub" },
          localLibrary,
          jest.fn(),
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).toHaveBeenCalled()
    })

    it("should set default directly when only one format exists", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])

      const setFormat = jest.fn()
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          setFormat,
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(setFormat).toHaveBeenCalledWith("1", "EPUB")
    })

    it("should show alert when setting default format with no readable formats", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "mobi", relativePath: "Author/Test Book/Test Book.mobi" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap([], undefined),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          jest.fn(),
        ),
      )

      result.current.handleBookMenuAction("1", "setDefaultFormat")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).toHaveBeenCalled()
    })

    it("should do nothing on delete when library is missing", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle({
            "1": [
              {
                path: "Author/Test Book/Test Book.epub",
                localState: "present",
              },
            ],
          }),
          null,
          {},
          null,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "deleteDownload")
      expect(confirmDeleteLocalDownload).not.toHaveBeenCalled()
    })

    it("should do nothing on delete when rows are missing", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "deleteDownload")
      expect(confirmDeleteLocalDownload).not.toHaveBeenCalled()
    })

    it("should delete downloaded files for the book when delete action is invoked", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle({
            "1": [
              {
                path: "Author/Test Book/Test Book.epub",
                localState: "present",
              },
              {
                path: "Author/Test Book/Test Book.pdf",
                localState: "remote_only",
              },
            ],
          }),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "deleteDownload")
      expect(confirmDeleteLocalDownload).toHaveBeenCalledWith(
        "Test Book",
        "lib-remote",
        ["Author/Test Book/Test Book.epub"],
      )
    })

    it("should do nothing on delete when no downloaded rows exist", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle({
            "1": [
              {
                path: "Author/Test Book/Test Book.epub",
                localState: "remote_only",
              },
            ],
          }),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "deleteDownload")
      expect(confirmDeleteLocalDownload).not.toHaveBeenCalled()
    })

    it("should do nothing when sharing with no library", async () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          null,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "share:EPUB")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(resolveShareableFormat).not.toHaveBeenCalled()
    })

    it("should do nothing when sharing a book with invalid id", async () => {
      const invalidBook = { ...baseBook, id: "abc" }
      const { result } = renderHook(() =>
        useBookActions(
          [invalidBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("abc", "share:EPUB")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(resolveShareableFormat).not.toHaveBeenCalled()
    })

    it("should show alert when sharing throws a non-error value", async () => {
      jest.mocked(resolveShareableFormat).mockRejectedValue("String error")

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "share:EPUB")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
        expect.any(String),
        "String error",
      )
    })

    it("should share a specific downloaded format when format action is invoked", async () => {
      jest.mocked(resolveShareableFormat).mockResolvedValue({
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        fileUri: "file:///tmp/Test%20Book.epub",
        isLocal: true,
      })

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "share:EPUB")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(resolveShareableFormat).toHaveBeenCalledWith(
        localLibrary,
        1,
        "EPUB",
      )
      expect(shareBookFile).toHaveBeenCalledWith(
        "file:///tmp/Test%20Book.epub",
        "EPUB",
      )
    })

    it("should prompt to download when sharing a remote file", async () => {
      jest.mocked(resolveShareableFormat).mockResolvedValue({
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        fileUri: "",
        isLocal: false,
      })

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          remoteLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "share:EPUB")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(shareBookFile).not.toHaveBeenCalled()
      expect(showAlertWithStatusBarRestore).toHaveBeenCalled()
    })

    it("should share effective format when no specific format is requested", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
        ])
      jest.mocked(resolveShareableFormat).mockResolvedValue({
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        fileUri: "file:///tmp/Test%20Book.epub",
        isLocal: true,
      })

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB"], "EPUB"),
          buildFileStateBundle(),
          null,
          { "1": "epub" },
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "share")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(resolveShareableFormat).toHaveBeenCalledWith(
        localLibrary,
        1,
        "EPUB",
      )
      expect(shareBookFile).toHaveBeenCalled()
    })

    it("should fall back to first readable format when sharing without selection", async () => {
      jest.mocked(getBookFormatPaths).mockResolvedValue([
        { format: "PDF", relativePath: "Author/Test Book/Test Book.pdf" },
        { format: "EPUB", relativePath: "Author/Test Book/Test Book.epub" },
      ])
      jest.mocked(resolveShareableFormat).mockResolvedValue({
        format: "EPUB",
        relativePath: "Author/Test Book/Test Book.epub",
        fileUri: "file:///tmp/Test%20Book.epub",
        isLocal: true,
      })

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(["EPUB", "PDF"]),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "share")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(resolveShareableFormat).toHaveBeenCalledWith(
        localLibrary,
        1,
        "EPUB",
      )
    })

    it("should show alert when share cannot resolve any format", async () => {
      jest
        .mocked(getBookFormatPaths)
        .mockResolvedValue([
          { format: "mobi", relativePath: "Author/Test Book/Test Book.mobi" },
        ])

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap([], undefined),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "share")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).toHaveBeenCalled()
      expect(shareBookFile).not.toHaveBeenCalled()
    })

    it("should show alert when sharing throws an error", async () => {
      jest
        .mocked(resolveShareableFormat)
        .mockRejectedValue(new Error("Disk error"))

      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      result.current.handleBookMenuAction("1", "share:EPUB")
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
        expect.any(String),
        "Disk error",
      )
    })

    it("should do nothing when unknown action is invoked", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      expect(() =>
        result.current.handleBookMenuAction("1", "unknown"),
      ).not.toThrow()
    })

    it("should do nothing when book is not found", () => {
      const { result } = renderHook(() =>
        useBookActions(
          [baseBook],
          {},
          buildMetaMap(),
          buildFileStateBundle(),
          null,
          {},
          localLibrary,
          null,
        ),
      )

      expect(() =>
        result.current.handleBookMenuAction("unknown", "detail"),
      ).not.toThrow()
      expect(router.push).not.toHaveBeenCalled()
    })
  })
})
