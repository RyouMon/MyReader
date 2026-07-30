import type { Library } from "@my-reader/tools/types/library"

import type { AppStateSlice } from "./app-store.types"

export type LibrarySlice = {
  libraries: Library[]
  activeLibraryId: string | null

  // Pure setters
  setLibraries: (libraries: Library[]) => void
  setActiveLibraryId: (id: string | null) => void
}

export const createLibrarySlice: AppStateSlice<LibrarySlice> = (set) => ({
  libraries: [],
  activeLibraryId: null,

  setLibraries(libraries: Library[]) {
    set({ libraries })
  },
  setActiveLibraryId(id: string | null) {
    set({ activeLibraryId: id })
  },
})
