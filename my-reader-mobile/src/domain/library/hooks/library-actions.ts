import i18n from "@/src/i18n";
import type { Library } from "@my-reader/tools/types/library";
import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/src/constants/local-library-data-source";
import { ensureLibraryMetadataCached, readBookCountFromLibrary } from "@/src/domain/library/calibre";
import { libraryQueryKeys } from "@/src/domain/library/calibre";
import { runLibrarySync } from "@/src/domain/sync/hooks/run-library-sync";
import { isRemoteSourceType } from "@/src/domain/types";
import { libraryContainerRootUri, usesIosContainerSidecar } from "@/src/services/fs/library-paths";
import { Directory } from "expo-file-system";
import { queryClient } from "@/src/services/query/query-client";
import { useAppStore } from "@/src/store/app-store";
import { excludeLocalLibrarySource } from "@/src/store/app-store.constants";

function isDuplicateLibrary(libraries: Library[], candidate: Library): boolean {
  return libraries.some(
    (item) => item.metadataUri === candidate.metadataUri || item.path === candidate.path,
  );
}

/** Hydrates persisted libraries into store on app startup. */
export async function hydrateLibraries(): Promise<void> {
  try {
    const state = useAppStore.getState();
    const hydratedLibraries = await Promise.all(
      state.libraries.map(async (library) => {
        try {
          return await ensureLibraryMetadataCached(library);
        } catch {
          return library;
        }
      }),
    );

    const nextActiveLibraryId =
      hydratedLibraries.find((library) => library.id === state.activeLibraryId)?.id ??
      hydratedLibraries[0]?.id ??
      null;

    useAppStore.getState().setLibraries(hydratedLibraries);
    useAppStore.getState().setDataSources(excludeLocalLibrarySource(state.dataSources));
    useAppStore.getState().setActiveLibraryId(nextActiveLibraryId);
  } catch {
    useAppStore.getState().setLibraries([]);
    useAppStore.getState().setActiveLibraryId(null);
  } finally {
    useAppStore.getState().setStoreReady(true);
  }
}

/** Registers a new library, dedupes, and runs add-trigger Calibre sync. */
export async function registerLibrary(library: Library): Promise<Library | null> {
  const state = useAppStore.getState();
  const prepared = isRemoteSourceType(library.sourceType)
    ? library
    : (await readBookCountFromLibrary(library)).library;

  if (isDuplicateLibrary(state.libraries, prepared)) {
    showAlertWithStatusBarRestore(i18n.t("sync.cannotAddDuplicate"), i18n.t("sync.alreadyAdded"), [
      { text: i18n.t("common.gotIt") },
    ]);
    return null;
  }

  const nextLibraries = [...state.libraries, prepared];
  const nextActiveLibraryId = state.activeLibraryId ?? prepared.id;

  useAppStore.getState().setLibraries(nextLibraries);
  useAppStore.getState().setActiveLibraryId(nextActiveLibraryId);

  try {
    await runLibrarySync({ libraryId: prepared.id, trigger: "add" });
  } catch (err) {
    console.warn("[registerLibrary] add sync failed:", err);
  }

  return prepared;
}

/** Removes a library and deletes its app container when applicable. */
export async function removeLibrary(id: string): Promise<void> {
  const state = useAppStore.getState();
  const nextLibraries = state.libraries.filter((library) => library.id !== id);
  const removedActiveLibrary = state.activeLibraryId === id;
  const nextActiveLibraryId = removedActiveLibrary
    ? (nextLibraries[0]?.id ?? null)
    : state.activeLibraryId;

  const removed = state.libraries.find((library) => library.id === id);

  useAppStore.getState().setLibraries(nextLibraries);
  useAppStore.getState().setActiveLibraryId(nextActiveLibraryId);

  if (removed && (isRemoteSourceType(removed.sourceType) || usesIosContainerSidecar(removed))) {
    const container = new Directory(libraryContainerRootUri(id));
    if (container.exists) {
      container.delete();
    }
  }

  await queryClient.invalidateQueries({ queryKey: libraryQueryKeys.books(id) });
  if (nextActiveLibraryId) {
    await queryClient.invalidateQueries({ queryKey: libraryQueryKeys.books(nextActiveLibraryId) });
  }
}

/** Switches the active library without blocking on sync. */
export function switchActiveLibrary(id: string): void {
  useAppStore.getState().setActiveLibraryId(id);
}

/** @deprecated Use registerLibrary after picker resolves a local library. */
export async function addLibraryFromPicker(
  picked: Library | null,
): Promise<Library | null> {
  if (picked === null) return null;

  const nextLibrary: Library = {
    ...picked,
    dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
    sourceType: "local",
  };

  return registerLibrary(nextLibrary);
}
