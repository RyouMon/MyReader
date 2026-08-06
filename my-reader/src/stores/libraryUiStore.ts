import type { BuiltInBookCollectionId } from "@my-reader/tools/types/book-collection"
import { create } from "zustand"
import { api } from "@/lib/tauri-api"
import type { LibrarySortOption } from "@/types/libraryUi"

type LibraryUiState = {
  activeLibraryId: string | null
  activeCollectionId: BuiltInBookCollectionId
  librarySearchQuery: string
  librarySortBy: LibrarySortOption
  setActiveCollectionId: (collectionId: BuiltInBookCollectionId) => void
  setLibrarySearchQuery: (query: string) => void
  setLibrarySortBy: (sortBy: LibrarySortOption) => void
  switchLibrary: (id: string) => Promise<void>
  hydrateActiveLibraryId: () => Promise<void>
}

export const useLibraryUiStore = create<LibraryUiState>()((set) => ({
  activeLibraryId: null,
  activeCollectionId: "all",
  librarySearchQuery: "",
  librarySortBy: "recent",

  setActiveCollectionId: (activeCollectionId) => set({ activeCollectionId }),

  setLibrarySearchQuery: (query) => set({ librarySearchQuery: query }),

  setLibrarySortBy: (sortBy) => set({ librarySortBy: sortBy }),

  switchLibrary: async (id) => {
    await api.switchLibrary(id)
    set({ activeLibraryId: id, activeCollectionId: "all" })
  },

  hydrateActiveLibraryId: async () => {
    try {
      const id = await api.getActiveLibraryId()
      set({ activeLibraryId: id })
    } catch {
      // not in Tauri or no active library
    }
  },
}))
