import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react-native"
import type { ComponentProps } from "react"

import { mapListRowsToBookItems } from "@/src/domain/library/calibre"
import type { BookItem, Library } from "@/src/domain/types"
import { listCalibreBooksPageByLastRead } from "@/src/services/core/catalog"

import { useRecentlyReadBooks } from "./use-recently-read-books"

jest.mock("@/src/domain/library/calibre", () => ({
  mapListRowsToBookItems: jest.fn(),
}))

jest.mock("@/src/services/fs/local-library-content", () => ({
  withLocalLibraryCalibreRoot: jest.fn(
    (
      _library: Library,
      operation: (libraryRootUri: string) => Promise<unknown>,
    ) => operation("file:///library"),
  ),
}))

jest.mock("@/src/services/core/catalog", () => ({
  listCalibreBooksPageByLastRead: jest.fn(),
}))

jest.mock("@/src/services/fs/library-paths", () => ({
  librarySidecarRootUri: jest.fn(() => "file:///sidecar"),
}))

const library = {
  id: "library-1",
  name: "Remote library",
  sourceType: "onedrive",
} as Library

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

describe("useRecentlyReadBooks", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should preserve the current catalog cover source when loading recently read books", async () => {
    const currentBook: BookItem = {
      id: "1",
      author: "Author",
      coverUri: {
        uri: "https://example.com/cover.jpg",
        headers: { Authorization: "Bearer current" },
      },
      title: "Current title",
    }
    jest.mocked(listCalibreBooksPageByLastRead).mockResolvedValue({
      items: [],
      total: 1,
    })
    jest.mocked(mapListRowsToBookItems).mockReturnValue([
      {
        id: "1",
        author: "Author",
        title: "Stale title",
      },
    ])
    const useRecentlyReadBooksWithCatalog = useRecentlyReadBooks as unknown as (
      activeLibrary: Library | null,
      books: BookItem[],
    ) => BookItem[]

    const { result } = renderHook(
      () => useRecentlyReadBooksWithCatalog(library, [currentBook]),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current).toHaveLength(1))

    expect(result.current[0]).toBe(currentBook)
  })
})
