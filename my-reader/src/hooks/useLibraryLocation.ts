import type { Library } from "@my-reader/tools/types/library"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { open } from "@tauri-apps/plugin-dialog"
import { resetBrokenCovers } from "@/lib/coverFailureCache"
import { api } from "@/lib/tauri-api"
import { libraryKeys } from "./queries/useLibrariesQuery"

export function useLibraryLocation(
  library: Library,
  diagnose = false,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      "libraryLocation",
      library.id,
      library.path,
      library.sourcePath,
      diagnose,
    ],
    queryFn: () => api.getLibraryLocation(library.id, diagnose),
    enabled,
    retry: false,
  })
}

export function useRelocateLibrary(library: Library) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (path: string) => api.relocateLibrary(library.id, path),
    onSuccess: async (result) => {
      if (result.problem) return
      resetBrokenCovers()
      await client.invalidateQueries({ queryKey: ["booksPage", library.id] })
      await client.invalidateQueries({ queryKey: libraryKeys.all })
      await client.invalidateQueries({
        queryKey: ["libraryLocation", library.id],
      })
    },
  })
}

export function useLocationFolders(
  library: Library,
  path: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["locationFolders", library.dataSourceId, path],
    retry: false,
    enabled: enabled && !!library.dataSourceId,
    queryFn: () =>
      library.sourceType === "onedrive"
        ? api.onedriveListFolders(library.dataSourceId!, path)
        : api.webdavListFolders(library.dataSourceId!, path),
  })
}

export function pickLibraryLocation() {
  return open({ directory: true, multiple: false })
}
export function retryLibrarySync(id: string) {
  return api.syncDbForLibrary(id)
}
