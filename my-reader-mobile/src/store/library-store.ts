import { useMemo } from "react";

import { useAppStore } from "./app-store";

export function useLibraryStore() {
  const libraries = useAppStore((state) => state.libraries);
  const activeLibraryId = useAppStore((state) => state.activeLibraryId);
  const books = useAppStore((state) => state.books);
  const loadingLibraries = useAppStore((state) => state.loadingLibraries);
  const loadingBooks = useAppStore((state) => state.loadingBooks);
  const error = useAppStore((state) => state.error);
  const addLibrary = useAppStore((state) => state.addLibrary);
  const addResolvedLibrary = useAppStore((state) => state.addResolvedLibrary);
  const setActiveLibrary = useAppStore((state) => state.setActiveLibrary);
  const refreshBooks = useAppStore((state) => state.refreshBooks);

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
      loadingLibraries,
      loadingBooks,
      error,
      addLibrary,
      addResolvedLibrary,
      setActiveLibrary,
      refreshBooks,
    }),
    [
      libraries,
      activeLibraryId,
      activeLibrary,
      books,
      loadingLibraries,
      loadingBooks,
      error,
      addLibrary,
      addResolvedLibrary,
      setActiveLibrary,
      refreshBooks,
    ]
  );
}
