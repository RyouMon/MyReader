import { create } from "zustand"
import { api } from "@/lib/tauri-api"
import type { LibrarySortOption } from "@/types/libraryUi"

type LibraryUiState = {
  activeLibraryId: string | null
  activeView: "all" | "recent" | "favorites"
  librarySearchQuery: string
  librarySortBy: LibrarySortOption
  setActiveView: (view: "all" | "recent" | "favorites") => void
  setLibrarySearchQuery: (query: string) => void
  setLibrarySortBy: (sortBy: LibrarySortOption) => void
  switchLibrary: (id: string) => Promise<void>
  hydrateActiveLibraryId: () => Promise<void>
}

export const useLibraryUiStore = create<LibraryUiState>()((set) => ({
  activeLibraryId: null,
  activeView: "all",
  librarySearchQuery: "",
  librarySortBy: "recent",

  setActiveView: (view) => set({ activeView: view }),

  setLibrarySearchQuery: (query) => set({ librarySearchQuery: query }),

  setLibrarySortBy: (sortBy) => set({ librarySortBy: sortBy }),

  switchLibrary: async (id) => {
    await api.switchLibrary(id)
    set({ activeLibraryId: id })
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
