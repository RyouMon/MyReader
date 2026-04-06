import { invoke, isTauri } from "@tauri-apps/api/core"
import { useEffect, useMemo } from "react"
import { create } from "zustand"

import type { LibraryInfo } from "@/types/book"

interface LibraryStoreState {
  libraries: LibraryInfo[]
  activeLibraryId: string | null
  loading: boolean
  hydrated: boolean
  hydrateFromBackend: () => Promise<void>
  refreshLibraries: () => Promise<void>
  addLibrary: (path: string, name?: string) => Promise<LibraryInfo>
  removeLibrary: (id: string) => Promise<void>
  switchLibrary: (id: string) => Promise<void>
}

export const useLibraryStore = create<LibraryStoreState>()((set, get) => ({
  libraries: [],
  activeLibraryId: null,
  loading: true,
  hydrated: false,

  refreshLibraries: async () => {
    if (!isTauri()) return
    try {
      const libs = await invoke<LibraryInfo[]>("list_libraries")
      set({ libraries: libs })
    } catch (e) {
      console.error("Failed to list libraries:", e)
    }
  },

  hydrateFromBackend: async () => {
    if (!isTauri()) {
      set({ loading: false, hydrated: true })
      return
    }
    set({ loading: true })
    try {
      const libs = await invoke<LibraryInfo[]>("list_libraries")
      const id = await invoke<string | null>("get_active_library_id")
      set({ libraries: libs, activeLibraryId: id })
    } catch (e) {
      console.error("Init failed:", e)
    } finally {
      set({ loading: false, hydrated: true })
    }
  },

  addLibrary: async (path, name) => {
    const info = await invoke<LibraryInfo>("add_library", { path, name })
    await get().refreshLibraries()
    const newId = await invoke<string | null>("get_active_library_id")
    if (newId) set({ activeLibraryId: newId })
    return info
  },

  removeLibrary: async (id) => {
    await invoke("remove_library", { id })
    await get().refreshLibraries()
    const newId = await invoke<string | null>("get_active_library_id")
    set({ activeLibraryId: newId })
  },

  switchLibrary: async (id) => {
    await invoke("switch_library", { id })
    set({ activeLibraryId: id })
  },
}))

/**
 * 书库列表与当前活动书库；数据由 Tauri `config.json` 持久化，启动时由 `LibrarySync` 拉取。
 */
export function useLibrary() {
  const libraries = useLibraryStore((s) => s.libraries)
  const activeLibraryId = useLibraryStore((s) => s.activeLibraryId)
  const loading = useLibraryStore((s) => s.loading)
  const addLibrary = useLibraryStore((s) => s.addLibrary)
  const removeLibrary = useLibraryStore((s) => s.removeLibrary)
  const switchLibrary = useLibraryStore((s) => s.switchLibrary)
  const refreshLibraries = useLibraryStore((s) => s.refreshLibraries)

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId],
  )

  return {
    libraries,
    activeLibraryId,
    activeLibrary,
    loading,
    addLibrary,
    removeLibrary,
    switchLibrary,
    refreshLibraries,
  }
}

/** 在根路由挂载，从后端加载书库列表与活动书库到 Zustand。 */
export function LibrarySync() {
  const hydrateFromBackend = useLibraryStore((s) => s.hydrateFromBackend)
  useEffect(() => {
    void hydrateFromBackend()
  }, [hydrateFromBackend])
  return null
}
