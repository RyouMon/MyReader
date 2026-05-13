import type { Page } from "@playwright/test"

export interface MockBook {
  id: number
  title: string
  authors: string[]
  tags: string[]
  series: string | null
  seriesIndex: number | null
  formats: string[]
  hasCover: boolean
  path: string
  timestamp: string | null
  pubdate: string | null
  lastModified: string | null
  comment: string | null
  publisher: string | null
  languages: string[]
  rating: number | null
  uuid: string | null
}

export const TEST_LIBRARY_ID = "test-lib-01"

function generateBooks(count: number): MockBook[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `测试书籍 ${i + 1}`,
    authors: [`作者 ${(i % 10) + 1}`],
    tags: [],
    series: i % 5 === 0 ? `系列 ${Math.floor(i / 5) + 1}` : null,
    seriesIndex: i % 5 === 0 ? (i % 5) + 1 : null,
    formats: ["EPUB"],
    hasCover: true,
    path: `books/book_${i + 1}.epub`,
    timestamp: new Date().toISOString(),
    pubdate: null,
    lastModified: null,
    comment: null,
    publisher: null,
    languages: ["zh"],
    rating: null,
    uuid: null,
  }))
}

export class LibraryPage {
  private readonly books = generateBooks(100)

  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto("/")
  }

  async setupIpcMocks() {
    const libraryId = TEST_LIBRARY_ID
    const books = this.books

    await this.page.addInitScript(
      (arg: { libId: string; bookList: MockBook[] }) => {
        const { libId, bookList } = arg
        const handler = (cmd: string, args: Record<string, unknown>) => {
          switch (cmd) {
            case "list_libraries":
              return [
                {
                  id: libId,
                  name: "测试书库",
                  path: "/test/library",
                  bookCount: bookList.length,
                },
              ]
            case "get_active_library_id":
              return libId
            case "get_books_page": {
              const offset = (args?.offset as number) ?? 0
              const limit = (args?.limit as number) ?? 100
              const pageItems = bookList.slice(offset, offset + limit)
              return {
                items: pageItems,
                total: bookList.length,
              }
            }
            case "get_reader_ui_preferences":
              return {
                version: 4,
                libraryViewMode: "grid",
                fixedLayout: {},
                reflowable: {
                  settings: {
                    theme: "default",
                    fontFamily: "system",
                    fontSize: 18,
                    lineHeight: 1.6,
                    paddingX: 16,
                    readingLayout: "paginated",
                    textAlign: "justify",
                    colCount: "auto",
                  },
                  tts: {
                    ttsConfigId: "default",
                    ttsSpeed: 1,
                  },
                },
                cache: {
                  maxCacheSizeMb: 2048,
                  autoCleanupOnLaunch: true,
                },
              }
            case "get_cache_usage":
              return { totalBytes: 0, maxBytes: 2147483648 }
            case "sync_list_backends":
              return []
            default:
              return undefined
          }
        }

        // Ensure isTauri() returns true so stores trigger IPC calls
        ;(window as unknown as Record<string, unknown>).isTauri = true

        // Minimal mockIPC implementation for Playwright browser context
        window.__TAURI_INTERNALS__ = (window.__TAURI_INTERNALS__ ?? {}) as Record<string, unknown>
        ;(window.__TAURI_INTERNALS__ as Record<string, unknown>).invoke = async (
          c: string,
          a: Record<string, unknown>,
        ) => {
          const result = handler(c, a)
          if (result === undefined) {
            throw new Error(`Unhandled mock IPC command: ${c}`)
          }
          return result
        }
        ;(window.__TAURI_INTERNALS__ as Record<string, unknown>).transformCallback = (
          cb: (data: unknown) => void,
          once = false,
        ) => {
          const id = window.crypto.getRandomValues(new Uint32Array(1))[0]
          const callbacks =
            ((window.__TAURI_INTERNALS__ as Record<string, unknown>).callbacks as
              | Map<number, (data: unknown) => void>
              | undefined) ?? new Map()
          callbacks.set(id, (data: unknown) => {
            if (once) callbacks.delete(id)
            return cb?.(data)
          })
          ;(window.__TAURI_INTERNALS__ as Record<string, unknown>).callbacks = callbacks
          return id
        }
        ;(window.__TAURI_INTERNALS__ as Record<string, unknown>).metadata = {
          currentWindow: { label: "main" },
          currentWebview: { windowLabel: "main", label: "main" },
        }
      },
      { libId: libraryId, bookList: books },
    )
  }

  async setViewport(width: number, height = 900) {
    await this.page.setViewportSize({ width, height })
  }

  async waitForBooksLoaded() {
    // Wait until book cards are rendered (not skeletons)
    await this.page.waitForSelector('[role="button"][tabindex="0"]', { timeout: 10000 })
  }

  async getVisibleBookCards() {
    return this.page.locator('[role="button"][tabindex="0"]')
  }

  async scrollDown(pixels = 800) {
    await this.page.evaluate((px) => window.scrollBy(0, px), pixels)
  }

  async scrollToBottom() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  }
}
