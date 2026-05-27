import type { Library } from "@my-reader/tools/types/library";
import type { BookItem } from "../data/types";

import type { AppStateSlice } from "./app-store.types";

export type LibrarySlice = {
  libraries: Library[];
  activeLibraryId: string | null;
  refreshingLibraryId: string | null;
  books: BookItem[];
  loadingBooks: boolean;

  // Pure setters
  setLibraries: (libraries: Library[]) => void;
  setActiveLibraryId: (id: string | null) => void;
  setRefreshingLibraryId: (id: string | null) => void;
  upsertLibrary: (library: Library) => void;
  removeLibraryById: (id: string) => void;
};

export const createLibrarySlice: AppStateSlice<LibrarySlice> = (set) =>
  ({
    libraries: [],
    activeLibraryId: null,
    books: [],
    loadingBooks: false,
    refreshingLibraryId: null,

    setLibraries(libraries: Library[]) {
      set({ libraries });
    },
    setActiveLibraryId(id: string | null) {
      set({ activeLibraryId: id });
    },
    setRefreshingLibraryId(id: string | null) {
      set({ refreshingLibraryId: id });
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
  });
