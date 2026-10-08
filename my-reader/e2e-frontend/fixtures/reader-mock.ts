import { fileURLToPath } from "node:url"
import type { Page } from "@playwright/test"
import { TEST_LIBRARY_ID } from "./library-mock"

export interface ReaderMockOptions {
  bookId?: number
  hangPrepareBookSource?: boolean
  format?: "EPUB" | "PDF" | "CBZ"
  extractedDirPath?: string
}

/**
 * Setup IPC mocks for reader-related Tauri commands.
 * Overrides the window label so isMainWebviewWindow() returns false,
 * causing ReadBookPage to enter the actual book loading flow.
 */
export async function setupReaderMocks(
  page: Page,
  options: ReaderMockOptions = {},
) {
  const {
    bookId = 1,
    hangPrepareBookSource = false,
    format = "EPUB",
    extractedDirPath = `http://localhost:1420/@fs${fileURLToPath(
      new URL(
        "../../../my-reader-mobile/e2e/fixtures/tts-book",
        import.meta.url,
      ),
    )}`,
  } = options

  const libraryId = TEST_LIBRARY_ID

  // Override window label so isMainWebviewWindow() returns false
  await page.addInitScript(() => {
    const internals = (
      window as unknown as Record<string, Record<string, unknown>>
    ).__TAURI_INTERNALS__
    if (internals) {
      internals.metadata = {
        currentWindow: { label: "reader-1" },
        currentWebview: { windowLabel: "reader-1", label: "reader-1" },
      }
    }
  })

  await page.addInitScript(
    (arg: {
      libId: string
      bookId: number
      hangPrepare: boolean
      fmt: string
      extractedDirPath?: string
    }) => {
      const { bookId: bid, hangPrepare, fmt, extractedDirPath } = arg

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
        get_book_detail: () => ({
          id: bid,
          title: "测试书籍",
          authorSort: "测试作者",
          authors: ["测试作者"],
          tags: [],
          series: null,
          seriesIndex: null,
          readableFormats: [fmt],
          preferredFormat: null,
          hasCover: false,
          path: `books/test_book.${fmt.toLowerCase()}`,
          timestamp: new Date().toISOString(),
          pubdate: null,
          lastModified: null,
          comment: null,
          publisher: null,
          languages: ["zh"],
          rating: null,
          uuid: null,
          formatSizes: [{ format: fmt, sizeBytes: 1024000 }],
          identifiers: [],
        }),
        get_reading_progress: () => null,
        prepare_book_source: () => {
          if (hangPrepare) {
            return new Promise(() => {})
          }
          return {
            filePath: `/mock/books/test_book.${fmt.toLowerCase()}`,
            extractedDirPath:
              fmt === "EPUB"
                ? (extractedDirPath ?? `/mock/books/test_book`)
                : undefined,
            extractedEntries: [],
          }
        },
        close_book_streamer: () => {},
      }

      ;(window as unknown as Record<string, unknown>).__TAURI_IPC_HANDLERS__ =
        handlers
    },
    {
      libId: libraryId,
      bookId,
      hangPrepare: hangPrepareBookSource,
      fmt: format,
      extractedDirPath,
    },
  )
}
