import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { ComponentProps } from "react"

import { fetchBooks } from "@/src/domain/library/catalog"
import type { BookItem, Library } from "@/src/domain/types"
import { clearAuthCache, setCachedAuth } from "@/src/services/remote/auth-cache"
import { useAppStore } from "@/src/store/app-store"

import { useBooks, usePendingBookImports } from "./useLibraryQuery"

jest.mock("@/src/domain/library/catalog", () => ({
  fetchBooks: jest.fn(),
  getBooksForLibrary: jest.fn(),
  libraryQueryKeys: {
    books: (libraryId: string | null) => ["books", libraryId],
    pendingImports: (libraryId: string | null) => [
      "pending-book-imports",
      libraryId,
    ],
  },
}))

jest.mock("@/src/store/app-store", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}))

const library: Library = {
  id: "library-1",
  name: "Remote library",
  path: "/remote",
  bookCount: 1,
  dataSourceId: "source-1",
  sourceType: "onedrive",
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
      },
    },
  })

  return function Wrapper({
    children,
  }: {
    children: ComponentProps<typeof QueryClientProvider>["children"]
  }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe("useBooks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearAuthCache()
    jest.mocked(useAppStore.getState).mockReturnValue({
      dataSources: [],
      libraries: [library],
    } as unknown as ReturnType<typeof useAppStore.getState>)
  })

  afterEach(() => {
    clearAuthCache()
  })

  it("should replace stale cover headers with the current cached authentication", async () => {
    const book: BookItem = {
      id: "book-1",
      author: "Author",
      title: "Book",
      coverUri: {
        uri: "https://graph.microsoft.com/cover/content",
        headers: { Authorization: "Bearer stale" },
      },
    }
    jest.mocked(fetchBooks).mockResolvedValue([book])
    setCachedAuth(
      "source-1",
      { Authorization: "Bearer current" },
      Date.now() + 60_000,
    )

    const { result } = renderHook(() => useBooks(library.id), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    expect(result.current.data?.[0]?.coverUri).toEqual({
      uri: "https://graph.microsoft.com/cover/content",
      headers: { Authorization: "Bearer current" },
    })
  })

  it("should expose transient imports from the query cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    })
    const wrapper = ({
      children,
    }: {
      children: ComponentProps<typeof QueryClientProvider>["children"]
    }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => usePendingBookImports(library.id), {
      wrapper,
    })
    const pending: BookItem = {
      id: "import:1",
      author: "Unknown author",
      title: "Pending book",
      importStatus: "importing",
    }

    act(() => {
      queryClient.setQueryData(["pending-book-imports", library.id], [pending])
    })

    await waitFor(() => expect(result.current.data).toEqual([pending]))
  })
})
