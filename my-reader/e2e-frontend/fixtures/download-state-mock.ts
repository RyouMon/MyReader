import type { Page } from "@playwright/test"
import { TEST_LIBRARY_ID } from "./library-mock"

export type FileStatus =
  | "未下载"
  | "准备下载"
  | "下载中"
  | "下载失败"
  | "已取消"
  | "已下载"

export const TEST_BOOK_ID = 1
export const TEST_FORMATS = ["EPUB", "PDF", "CBZ"] as const

type DownloadProgressStatus =
  | "starting"
  | "downloading"
  | "done"
  | "error"
  | "cancelled"

export async function setupDownloadStateMocks(page: Page) {
  await page.addInitScript(
    (arg: { libraryId: string; bookId: number; formats: string[] }) => {
      const { libraryId, bookId, formats } = arg
      const state = {
        librarySourceType: "webdav",
        selectedFormat: "EPUB",
        formats: [...formats],
        fileStates: Object.fromEntries(
          formats.map((format) => [format, "remote_only"]),
        ) as Record<string, string>,
        progress: {} as Record<string, unknown>,
        calls: {
          cancel_book_download: 0,
          delete_local_book_file: 0,
          download_book_file: 0,
        },
      }

      function book() {
        return {
          id: bookId,
          title: "下载状态测试书",
          authorSort: "测试作者",
          authors: ["测试作者"],
          tags: [],
          series: null,
          seriesIndex: null,
          formats: state.formats,
          hasCover: false,
          path: "books/download-state-test.epub",
          timestamp: new Date().toISOString(),
          pubdate: null,
          lastModified: null,
          comment: "下载状态测试简介",
          publisher: null,
          languages: ["zh"],
          rating: null,
          uuid: null,
          formatSizes: state.formats.map((format) => ({
            format,
            sizeBytes: 1024,
          })),
          identifiers: [],
        }
      }

      function eventName(format: string) {
        return `download_progress/${libraryId}/${bookId}/${format}`
      }

      function progressFromStatus(status: string) {
        if (status === "准备下载") return "starting"
        if (status === "下载中") return "downloading"
        if (status === "下载失败") return "error"
        if (status === "已取消") return "cancelled"
        return null
      }

      function emit(format: string, status: DownloadProgressStatus) {
        const testApi = (
          window as unknown as {
            __TAURI_TEST__?: {
              emit: (event: string, payload: unknown) => void
            }
          }
        ).__TAURI_TEST__
        const payload = {
          libraryId,
          bookId,
          format,
          status,
          bytesWritten: status === "downloading" ? 512 : 0,
          totalBytes: 1024,
          error: status === "error" ? "网络错误" : undefined,
        }
        testApi?.emit("download_progress", payload)
        testApi?.emit(eventName(format), payload)
      }

      function setStatus(format: string, status: string) {
        const fmt = format.toUpperCase()
        if (status === "已下载") {
          state.fileStates[fmt] = "present"
          delete state.progress[fmt]
          emit(fmt, "done")
          return
        }
        state.fileStates[fmt] = "remote_only"
        const progress = progressFromStatus(status as FileStatus)
        if (progress) {
          state.progress[fmt] = progress
          emit(fmt, progress)
        } else {
          delete state.progress[fmt]
        }
      }

      const existingHandlers =
        (
          window as unknown as Record<
            string,
            Record<string, (args: Record<string, unknown>) => unknown>
          >
        ).__TAURI_IPC_HANDLERS__ ?? {}

      const handlers: Record<
        string,
        (args: Record<string, unknown>) => unknown
      > = {
        ...existingHandlers,
        list_libraries: () => [
          {
            id: libraryId,
            name: "远程测试书库",
            path: "/remote/library",
            bookCount: 1,
            sourceType: state.librarySourceType,
            dataSourceId: "remote-source",
            sourcePath: "/books",
          },
        ],
        get_active_library_id: () => libraryId,
        get_books_page: () => ({ items: [book()], total: 1 }),
        get_book_detail: () => book(),
        get_series_books: () => [],
        list_favorite_book_ids: () => [],
        list_book_reading_formats: () => ({
          [String(bookId)]: state.selectedFormat,
        }),
        set_book_reading_format: (args) => {
          state.selectedFormat = String(args.format).toUpperCase()
          return null
        },
        check_book_file_state: (args) => {
          const format = String(args.format).toUpperCase()
          const localState = state.fileStates[format] ?? "remote_only"
          return {
            path: `/mock/books/${bookId}.${format.toLowerCase()}`,
            localState:
              state.librarySourceType === "local" ? "present" : localState,
            localSize: localState === "present" ? 1024 : null,
          }
        },
        download_book_file: (args) => {
          state.calls.download_book_file += 1
          const format = String(args.format).toUpperCase()
          setStatus(format, "准备下载")
          return null
        },
        cancel_book_download: (args) => {
          state.calls.cancel_book_download += 1
          const format = String(args.format).toUpperCase()
          setStatus(format, "已取消")
          return null
        },
        delete_local_book_file: (args) => {
          state.calls.delete_local_book_file += 1
          const format = String(args.format).toUpperCase()
          state.fileStates[format] = "remote_only"
          delete state.progress[format]
          return null
        },
        get_reading_progress: () => null,
        prepare_book_source: () => {
          const format = state.selectedFormat
          if (
            state.librarySourceType !== "local" &&
            state.fileStates[format] !== "present"
          ) {
            throw new Error("BOOK_FORMAT_NOT_DOWNLOADED")
          }
          return {
            filePath: `/mock/books/${bookId}.${format.toLowerCase()}`,
            extractedDirPath:
              format === "EPUB" ? `/mock/books/${bookId}` : undefined,
            extractedEntries: [],
          }
        },
        close_book_streamer: () => null,
        get_reader_ui_preferences: () => ({
          version: 4,
          libraryViewMode: "grid",
          fixedLayout: {},
          reflowable: {
            settings: {
              theme: "default",
              fontFamily: "default",
              fontFamiliesByLanguage: {},
              fontSize: 18,
              lineHeight: 1.6,
              paddingX: 16,
              readingLayout: "paginated",
              textAlign: "justify",
              colCount: "auto",
            },
            tts: { ttsConfigId: "default", ttsSpeed: 1 },
          },
          cache: { maxCacheSizeMb: 2048, autoCleanupOnLaunch: true },
        }),
        get_cache_usage: () => ({ totalBytes: 0, maxBytes: 2147483648 }),
        sync_list_backends: () => [],
      }

      ;(window as unknown as Record<string, unknown>).__DOWNLOAD_STATE_MOCK__ =
        {
          setStatus,
          setSelectedFormat: (format: string) => {
            state.selectedFormat = format.toUpperCase()
          },
          setFormats: (nextFormats: string[]) => {
            state.formats = nextFormats.map((format) => format.toUpperCase())
          },
          setLibrarySourceType: (sourceType: string) => {
            state.librarySourceType = sourceType
          },
          emit,
          calls: state.calls,
        }
      ;(window as unknown as Record<string, unknown>).__TAURI_IPC_HANDLERS__ =
        handlers
    },
    {
      libraryId: TEST_LIBRARY_ID,
      bookId: TEST_BOOK_ID,
      formats: [...TEST_FORMATS],
    },
  )
  await page.goto("about:blank")
}

export async function setMockFormatStatus(
  page: Page,
  format: string,
  status: FileStatus,
) {
  await page.addInitScript(
    ({ format, status }) => {
      ;(
        window as unknown as {
          __DOWNLOAD_STATE_MOCK__?: {
            setStatus: (format: string, status: string) => void
          }
        }
      ).__DOWNLOAD_STATE_MOCK__?.setStatus(format, status)
    },
    { format, status },
  )
  await page.evaluate(
    ({ format, status }) => {
      ;(
        window as unknown as {
          __DOWNLOAD_STATE_MOCK__: {
            setStatus: (format: string, status: string) => void
          }
        }
      ).__DOWNLOAD_STATE_MOCK__.setStatus(format, status)
    },
    { format, status },
  )
}

export async function setMockSelectedFormat(page: Page, format: string) {
  await page.addInitScript((format) => {
    ;(
      window as unknown as {
        __DOWNLOAD_STATE_MOCK__?: {
          setSelectedFormat: (format: string) => void
        }
      }
    ).__DOWNLOAD_STATE_MOCK__?.setSelectedFormat(format)
  }, format)
  await page.evaluate((format) => {
    ;(
      window as unknown as {
        __DOWNLOAD_STATE_MOCK__: {
          setSelectedFormat: (format: string) => void
        }
      }
    ).__DOWNLOAD_STATE_MOCK__.setSelectedFormat(format)
  }, format)
}

export async function setMockFormats(page: Page, formats: string[]) {
  await page.addInitScript((formats) => {
    ;(
      window as unknown as {
        __DOWNLOAD_STATE_MOCK__?: {
          setFormats: (formats: string[]) => void
        }
      }
    ).__DOWNLOAD_STATE_MOCK__?.setFormats(formats)
  }, formats)
  await page.evaluate((formats) => {
    ;(
      window as unknown as {
        __DOWNLOAD_STATE_MOCK__: {
          setFormats: (formats: string[]) => void
        }
      }
    ).__DOWNLOAD_STATE_MOCK__.setFormats(formats)
  }, formats)
}

export async function setMockLibrarySourceType(page: Page, sourceType: string) {
  await page.addInitScript((sourceType) => {
    ;(
      window as unknown as {
        __DOWNLOAD_STATE_MOCK__?: {
          setLibrarySourceType: (sourceType: string) => void
        }
      }
    ).__DOWNLOAD_STATE_MOCK__?.setLibrarySourceType(sourceType)
  }, sourceType)
  await page.evaluate((sourceType) => {
    ;(
      window as unknown as {
        __DOWNLOAD_STATE_MOCK__: {
          setLibrarySourceType: (sourceType: string) => void
        }
      }
    ).__DOWNLOAD_STATE_MOCK__.setLibrarySourceType(sourceType)
  }, sourceType)
}

export async function setMockWindowKind(page: Page, kind: "main" | "reader") {
  await page.addInitScript((kind) => {
    const label = kind === "reader" ? "reader-1" : "main"
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          metadata?: Record<string, unknown>
        }
      }
    ).__TAURI_INTERNALS__
    if (!internals) return
    internals.metadata = {
      currentWindow: { label },
      currentWebview: { windowLabel: label, label },
    }
  }, kind)
  await page.evaluate((kind) => {
    const label = kind === "reader" ? "reader-1" : "main"
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          metadata?: Record<string, unknown>
        }
      }
    ).__TAURI_INTERNALS__
    if (!internals) return
    internals.metadata = {
      currentWindow: { label },
      currentWebview: { windowLabel: label, label },
    }
  }, kind)
}
