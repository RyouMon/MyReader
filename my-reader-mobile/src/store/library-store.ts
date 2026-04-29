import { useMemo } from "react";

import { useAppStore } from "./app-store";

export function useLibraryStore() {
  const libraries = useAppStore((state) => state.libraries);
  const activeLibraryId = useAppStore((state) => state.activeLibraryId);
  const books = useAppStore((state) => state.books);
  const loading = useAppStore((state) => state.loading);
  const loadingBooks = useAppStore((state) => state.loadingBooks);
  const error = useAppStore((state) => state.error);
  const addLibrary = useAppStore((state) => state.addLibrary);
  const addResolvedLibrary = useAppStore((state) => state.addResolvedLibrary);
  const removeLibrary = useAppStore((state) => state.removeLibrary);
  const switchLibrary = useAppStore((state) => state.switchLibrary);
  const refreshBooks = useAppStore((state) => state.refreshBooks);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);

  const activeLibrary = useMemo(
    () => libraries.find((library) => library.id === activeLibraryId) ?? null,
    [activeLibraryId, libraries]
  );

  return useMemo(
    () => ({
      libraries,
      activeLibraryId,
      activeLibrary,
      books,
      loading,
      loadingBooks,
      error,
      addLibrary,
      addResolvedLibrary,
      removeLibrary,
      switchLibrary,
      refreshBooks,
      refreshLibrary,
    }),
    [
      libraries,
      activeLibraryId,
      activeLibrary,
      books,
      loading,
      loadingBooks,
      error,
      addLibrary,
      addResolvedLibrary,
      removeLibrary,
      switchLibrary,
      refreshBooks,
      refreshLibrary,
    ]
  );
}
