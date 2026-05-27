import { create } from "zustand"
import { api } from "@/lib/tauri-api"

type LibraryUiState = {
  activeLibraryId: string | null
  switchLibrary: (id: string) => Promise<void>
  hydrateActiveLibraryId: () => Promise<void>
}

export const useLibraryUiStore = create<LibraryUiState>()((set) => ({
  activeLibraryId: null,

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