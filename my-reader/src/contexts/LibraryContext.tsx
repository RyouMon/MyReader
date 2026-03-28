import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { invoke } from "@tauri-apps/api/core"

import type { LibraryInfo } from "@/types/book"

interface LibraryContextValue {
  libraries: LibraryInfo[]
  activeLibraryId: string | null
  activeLibrary: LibraryInfo | null
  loading: boolean
  addLibrary: (path: string, name?: string) => Promise<LibraryInfo>
  removeLibrary: (id: string) => Promise<void>
  switchLibrary: (id: string) => Promise<void>
  refreshLibraries: () => Promise<void>
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error("useLibrary must be used inside LibraryProvider")
  return ctx
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [libraries, setLibraries] = useState<LibraryInfo[]>([])
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const activeLibrary = libraries.find((l) => l.id === activeLibraryId) ?? null

  const refreshLibraries = useCallback(async () => {
    try {
      const libs = await invoke<LibraryInfo[]>("list_libraries")
      setLibraries(libs)
    } catch (e) {
      console.error("Failed to list libraries:", e)
    }
  }, [])

  const addLibrary = useCallback(
    async (path: string, name?: string): Promise<LibraryInfo> => {
      const info = await invoke<LibraryInfo>("add_library", { path, name })
      await refreshLibraries()
      const id = await invoke<string | null>("get_active_library_id")
      if (id) setActiveLibraryId(id)
      return info
    },
    [refreshLibraries],
  )

  const removeLibrary = useCallback(
    async (id: string) => {
      await invoke("remove_library", { id })
      await refreshLibraries()
      const newId = await invoke<string | null>("get_active_library_id")
      setActiveLibraryId(newId)
    },
    [refreshLibraries],
  )

  const switchLibrary = useCallback(async (id: string) => {
    await invoke("switch_library", { id })
    setActiveLibraryId(id)
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        await refreshLibraries()
        const id = await invoke<string | null>("get_active_library_id")
        setActiveLibraryId(id)
      } catch (e) {
        console.error("Init failed:", e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [refreshLibraries])

  return (
    <LibraryContext.Provider
      value={{
        libraries,
        activeLibraryId,
        activeLibrary,
        loading,
        addLibrary,
        removeLibrary,
        switchLibrary,
        refreshLibraries,
      }}
    >
      {children}
    </LibraryContext.Provider>
  )
}
