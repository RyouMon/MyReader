import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory } from "expo-file-system"
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/src/constants/local-library-data-source"
import {
  ensureLibraryMetadataCached,
  libraryQueryKeys,
  readBookCountFromLibrary,
} from "@/src/domain/library/calibre"
import { runLibrarySync } from "@/src/domain/sync/hooks/run-library-sync"
import { isRemoteSourceType } from "@/src/domain/types"
import i18n from "@/src/i18n"
import {
  type DeviceRegistry,
  initializeDeviceRegistry,
  registerDeviceLibrary,
  removeDeviceLibrary,
  switchDeviceLibrary,
} from "@/src/services/core/device-registry"
import { addRemoteLibrary } from "@/src/services/core/remote"
import {
  libraryContainerRootUri,
  usesIosContainerSidecar,
} from "@/src/services/fs/library-paths"
import { queryClient } from "@/src/services/query/query-client"
import { useAppStore } from "@/src/store/app-store"
import { excludeLocalLibrarySource } from "@/src/store/app-store.constants"

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

/** Registers a new library, dedupes, and runs add-trigger full sync. */
export async function registerLibrary(
  library: Library,
): Promise<Library | null> {
  const prepared = isRemoteSourceType(library.sourceType)
    ? library
    : (await readBookCountFromLibrary(library)).library

  let registry: DeviceRegistry
  try {
    registry = await registerDeviceLibrary(prepared)
  } catch (error) {
    if (String(error).includes("LIBRARY_ALREADY_EXISTS")) {
      showAlertWithStatusBarRestore(
        i18n.t("sync.cannotAddDuplicate"),
        i18n.t("sync.alreadyAdded"),
        [{ text: i18n.t("common.gotIt") }],
      )
      return null
    }
    throw error
  }
  useAppStore.getState().setLibraries(registry.libraries)
  useAppStore.getState().setActiveLibraryId(registry.activeLibraryId)

  try {
    await runLibrarySync({ libraryId: prepared.id, trigger: "add" })
  } catch (err) {
    console.warn("[registerLibrary] add sync failed:", err)
  }

  return prepared
}

/** Downloads, validates, and registers a remote Calibre library through core. */
export async function registerRemoteLibrary(
  source: DataSource,
  sourcePath: string,
): Promise<Library> {
  const { library, registry } = await addRemoteLibrary(source, sourcePath)
  useAppStore.getState().setLibraries(registry.libraries)
  useAppStore.getState().setActiveLibraryId(registry.activeLibraryId)

  try {
    await runLibrarySync({ libraryId: library.id, trigger: "add" })
  } catch (error) {
    console.warn("[registerRemoteLibrary] add sync failed:", error)
  }

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

/** @deprecated Use registerLibrary after picker resolves a local library. */
export async function addLibraryFromPicker(
  picked: Library | null,
): Promise<Library | null> {
  if (picked === null) return null

  const nextLibrary: Library = {
    ...picked,
    dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
    sourceType: "local",
  }

  return registerLibrary(nextLibrary)
}
