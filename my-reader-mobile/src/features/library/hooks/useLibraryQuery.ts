import { useQuery } from "@tanstack/react-query";

import { readBookCountFromLibrary, readBooksFromLibrary } from "@/src/domain/library/calibre";
import { createRemoteOps } from "@/src/domain/library/remote-library";
import type { BookItem, DataSource, Library } from "@/src/domain/types";
import { useAppStore } from "@/src/store/app-store";
import { queryClient } from "@/src/services/query/query-client";

import { getCachedAuth } from "@/src/services/remote/auth-cache";

export const libraryQueryKeys = {
  books: (libraryId: string | null) => ["books", libraryId] as const,
};

export function getBooksForLibrary(libraryId: string): BookItem[] {
  return queryClient.getQueryData<BookItem[]>(libraryQueryKeys.books(libraryId)) ?? [];
}

export async function fetchBooksWithMeta(
  activeLibrary: Library,
  dataSources: DataSource[],
): Promise<{ books: BookItem[]; metadataUri?: string }> {
  const ops = await createRemoteOps(activeLibrary, dataSources);
  if (ops) {
    const { books, metadataUri } = await ops.readBooks(activeLibrary);
    return { books, metadataUri };
  }

  const books = await readBooksFromLibrary(activeLibrary);
  return { books, metadataUri: activeLibrary.metadataUri };
}

export async function fetchBooks(
  activeLibrary: Library,
  dataSources: DataSource[],
): Promise<BookItem[]> {
  const { books } = await fetchBooksWithMeta(activeLibrary, dataSources);
  return books;
}

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
