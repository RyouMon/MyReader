import { isTauri } from "@tauri-apps/api/core"
import type { Library } from "@my-reader/tools/types/library"
import { useEffect, useMemo } from "react"
import { create } from "zustand"
import { api } from "@/lib/tauri-api"

type LibraryState = {
  libraries: Library[]
  activeLibraryId: string | null
  loading: boolean
  hydrated: boolean
  books: unknown[]
  loadingBooks: boolean
  error: string | null
  setHydrated: (value: boolean) => void
  hydrateFromBackend: () => Promise<void>
  refreshLibraries: () => Promise<void>
  refreshLibrary: (id: string) => Promise<void>
  addLibrary: (path?: string, name?: string) => Promise<Library | null>
  addWebdavLibrary: (dataSourceId?: string, remotePath?: string, name?: string) => Promise<Library | null>
  removeLibrary: (id: string) => Promise<void>
  switchLibrary: (id: string) => Promise<void>
  refreshBooks: () => Promise<void>
  addResolvedLibrary: (library: Library) => Promise<boolean>
  clearError: () => void
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  libraries: [],
  activeLibraryId: null,
  loading: true,
  hydrated: false,
  books: [],
  loadingBooks: false,
  error: null,
  setHydrated(value: boolean) {
    set({ hydrated: value })
  },

  refreshLibraries: async () => {
    if (!isTauri()) return
    console.info("Start to refresh library list.")
    try {
      const libs = await api.listLibraries()
      set({ libraries: libs })
      console.info(`Success to refresh library list. count: ${libs.length}`)
    } catch (e) {
      console.error("Failed to refresh library list. error:", e)
    }
  },

  refreshLibrary: async (id: string) => {
    if (!isTauri()) return
    console.info(`Start to refresh library. id: "${id}"`)
    try {
      const libs = get().libraries
      const lib = libs.find((l) => l.id === id)
      if (lib?.sourceType === "webdav") {
        await api.refreshWebdavLibrary(id)
      } else {
        await api.refreshLibrary(id)
      }
      await get().refreshLibraries()
      console.info(`Success to refresh library. id: "${id}"`)
    } catch (e) {
      console.error(`Failed to refresh library. id: "${id}", error:`, e)
      throw e
    }
  },

  hydrateFromBackend: async () => {
    if (!isTauri()) {
      console.info(
        "Success to hydrate library state. reason: skipped (not in Tauri).",
      )
      set({ loading: false, hydrated: true })
      return
    }
    console.info("Start to hydrate library state from backend.")
    set({ loading: true })
    try {
      const libs = await api.listLibraries()
      const id = await api.getActiveLibraryId()
      set({ libraries: libs, activeLibraryId: id })
      console.info(
        `Success to hydrate library state from backend. library count: ${libs.length}, active library id: "${id ?? ""}"`,
      )
    } catch (e) {
      console.error("Failed to hydrate library state from backend. error:", e)
    } finally {
      set({ loading: false, hydrated: true })
    }
  },

  addLibrary: async (path, name) => {
    console.info(
      `Start to add library. path: "${path}", requested name: "${name ?? ""}"`,
    )
    try {
      const info = await api.addLibrary(path ?? "", name ?? null)
      await get().refreshLibraries()
      const newId = await api.getActiveLibraryId()
      if (newId) set({ activeLibraryId: newId })
      console.info(
        `Success to add library. id: "${info.id}", name: "${info.name}", book count: ${info.bookCount}`,
      )
      return info
    } catch (e) {
      console.error(`Failed to add library. path: "${path}", error:`, e)
      throw e
    }
  },

  addWebdavLibrary: async (dataSourceId, remotePath, name) => {
    if (!dataSourceId || !remotePath) return null
    console.info(
      `Start to add WebDAV library. dataSourceId: "${dataSourceId}", remotePath: "${remotePath}", name: "${name ?? ""}"`,
    )
    try {
      const info = await api.addWebdavLibrary(dataSourceId, remotePath, name ?? null)
      await get().refreshLibraries()
      const newId = await api.getActiveLibraryId()
      if (newId) set({ activeLibraryId: newId })
      console.info(
        `Success to add WebDAV library. id: "${info.id}", name: "${info.name}", book count: ${info.bookCount}`,
      )
      return info
    } catch (e) {
      console.error(`Failed to add WebDAV library. dataSourceId: "${dataSourceId}", remotePath: "${remotePath}", error:`, e)
      throw e
    }
  },

  removeLibrary: async (id) => {
    console.info(`Start to remove library. id: "${id}"`)
    try {
      await api.removeLibrary(id)
      await get().refreshLibraries()
      const newId = await api.getActiveLibraryId()
      set({ activeLibraryId: newId })
      console.info(
        `Success to remove library. id: "${id}", active library id after: "${newId ?? ""}"`,
      )
    } catch (e) {
      console.error(`Failed to remove library. id: "${id}", error:`, e)
      throw e
    }
  },

  switchLibrary: async (id) => {
    console.info(`Start to switch active library. id: "${id}"`)
    try {
      await api.switchLibrary(id)
      set({ activeLibraryId: id })
      console.info(`Success to switch active library. id: "${id}"`)
    } catch (e) {
      console.error(`Failed to switch active library. id: "${id}", error:`, e)
      throw e
    }
  },
  async refreshBooks() {},
  async addResolvedLibrary() {
    return false
  },
  clearError() {
    set({ error: null })
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
  const addWebdavLibrary = useLibraryStore((s) => s.addWebdavLibrary)
  const removeLibrary = useLibraryStore((s) => s.removeLibrary)
  const switchLibrary = useLibraryStore((s) => s.switchLibrary)
  const refreshLibraries = useLibraryStore((s) => s.refreshLibraries)
  const refreshLibrary = useLibraryStore((s) => s.refreshLibrary)

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
    addWebdavLibrary,
    removeLibrary,
    switchLibrary,
    refreshLibraries,
    refreshLibrary,
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