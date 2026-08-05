import {
  getCoverFailureKey,
  isBrokenCover,
  markBrokenCover,
  resetBrokenCovers,
} from "@/lib/coverFailureCache"
import { api } from "@/lib/tauri-api"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useLibraryMutations } from "../useLibrariesQuery"

vi.mock("@/lib/tauri-api", () => ({
  api: {
    addLibrary: vi.fn(),
    createMyreaderLibrary: vi.fn(),
    createDefaultMyreaderLibrary: vi.fn(),
    openMyreaderLibrary: vi.fn(),
    createRemoteMyreaderLibrary: vi.fn(),
    openRemoteMyreaderLibrary: vi.fn(),
    addWebdavLibrary: vi.fn(),
    addOnedriveLibrary: vi.fn(),
    listLibraries: vi.fn(),
    refreshLibrary: vi.fn(),
    refreshWebdavLibrary: vi.fn(),
    refreshOnedriveLibrary: vi.fn(),
    removeLibrary: vi.fn(),
    getActiveLibraryId: vi.fn(),
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

function createWrapper() {
  const client = makeClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetBrokenCovers()
  useLibraryUiStore.setState({
    activeLibraryId: null,
    activeView: "all",
    librarySearchQuery: "",
    librarySortBy: "recent",
  })
})

describe("useLibraryMutations", () => {
  it("should select the first added local library when no library is active", async () => {
    vi.mocked(api.addLibrary).mockResolvedValue({
      id: "library-1",
      name: "First Library",
      path: "C:/Books",
      bookCount: 0,
      libraryType: "calibre",
      sourceType: "local",
      dataSourceId: null,
      sourcePath: null,
    })
    vi.mocked(api.getActiveLibraryId).mockResolvedValue("library-1")

    const { result } = renderHook(() => useLibraryMutations(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.addLibrary("C:/Books")
    })

    expect(useLibraryUiStore.getState().activeLibraryId).toBe("library-1")
  })

  it("should clear failed covers when refreshing a library", async () => {
    const key = getCoverFailureKey({
      libraryId: "library-1",
      bookPath: "Books/Book.epub",
      kind: "expected",
    })
    markBrokenCover(key)
    vi.mocked(api.listLibraries).mockResolvedValue([
      {
        id: "library-1",
        name: "First Library",
        path: "C:/Books",
        bookCount: 1,
        libraryType: "calibre",
        sourceType: "local",
        dataSourceId: null,
        sourcePath: null,
      },
    ])
    vi.mocked(api.refreshLibrary).mockResolvedValue({
      id: "library-1",
      name: "First Library",
      path: "C:/Books",
      bookCount: 1,
      libraryType: "calibre",
      sourceType: "local",
      dataSourceId: null,
      sourcePath: null,
    })

    const { result } = renderHook(() => useLibraryMutations(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.refreshLibrary("library-1")
    })

    expect(isBrokenCover(key)).toBe(false)
  })
})
