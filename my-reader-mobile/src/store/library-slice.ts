import type { Library } from "@my-reader/tools/types/library";

import type { AppStateSlice } from "./app-store.types";

export type LibrarySlice = {
  libraries: Library[];
  activeLibraryId: string | null;

  // Pure setters
  setLibraries: (libraries: Library[]) => void;
  setActiveLibraryId: (id: string | null) => void;
  upsertLibrary: (library: Library) => void;
  removeLibraryById: (id: string) => void;
};

export const createLibrarySlice: AppStateSlice<LibrarySlice> = (set) =>
  ({
    libraries: [],
    activeLibraryId: null,

    setLibraries(libraries: Library[]) {
      set({ libraries });
    },
    setActiveLibraryId(id: string | null) {
      set({ activeLibraryId: id });
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
