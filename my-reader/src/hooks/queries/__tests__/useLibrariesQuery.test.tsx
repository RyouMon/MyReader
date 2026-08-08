import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getCoverFailureKey,
  isBrokenCover,
  markBrokenCover,
  resetBrokenCovers,
} from "@/lib/coverFailureCache"
import { api } from "@/lib/tauri-api"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import { useLibraryMutations } from "../useLibrariesQuery"

vi.mock("@/lib/tauri-api", () => ({
  api: {
    addLibrary: vi.fn(),
    createMyreaderLibrary: vi.fn(),
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
    activeCollectionId: "all",
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

  it("should open a local Calibre library when no MyReader marker exists", async () => {
    vi.mocked(api.openMyreaderLibrary).mockRejectedValue(
      new Error("MYREADER_LIBRARY_MARKER_NOT_FOUND"),
    )
    vi.mocked(api.addLibrary).mockResolvedValue({
      id: "calibre-1",
      name: "Calibre Library",
      path: "/Books/Calibre",
      bookCount: 3,
      libraryType: "calibre",
      sourceType: "local",
      dataSourceId: null,
      sourcePath: null,
    })
    vi.mocked(api.getActiveLibraryId).mockResolvedValue("calibre-1")

    const { result } = renderHook(() => useLibraryMutations(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.openExistingLocalLibrary("/Books/Calibre")
    })

    expect(api.openMyreaderLibrary).toHaveBeenCalledWith("/Books/Calibre", null)
    expect(api.addLibrary).toHaveBeenCalledWith("/Books/Calibre", null)
  })

  it("should not treat an unrelated local error as a Calibre library", async () => {
    vi.mocked(api.openMyreaderLibrary).mockRejectedValue(
      new Error("PERMISSION_DENIED"),
    )

    const { result } = renderHook(() => useLibraryMutations(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await expect(
        result.current.openExistingLocalLibrary("/Books/Private"),
      ).rejects.toThrow("PERMISSION_DENIED")
    })

    expect(api.addLibrary).not.toHaveBeenCalled()
  })

  it("should open a remote OneDrive Calibre library after MyReader detection", async () => {
    vi.mocked(api.openRemoteMyreaderLibrary).mockRejectedValue(
      new Error("REMOTE_MYREADER_LIBRARY_MARKER_NOT_FOUND"),
    )
    vi.mocked(api.addOnedriveLibrary).mockResolvedValue({
      id: "onedrive-library",
      name: "Cloud Calibre",
      path: "onedrive://Books",
      bookCount: 5,
      libraryType: "calibre",
      sourceType: "onedrive",
      dataSourceId: "onedrive-1",
      sourcePath: "/Books/",
    })
    vi.mocked(api.getActiveLibraryId).mockResolvedValue("onedrive-library")

    const { result } = renderHook(() => useLibraryMutations(), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.openExistingRemoteLibrary({
        dataSourceId: "onedrive-1",
        rootPath: "/Books/",
        sourceType: "onedrive",
      })
    })

    expect(api.addOnedriveLibrary).toHaveBeenCalledWith(
      "onedrive-1",
      "/Books/",
      null,
    )
    expect(api.addWebdavLibrary).not.toHaveBeenCalled()
  })
})
