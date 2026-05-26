import { useQuery } from "@tanstack/react-query";

import { readBooksFromLibrary } from "@/src/data/calibre";
import { createRemoteOps } from "@/src/data/remote-library";
import type { BookItem, DataSource, Library } from "@/src/data/types";
import { useAppStore } from "@/src/store/app-store";

export const libraryQueryKeys = {
  books: (libraryId: string | null) => ["books", libraryId] as const,
};

export async function fetchBooksWithMeta(
  activeLibrary: Library,
  dataSources: DataSource[]
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
  dataSources: DataSource[]
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
  });
}