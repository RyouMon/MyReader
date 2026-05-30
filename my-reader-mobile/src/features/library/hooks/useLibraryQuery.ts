import { useMutation, useMutationState, useQuery } from "@tanstack/react-query";

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { readBookCountFromLibrary, readBooksFromLibrary } from "@/src/domain/library/calibre";
import { refreshMetadataIfStale } from "@/src/domain/library/metadata";
import { createRemoteOps } from "@/src/domain/library/remote-library";
import { checkConnectivity } from "@/src/domain/sync/connectivity";
import { refreshLibrary as syncRefreshLibrary } from "@/src/domain/sync/refresh-library";
import { isRemoteBackend, resolveSyncTarget } from "@/src/domain/sync/resolve";
import type { BookItem, DataSource, Library } from "@/src/domain/types";
import { isRemoteSourceType } from "@/src/domain/types";
import i18n from "@/src/i18n";
import { useAppStore } from "@/src/store/app-store";
import { queryClient } from "@/src/services/query/query-client";

import { getCachedAuth } from "@/src/services/remote/auth-cache";

export const libraryQueryKeys = {
  books: (libraryId: string | null) => ["books", libraryId] as const,
};

export const libraryRefreshMutationKey = ["library", "refresh"] as const;

export function getBooksForLibrary(libraryId: string): BookItem[] {
  return queryClient.getQueryData<BookItem[]>(libraryQueryKeys.books(libraryId)) ?? [];
}

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

export function useIsLibraryRefreshing(): boolean {
  return (
    useMutationState({
      filters: { mutationKey: libraryRefreshMutationKey, status: "pending" },
    }).length > 0
  );
}

export function useRefreshLibraryMutation() {
  return useMutation({
    mutationKey: libraryRefreshMutationKey,
    mutationFn: async (libraryId: string) => {
      const state = useAppStore.getState();
      const library = state.libraries.find((l) => l.id === libraryId);
      if (!library) throw new Error(i18n.t("sync.refreshLibraryFailed"));

      try {
        const { backend } = await resolveSyncTarget(library, state.dataSources);
        if (isRemoteBackend(backend)) await checkConnectivity(backend);
      } catch (error) {
        console.error("[useRefreshLibraryMutation] connectivity check failed:", {
          libraryId,
          sourceType: library.sourceType,
          dataSourceId: library.dataSourceId,
          error,
        });
        showAlertWithStatusBarRestore(i18n.t("sync.sourceUnreachable"), i18n.t("sync.sourceUnreachableSyncDetail"), [{ text: i18n.t("common.gotIt") }]);
        throw error instanceof Error ? error : new Error(i18n.t("sync.sourceUnreachable"));
      }

      if (isRemoteSourceType(library.sourceType) && library.dataSourceId) {
        try {
          const result = await refreshMetadataIfStale(library, state.dataSources);
          if (result.changed) {
            await queryClient.invalidateQueries({ queryKey: libraryQueryKeys.books(libraryId) });
          }
        } catch (error) {
          console.warn("[useRefreshLibraryMutation] refreshMetadataIfStale failed:", {
            libraryId,
            error,
          });
        }
      }

      const { newBookCount, newLibrary } = await syncRefreshLibrary(library, state.dataSources);

      const nextLibraries = state.libraries.map((l) =>
        l.id === libraryId
          ? { ...newLibrary, bookCount: newBookCount }
          : l,
      );
      useAppStore.getState().setLibraries(nextLibraries);

      await refreshBooks();

    },
  });
}