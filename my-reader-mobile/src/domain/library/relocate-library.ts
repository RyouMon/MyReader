import type { Library } from "@my-reader/tools/types/library"
import { relocateLibraryLocation } from "@/src/services/core/library-location"
import { announceLocalSidecarWork } from "@/src/services/core/sync-events"
import { useAppStore } from "@/src/store/app-store"
import { queryClient } from "@/src/services/query/query-client"
import { libraryQueryKeys } from "./catalog"

export async function relocateLibrary(
  library: Library,
  targetPath: string,
  bookmark?: Library["securityScopedBookmark"],
  targetUri?: string,
) {
  const source = useAppStore
    .getState()
    .dataSources.find((item) => item.id === library.dataSourceId)
  const result = await relocateLibraryLocation(
    library,
    { targetPath, targetUri, securityScopedBookmark: bookmark },
    source,
  )
  if (result.config) {
    useAppStore.getState().setLibraries(result.config.libraries)
    await queryClient.invalidateQueries({
      queryKey: libraryQueryKeys.books(library.id),
    })
    announceLocalSidecarWork(library.id, {
      required: true,
      locationChanged: true,
    })
  }
  return result.location
}
