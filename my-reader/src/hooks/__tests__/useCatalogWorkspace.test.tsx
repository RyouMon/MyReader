import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useLibraryUiStore } from "@/stores/libraryUiStore"
import { useCatalogWorkspace } from "../useCatalogWorkspace"
import type { CatalogLocation } from "@/lib/catalogLocation"

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  back: vi.fn(),
  search: {} as { catalog?: CatalogLocation },
}))
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ search: mocks.search }),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ history: { canGoBack: () => true, back: mocks.back } }),
}))
vi.mock("@/hooks/queries/useCatalogNavigation", () => ({
  useCatalogNavigation: () => ({ data: undefined, error: null }),
}))
vi.mock("@/lib/tauri-api", () => ({ api: {} }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.search = {
    catalog: {
      tokens: [{ kind: "tags", value: "标签 A" }],
      query: "old query",
      collection: "favorites",
      sort: "author",
    },
  }
  useLibraryUiStore.setState({
    activeCollectionId: "favorites",
    librarySearchQuery: "stored query",
    librarySortBy: "author",
  })
})

describe("useCatalogWorkspace", () => {
  it("opens a detail facet as a fresh all-books route without changing the source scope", () => {
    const { result, rerender } = renderHook(() =>
      useCatalogWorkspace("library-1"),
    )
    const source = mocks.search
    act(() => {
      result.current.browseFacet({ kind: "authors", value: "Author" })
    })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/",
      search: {
        catalog: {
          tokens: [{ kind: "authors", value: "Author" }],
          collection: "all",
          query: "",
          sort: "title",
        },
      },
    })
    expect(source.catalog?.collection).toBe("favorites")
    expect(useLibraryUiStore.getState().librarySearchQuery).toBe("stored query")
    act(() => result.current.back())
    expect(mocks.back).toHaveBeenCalledOnce()
    rerender()
    expect(result.current).toMatchObject({
      collectionId: "favorites",
      searchQuery: "old query",
      sortBy: "author",
      tokens: [{ kind: "tags", value: "标签 A" }],
    })
  })

  it("updates all tokens and the free text atomically while retaining the collection and sort", () => {
    const { result } = renderHook(() => useCatalogWorkspace("library-1"))
    const tokens = [
      ...result.current.tokens,
      { kind: "tags" as const, value: "标签 B" },
    ]
    act(() => result.current.setTokens(tokens, ""))
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/",
      replace: true,
      search: {
        catalog: {
          tokens,
          collection: "favorites",
          sort: "author",
          query: "",
          directory: undefined,
        },
      },
    })
  })
})
