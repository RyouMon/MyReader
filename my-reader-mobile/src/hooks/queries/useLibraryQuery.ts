import { useMutation, useQuery } from "@tanstack/react-query";

import { readBooksFromLibrary } from "@/src/domain/library/calibre";
import { createRemoteOps } from "@/src/domain/library/remote-library";
import type { BookItem, DataSource, Library } from "@/src/data/types";
import { useAppStore } from "@/src/store/app-store";
import { checkConnectivity } from "@/src/sync/connectivity";
import { resolveSyncTarget } from "@/src/sync/resolve";
import { refreshLibrary as syncRefreshLibrary } from "@/src/sync/refresh-library";
import { readBookCountFromLibrary } from "@/src/domain/library/calibre";
import { isRemoteSourceType } from "@/src/data/types";
import { queryClient } from "./queryClient";
import i18n from "@/src/i18n";
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { refreshMetadataIfStale } from "@/src/domain/library/metadata";

import { getCachedAuth } from "@/src/services/remote/auth-cache";

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

function mergeLibraryUpdate(libraries: Library[], updatedLibrary: Library) {
  return libraries.map((library) =>
    library.id === updatedLibrary.id ? updatedLibrary : library,
  );
}

export async function refreshBooks() {
  const state = useAppStore.getState();
  const activeLibrary =
    state.libraries.find((library) => library.id === state.activeLibraryId) ?? null;

  if (!activeLibrary) return;

  try {
    // fetchBooksWithMeta returns books + metadataUri; use fetchBooks to keep
    // the query cache typed as BookItem[], then update library metadata separately
    const { books: nextBooks, metadataUri } = await fetchBooksWithMeta(activeLibrary, state.dataSources);
    queryClient.setQueryData(libraryQueryKeys.books(state.activeLibraryId), nextBooks);

    const { library: refreshedLibrary, bookCount } =
      isRemoteSourceType(activeLibrary.sourceType)
        ? {
            library:
              metadataUri === activeLibrary.metadataUri
                ? activeLibrary
                : { ...activeLibrary, metadataUri },
            bookCount: activeLibrary.bookCount,
          }
        : await readBookCountFromLibrary(activeLibrary);

    useAppStore.getState().setLibraries(
      mergeLibraryUpdate(
        useAppStore.getState().libraries,
        refreshedLibrary.bookCount === bookCount ? refreshedLibrary : { ...refreshedLibrary, bookCount },
      ),
    );
  } catch (e) {
    console.warn("[refreshBooks] failed:", e);
    // React Query handles error state via useBooks()
  }
}

export function useRefreshLibraryMutation() {
  return useMutation({
    mutationFn: async (libraryId: string) => {
      const state = useAppStore.getState();
      const library = state.libraries.find((l) => l.id === libraryId);
      if (!library) throw new Error(i18n.t("sync.refreshLibraryFailed"));

      try {
        const { backend } = await resolveSyncTarget(library, state.dataSources);
        await checkConnectivity(backend);
      } catch {
        showAlertWithStatusBarRestore(i18n.t("sync.sourceUnreachable"), i18n.t("sync.sourceUnreachableSyncDetail"), [{ text: i18n.t("common.gotIt") }]);
        throw new Error(i18n.t("sync.sourceUnreachable"));
      }

      if (isRemoteSourceType(library.sourceType) && library.dataSourceId) {
        try {
          const result = await refreshMetadataIfStale(library, state.dataSources);
          if (result.changed) {
            await queryClient.invalidateQueries({ queryKey: libraryQueryKeys.books(libraryId) });
          }
        } catch {
          // metadata check failure should not block manual refresh
        }
      }

      const { diff, newBookCount, newLibrary } = await syncRefreshLibrary(library, state.dataSources);

      const nextLibraries = state.libraries.map((l) =>
        l.id === libraryId
          ? { ...newLibrary, bookCount: newBookCount }
          : l,
      );
      useAppStore.getState().setLibraries(nextLibraries);

      await refreshBooks();

      console.info("Library refreshed:", {
        libraryId,
        added: diff.added.length,
        removed: diff.removed.length,
        modified: diff.modified.length,
        newBookCount,
      });
    },
  });
}