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

export function generateBooks(count: number): MockBook[] {
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

export async function setupLibraryMocks(page: Page, bookCount = 100) {
  const libraryId = TEST_LIBRARY_ID
  const books = generateBooks(bookCount)

  await page.addInitScript(
    (arg: { libId: string; bookList: MockBook[] }) => {
      const { libId, bookList } = arg

      const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
        list_libraries: () => [
          {
            id: libId,
            name: "测试书库",
            path: "/test/library",
            bookCount: bookList.length,
          },
        ],
        get_active_library_id: () => libId,
        get_books_page: (args: Record<string, unknown>) => {
          const offset = (args?.offset as number) ?? 0
          const limit = (args?.limit as number) ?? 100
          const pageItems = bookList.slice(offset, offset + limit)
          return {
            items: pageItems,
            total: bookList.length,
          }
        },
        get_reader_ui_preferences: () => ({
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
        }),
        get_cache_usage: () => ({ totalBytes: 0, maxBytes: 2147483648 }),
        sync_list_backends: () => [],
      }

      ;(window as unknown as Record<string, unknown>).__TAURI_IPC_HANDLERS__ = handlers
    },
    { libId: libraryId, bookList: books },
  )
}
