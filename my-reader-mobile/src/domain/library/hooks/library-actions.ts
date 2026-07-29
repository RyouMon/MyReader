import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory } from "expo-file-system"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import {
  ensureLibraryMetadataCached,
  libraryQueryKeys,
  type PickedCalibreLibrary,
} from "@/src/domain/library/calibre"
import { withSecurityScopedLibraryAccess } from "@/src/services/fs/bookmarks"
import { runLibrarySync } from "@/src/domain/sync/hooks/run-library-sync"
import { isRemoteSourceType } from "@/src/domain/types"
import i18n from "@/src/i18n"
import {
  addLocalDeviceLibrary,
  initializeDeviceRegistry,
  removeDeviceLibrary,
  switchDeviceLibrary,
} from "@/src/services/core/device-registry"
import { addRemoteLibrary } from "@/src/services/core/remote"
import {
  libraryContainerRootUri,
  librariesContainerRootUri,
  METADATA_DB_RELATIVE,
  usesIosContainerSidecar,
} from "@/src/services/fs/library-paths"
import { fileUriFor } from "@/src/services/fs/path"
import { queryClient } from "@/src/services/query/query-client"
import { useAppStore } from "@/src/store/app-store"
import { excludeLocalLibrarySource } from "@/src/store/app-store.constants"

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
    const state = useAppStore.getState()
    const registry = await initializeDeviceRegistry({
      dataSources: state.dataSources,
      libraries: state.libraries,
      activeLibraryId: state.activeLibraryId,
    })
    const hydratedLibraries = await Promise.all(
      registry.libraries.map(async (library) => {
        try {
          return await ensureLibraryMetadataCached(library)
        } catch {
          return library
        }
      }),
    )

    const nextActiveLibraryId =
      hydratedLibraries.find(
        (library) => library.id === registry.activeLibraryId,
      )?.id ??
      hydratedLibraries[0]?.id ??
      null

    useAppStore.getState().setLibraries(hydratedLibraries)
    useAppStore
      .getState()
      .setDataSources(excludeLocalLibrarySource(registry.dataSources))
    useAppStore.getState().setActiveLibraryId(nextActiveLibraryId)
  } catch {
    useAppStore.getState().setLibraries([])
    useAppStore.getState().setActiveLibraryId(null)
  } finally {
    useAppStore.getState().setStoreReady(true)
  }
}

/** Downloads, validates, and registers a remote Calibre library through core. */
export async function registerRemoteLibrary(
  source: DataSource,
  sourcePath: string,
): Promise<Library> {
  const { library, registry } = await addRemoteLibrary(source, sourcePath)
  useAppStore.getState().setLibraries(registry.libraries)
  useAppStore.getState().setActiveLibraryId(registry.activeLibraryId)

  startInitialLibrarySync(library.id, "registerRemoteLibrary")

  return library
}

/** Removes a library and deletes its app container when applicable. */
export async function removeLibrary(id: string): Promise<void> {
  const state = useAppStore.getState()
  const removed = state.libraries.find((library) => library.id === id)
  const registry = await removeDeviceLibrary(id)

  useAppStore.getState().setLibraries(registry.libraries)
  useAppStore.getState().setActiveLibraryId(registry.activeLibraryId)

  if (
    removed &&
    (isRemoteSourceType(removed.sourceType) || usesIosContainerSidecar(removed))
  ) {
    const container = new Directory(libraryContainerRootUri(id))
    if (container.exists) {
      container.delete()
    }
  }

  await queryClient.invalidateQueries({ queryKey: libraryQueryKeys.books(id) })
  if (registry.activeLibraryId) {
    await queryClient.invalidateQueries({
      queryKey: libraryQueryKeys.books(registry.activeLibraryId),
    })
  }
}

/** Switches the active library without blocking on sync. */
export async function switchActiveLibrary(id: string): Promise<void> {
  const registry = await switchDeviceLibrary(id)
  useAppStore.getState().setActiveLibraryId(registry.activeLibraryId)
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
  let result: Awaited<ReturnType<typeof addLocalDeviceLibrary>>
  try {
    const access = await withSecurityScopedLibraryAccess(
      accessLibrary,
      async (libraryRootUri) =>
        addLocalDeviceLibrary({
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

  useAppStore.getState().setLibraries(result.registry.libraries)
  useAppStore.getState().setActiveLibraryId(result.registry.activeLibraryId)

  startInitialLibrarySync(result.library.id, "addLibraryFromPicker")

  return result.library
}
