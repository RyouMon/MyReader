import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory } from "expo-file-system"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  ensureLibraryMetadataCached,
  libraryQueryKeys,
  type PickedCalibreLibrary,
} from "@/src/domain/library/calibre"
import { runLibrarySync } from "@/src/domain/sync/hooks/run-library-sync"
import { isRemoteSourceType } from "@/src/domain/types"
import i18n from "@/src/i18n"
import {
  addLocalAppLibrary,
  removeAppLibrary,
  switchAppLibrary,
} from "@/src/services/core/app-config"
import { addRemoteLibrary } from "@/src/services/core/remote"
import { withSecurityScopedLibraryAccess } from "@/src/services/fs/bookmarks"
import {
  librariesContainerRootUri,
  libraryContainerRootUri,
  METADATA_DB_RELATIVE,
  usesIosContainerSidecar,
} from "@/src/services/fs/library-paths"
import { fileUriFor } from "@/src/services/fs/path"
import { queryClient } from "@/src/services/query/query-client"
import { useAppStore } from "@/src/store/app-store"
import { excludeLocalLibrarySource } from "@/src/store/app-store.constants"
import { scheduleIdleWork } from "@/src/utils/common"

function startInitialLibrarySync(libraryId: string, context: string): void {
  void runLibrarySync({
    libraryId,
    trigger: "add",
    options: {
      forceCalibre: false,
      throwOnFailure: false,
    },
  }).catch((error) => {
    console.warn(`[${context}] add sync failed:`, error)
  })
}

/** Hydrates persisted libraries into store on app startup. */
export async function hydrateLibraries(): Promise<void> {
  try {
    const config = useAppStore.getState()
    const hydratedLibraries = await Promise.all(
      config.libraries.map(async (library) => {
        try {
          return await ensureLibraryMetadataCached(library)
        } catch {
          return library
        }
      }),
    )

    const nextActiveLibraryId =
      hydratedLibraries.find((library) => library.id === config.activeLibraryId)
        ?.id ??
      hydratedLibraries[0]?.id ??
      null

    useAppStore.getState().setLibraries(hydratedLibraries)
    useAppStore
      .getState()
      .setDataSources(excludeLocalLibrarySource(config.dataSources))
    useAppStore.getState().setActiveLibraryId(nextActiveLibraryId)
  } catch {
    useAppStore.getState().setLibraries([])
    useAppStore.getState().setActiveLibraryId(null)
  } finally {
    useAppStore.getState().setStoreReady(true)
  }
}

/** Downloads, validates, and adds a remote Calibre library through core. */
export async function addRemoteLibraryFromSource(
  source: DataSource,
  sourcePath: string,
): Promise<Library> {
  const { library, config } = await addRemoteLibrary(source, sourcePath)
  useAppStore.getState().setLibraries(config.libraries)
  useAppStore.getState().setActiveLibraryId(config.activeLibraryId)

  startInitialLibrarySync(library.id, "addRemoteLibraryFromSource")

  return library
}

function scheduleLibraryContainerRemoval(
  id: string,
  library: Library | undefined,
): void {
  if (
    !library ||
    (!isRemoteSourceType(library.sourceType) &&
      !usesIosContainerSidecar(library))
  ) {
    return
  }

  scheduleIdleWork(() => {
    try {
      const container = new Directory(libraryContainerRootUri(id))
      if (container.exists) {
        container.delete()
      }
    } catch (error) {
      console.warn(`[removeLibrary] container cleanup failed (${id}):`, error)
    }
  })
}

/** Removes a library and schedules non-critical app-container cleanup. */
export async function removeLibrary(id: string): Promise<void> {
  const config = useAppStore.getState()
  const removed = config.libraries.find((library) => library.id === id)
  const appConfig = await removeAppLibrary(id)

  useAppStore.getState().setLibraries(appConfig.libraries)
  useAppStore.getState().setActiveLibraryId(appConfig.activeLibraryId)

  queryClient.removeQueries({
    queryKey: libraryQueryKeys.books(id),
    exact: true,
  })
  scheduleLibraryContainerRemoval(id, removed)
}

/** Switches the active library without blocking on sync. */
export async function switchActiveLibrary(id: string): Promise<void> {
  const appConfig = await switchAppLibrary(id)
  useAppStore.getState().setActiveLibraryId(appConfig.activeLibraryId)
}

export async function addLibraryFromPicker(
  picked: PickedCalibreLibrary | null,
): Promise<Library | null> {
  if (picked === null) return null

  const accessLibrary: Library = {
    id: "",
    name: picked.name ?? "",
    path: picked.uri,
    bookCount: 0,
    securityScopedBookmark: picked.securityScopedBookmark,
  }
  let result: Awaited<ReturnType<typeof addLocalAppLibrary>>
  try {
    const access = await withSecurityScopedLibraryAccess(
      accessLibrary,
      async (libraryRootUri) =>
        addLocalAppLibrary({
          libraryRootUri,
          path: picked.uri,
          sidecarContainerParentUri: picked.securityScopedBookmark
            ? librariesContainerRootUri()
            : undefined,
          name: picked.name,
          metadataUri: fileUriFor(libraryRootUri, METADATA_DB_RELATIVE),
          addedAt: Date.now(),
          securityScopedBookmark: picked.securityScopedBookmark,
        }),
    )
    result = access.result
  } catch (error) {
    const message = String(error)
    if (message.includes("LIBRARY_ALREADY_EXISTS")) {
      showAlertWithStatusBarRestore(
        i18n.t("sync.cannotAddDuplicate"),
        i18n.t("sync.alreadyAdded"),
        [{ text: i18n.t("common.gotIt") }],
      )
      return null
    }
    if (message.includes("METADATA_DB_NOT_FOUND")) {
      showAlertWithStatusBarRestore(
        i18n.t("sync.metadataNotFound"),
        i18n.t("sync.metadataNotFoundDetail"),
        [{ text: i18n.t("common.gotIt") }],
      )
      return null
    }
    throw error
  }

  useAppStore.getState().setLibraries(result.config.libraries)
  useAppStore.getState().setActiveLibraryId(result.config.activeLibraryId)

  startInitialLibrarySync(result.library.id, "addLibraryFromPicker")

  return result.library
}
