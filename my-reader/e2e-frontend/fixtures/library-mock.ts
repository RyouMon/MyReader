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

export interface MockLibrary {
  id: string
  name: string
  path: string
  bookCount: number
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

export function createMockLibrary(
  id: string,
  name: string,
  bookCount: number,
  path?: string,
): MockLibrary {
  return {
    id,
    name,
    path: path ?? `/test/library/${id}`,
    bookCount,
  }
}

export async function setupLibrariesMock(
  page: Page,
  libraries: MockLibrary[],
  activeLibraryId?: string,
) {
  const books = generateBooks(
    libraries.reduce((sum, lib) => sum + lib.bookCount, 0) || 1,
  )

  await page.addInitScript(
    (arg: {
      libraries: MockLibrary[]
      activeId: string | null
      bookList: MockBook[]
    }) => {
      const { libraries: libs, activeId, bookList } = arg
      let currentActiveId = activeId ?? libs[0]?.id ?? null

      const handlers: Record<
        string,
        (args: Record<string, unknown>) => unknown
      > = {
        list_libraries: () => libs,
        get_active_library_id: () => currentActiveId,
        switch_library: (args: Record<string, unknown>) => {
          const id = args?.id as string | undefined
          if (id) {
            currentActiveId = id
          }
          return null
        },
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
              fontFamily: "default",
              fontFamiliesByLanguage: {},
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

      ;(window as unknown as Record<string, unknown>).__TAURI_IPC_HANDLERS__ =
        handlers
    },
    {
      libraries,
      activeId: activeLibraryId ?? libraries[0]?.id ?? null,
      bookList: books,
    },
  )
}

export async function setupLibraryMocks(page: Page, bookCount = 100) {
  const library = createMockLibrary(TEST_LIBRARY_ID, "测试书库", bookCount)
  await setupLibrariesMock(page, [library])
}
