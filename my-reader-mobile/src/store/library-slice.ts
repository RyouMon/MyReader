import type { Library } from "@my-reader/tools/types/library";
import type { BookItem } from "../data/types";

import type { AppStateSlice } from "./app-store.types";

type LibrarySlice = {
  libraries: Library[];
  activeLibraryId: string | null;
  loading: boolean;
  hydrated: boolean;
  refreshingLibraryId: string | null;
  error: string | null;
  books: BookItem[];
  loadingBooks: boolean;

  // Pure setters
  setLibraries: (libraries: Library[]) => void;
  setActiveLibraryId: (id: string | null) => void;
  setRefreshingLibraryId: (id: string | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setHydrated: (value: boolean) => void;
  upsertLibrary: (library: Library) => void;
  removeLibraryById: (id: string) => void;
  clearError: () => void;
};

export const createLibrarySlice: AppStateSlice<LibrarySlice> = (set) =>
  ({
    libraries: [],
    activeLibraryId: null,
    books: [],
    loading: true,
    loadingBooks: false,
    refreshingLibraryId: null,
    error: null,
    hydrated: false,

    setLibraries(libraries: Library[]) {
      set({ libraries });
    },
    setActiveLibraryId(id: string | null) {
      set({ activeLibraryId: id });
    },
    setRefreshingLibraryId(id: string | null) {
      set({ refreshingLibraryId: id });
    },
    setError(error: string | null) {
      set({ error });
    },
    setLoading(loading: boolean) {
      set({ loading });
    },
    setHydrated(value: boolean) {
      set({ hydrated: value });
    },
    upsertLibrary(library: Library) {
      set((state) => ({
        libraries: state.libraries.some((l) => l.id === library.id)
          ? state.libraries.map((l) => l.id === library.id ? library : l)
          : [...state.libraries, library],
      }));
    },
    removeLibraryById(id: string) {
      set((state) => {
        const nextLibraries = state.libraries.filter((l) => l.id !== id);
        const nextActiveId = state.activeLibraryId === id
          ? nextLibraries[0]?.id ?? null
          : state.activeLibraryId;
        return { libraries: nextLibraries, activeLibraryId: nextActiveId };
      });
    },
    clearError() {
      set({ error: null });
    },
  });