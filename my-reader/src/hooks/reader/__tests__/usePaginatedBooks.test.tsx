import type { CalibreBook, PaginatedBooks } from "@my-reader/tools/types/book"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/tauri-api"
import { usePaginatedBooks } from "../usePaginatedBooks"

vi.mock("@/lib/tauri-api", () => ({
  api: {
    getBooksPage: vi.fn(),
  },
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function makeBook(id: number): CalibreBook {
  return {
    id,
    title: `Book ${id}`,
    authorSort: `Author ${id}`,
    authors: [`Author ${id}`],
    tags: [],
    series: null,
    seriesIndex: null,
    formats: ["EPUB"],
    readableFormats: ["EPUB"],
    preferredFormat: "EPUB",
    hasCover: false,
    path: `Book ${id}`,
    timestamp: null,
    pubdate: null,
    lastModified: null,
    comment: null,
    publisher: null,
    languages: [],
    rating: null,
    uuid: `book-${id}`,
  }
}

function makePage(offset: number, limit: number, total = 250): PaginatedBooks {
  const count = Math.min(limit, total - offset)
  return {
    items: Array.from({ length: count }, (_, index) =>
      makeBook(offset + index),
    ),
    total,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getBooksPage).mockImplementation(
    async (_libraryId, offset, limit) => makePage(offset, limit),
  )
})

describe("usePaginatedBooks", () => {
  it("should reuse cached initial page when hook remounts with same query key", async () => {
    const client = makeClient()
    const wrapper = createWrapper(client)

    const first = renderHook(
      () => usePaginatedBooks("library-1", "recent", ""),
      { wrapper },
    )

    await waitFor(() => expect(first.result.current.total).toBe(250))
    first.unmount()

    renderHook(() => usePaginatedBooks("library-1", "recent", ""), {
      wrapper,
    })

    await waitFor(() => {
      expect(vi.mocked(api.getBooksPage)).toHaveBeenCalledTimes(1)
    })
  })

  it("should reuse cached range page when hook remounts and ensures same range", async () => {
    const client = makeClient()
    const wrapper = createWrapper(client)

    const first = renderHook(
      () => usePaginatedBooks("library-1", "recent", ""),
      { wrapper },
    )

    await waitFor(() => expect(first.result.current.total).toBe(250))
    await act(async () => {
      first.result.current.ensureRange(120, 150)
    })
    await waitFor(() => {
      expect(vi.mocked(api.getBooksPage)).toHaveBeenCalledTimes(2)
    })
    first.unmount()

    const second = renderHook(
      () => usePaginatedBooks("library-1", "recent", ""),
      { wrapper },
    )

    await waitFor(() => expect(second.result.current.total).toBe(250))
    await act(async () => {
      second.result.current.ensureRange(120, 150)
    })

    await waitFor(() => {
      expect(vi.mocked(api.getBooksPage)).toHaveBeenCalledTimes(2)
    })
  })
})
