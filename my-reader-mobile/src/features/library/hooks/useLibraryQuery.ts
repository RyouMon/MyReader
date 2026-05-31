import { useQuery } from "@tanstack/react-query";

import {
  fetchBooks,
  fetchBooksWithMeta,
  getBooksForLibrary,
  libraryQueryKeys,
} from "@/src/domain/library/calibre";
import type { BookItem } from "@/src/domain/types";
import { useAppStore } from "@/src/store/app-store";

import { getCachedAuth } from "@/src/services/remote/auth-cache";

export { fetchBooks, fetchBooksWithMeta, getBooksForLibrary, libraryQueryKeys };

export function useBooks(activeLibraryId: string | null) {
  return useQuery({
    queryKey: libraryQueryKeys.books(activeLibraryId),
    queryFn: async () => {
      if (!activeLibraryId) return [];

      const state = useAppStore.getState();
      const activeLibrary =
        state.libraries.find((library) => library.id === activeLibraryId) ?? null;

      if (!activeLibrary) return [];

      return fetchBooks(activeLibrary, state.dataSources);
    },
    enabled: !!activeLibraryId,
    staleTime: 1000 * 60 * 5,
    select: (books: BookItem[]) => inflateCoverUris(books, activeLibraryId),
  });
}

function inflateCoverUris(books: BookItem[], libraryId: string | null): BookItem[] {
  if (!libraryId) return books;

  const state = useAppStore.getState();
  const library = state.libraries.find((l) => l.id === libraryId);
  if (!library?.dataSourceId) return books;

  const cachedHeaders = getCachedAuth(library.dataSourceId);

  return books.map((book) => {
    if (!book.coverUri || typeof book.coverUri !== "string" || book.coverUri.startsWith("file://")) {
      return book;
    }

    if (!cachedHeaders) return book;

    return { ...book, coverUri: { uri: book.coverUri, headers: cachedHeaders } };
  });
}
