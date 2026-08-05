import { useQuery } from "@tanstack/react-query"

import {
  fetchBooks,
  getBooksForLibrary,
  libraryQueryKeys,
} from "@/src/domain/library/catalog"
import type { BookItem } from "@/src/domain/types"
import { useAppStore } from "@/src/store/app-store"

import { getCachedAuth } from "@/src/services/remote/auth-cache"

export { fetchBooks, getBooksForLibrary, libraryQueryKeys }

export function useBooks(activeLibraryId: string | null) {
  return useQuery({
    queryKey: libraryQueryKeys.books(activeLibraryId),
    queryFn: async () => {
      if (!activeLibraryId) return []

      const state = useAppStore.getState()
      const activeLibrary =
        state.libraries.find((library) => library.id === activeLibraryId) ??
        null

      if (!activeLibrary) return []

      return fetchBooks(activeLibrary, state.dataSources)
    },
    enabled: !!activeLibraryId,
    staleTime: 1000 * 60 * 5,
    select: (books: BookItem[]) => inflateCoverUris(books, activeLibraryId),
  })
}

export function usePendingBookImports(activeLibraryId: string | null) {
  return useQuery<BookItem[]>({
    queryKey: libraryQueryKeys.pendingImports(activeLibraryId),
    queryFn: () => [],
    enabled: false,
    initialData: [],
    staleTime: Infinity,
  })
}

function inflateCoverUris(
  books: BookItem[],
  libraryId: string | null,
): BookItem[] {
  if (!libraryId) return books

  const state = useAppStore.getState()
  const library = state.libraries.find((l) => l.id === libraryId)
  if (!library?.dataSourceId) return books

  const cachedHeaders = getCachedAuth(library.dataSourceId)

  return books.map((book) => {
    if (!book.coverUri || !cachedHeaders) return book

    if (typeof book.coverUri === "string") {
      if (book.coverUri.startsWith("file://")) return book
      return {
        ...book,
        coverUri: { uri: book.coverUri, headers: cachedHeaders },
      }
    }

    return { ...book, coverUri: { ...book.coverUri, headers: cachedHeaders } }
  })
}
