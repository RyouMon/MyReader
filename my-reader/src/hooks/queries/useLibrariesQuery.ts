import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { Library } from "@my-reader/tools/types/library"
import { resetBrokenCovers } from "@/lib/coverFailureCache"
import { api } from "@/lib/tauri-api"
import { useLibraryUiStore } from "@/stores/libraryUiStore"

export const libraryKeys = {
  all: ["libraries"] as const,
}

async function fetchLibraries(): Promise<Library[]> {
  const rows = await api.listLibraries()
  return rows.map(mapLibraryFromBackendJson)
}

function mapLibraryFromBackendJson(raw: Record<string, unknown>): Library {
  return {
    id: raw.id as string,
    name: raw.name as string,
    path: raw.path as string,
    bookCount: raw.bookCount as number,
    addedAt: raw.addedAt as number | undefined,
    dataSourceId: raw.dataSourceId as string | null | undefined,
    sourceType: raw.sourceType as string | null | undefined,
    sourcePath: raw.sourcePath as string | null | undefined,
  }
}

async function syncActiveLibraryId() {
  try {
    const activeLibraryId = await api.getActiveLibraryId()
    useLibraryUiStore.setState({ activeLibraryId })
  } catch {
    // keep add-library success independent from UI active-library hydration
  }
}

export function useLibrariesQuery() {
  return useQuery({
    queryKey: libraryKeys.all,
    queryFn: fetchLibraries,
  })
}

export function useLibraryMutations() {
  const queryClient = useQueryClient()

  const addLibrary = useMutation({
    mutationFn: async (path: string) => {
      const info = await api.addLibrary(path, null)
      return mapLibraryFromBackendJson(info)
    },
    onSuccess: async () => {
      resetBrokenCovers()
      await syncActiveLibraryId()
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all })
    },
  })

  const addWebdavLibrary = useMutation({
    mutationFn: async ({
      dataSourceId,
      rootPath,
      name,
    }: {
      dataSourceId: string
      rootPath: string
      name?: string
    }) => {
      const info = await api.addWebdavLibrary(
        dataSourceId,
        rootPath,
        name ?? null,
      )
      return mapLibraryFromBackendJson(info)
    },
    onSuccess: async () => {
      resetBrokenCovers()
      await syncActiveLibraryId()
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all })
    },
  })

  const addOnedriveLibrary = useMutation({
    mutationFn: async ({
      dataSourceId,
      rootPath,
      name,
    }: {
      dataSourceId: string
      rootPath: string
      name?: string
    }) => {
      const info = await api.addOnedriveLibrary(
        dataSourceId,
        rootPath,
        name ?? null,
      )
      return mapLibraryFromBackendJson(info)
    },
    onSuccess: async () => {
      resetBrokenCovers()
      await syncActiveLibraryId()
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all })
    },
  })

  const removeLibrary = useMutation({
    mutationFn: async (id: string) => {
      await api.removeLibrary(id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all })
    },
  })

  const refreshLibrary = useMutation({
    mutationFn: async (id: string) => {
      const libs = await fetchLibraries()
      const lib = libs.find((l) => l.id === id)
      if (!lib) throw new Error("Library not found")
      if (lib.sourceType === "webdav") {
        await api.refreshWebdavLibrary(id)
      } else if (lib.sourceType === "onedrive") {
        await api.refreshOnedriveLibrary(id)
      } else {
        await api.refreshLibrary(id)
      }
    },
    onSuccess: () => {
      resetBrokenCovers()
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all })
    },
  })

  return {
    addLibrary: addLibrary.mutateAsync,
    addWebdavLibrary: addWebdavLibrary.mutateAsync,
    addOnedriveLibrary: addOnedriveLibrary.mutateAsync,
    removeLibrary: removeLibrary.mutateAsync,
    refreshLibrary: refreshLibrary.mutateAsync,
    isAdding: addLibrary.isPending,
    isAddingWebdav: addWebdavLibrary.isPending,
    isAddingOnedrive: addOnedriveLibrary.isPending,
    isRemoving: removeLibrary.isPending,
    isRefreshing: refreshLibrary.isPending,
  }
}
