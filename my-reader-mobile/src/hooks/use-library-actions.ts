import { useAppStore } from "../store/app-store";
import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import { clearAllReaderCaches } from "../services/fs/cache";
import {
  clearLocalCopyCacheByLibrary,
  ensureLibraryMetadataCached,
  pickCalibreLibrary,
  readBookCountFromLibrary,
} from "../domain/library/calibre";
import { refreshBooks } from "./queries/useLibraryQuery";
import type { Library } from "@my-reader/tools/types/library";
import { isRemoteSourceType } from "../domain/types";
import { excludeLocalLibrarySource } from "../store/app-store.constants";
import i18n from "@/src/i18n";

export function useLibraryActions() {
  const store = useAppStore;

  async function hydrateFromBackend() {
    try {
      const state = store.getState();
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

      store.getState().setLibraries(hydratedLibraries);
      store.getState().setDataSources(excludeLocalLibrarySource(state.dataSources));
      store.getState().setActiveLibraryId(nextActiveLibraryId);

      await refreshBooks();
    } catch (caught) {
      store.getState().setLibraries([]);
      store.getState().setActiveLibraryId(null);
    } finally {
      store.getState().setStoreReady(true);
    }
  }

  async function addLibrary() {
    try {
      const picked = await pickCalibreLibrary();
      if (picked === null) return null;

      const state = store.getState();
      const nextLibrary: Library = {
        ...picked,
        dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
        sourceType: "local",
      };

      const { library: preparedLibrary } = await readBookCountFromLibrary(nextLibrary);

      if (
        state.libraries.some(
          (item) =>
            item.metadataUri === preparedLibrary.metadataUri || item.path === preparedLibrary.path,
        )
      ) {
        showAlertWithStatusBarRestore(i18n.t("sync.cannotAddDuplicate"), i18n.t("sync.alreadyAdded"), [{ text: i18n.t("common.gotIt") }]);
        return null;
      }

      const nextLibraries = [...state.libraries, preparedLibrary];
      const nextActiveLibraryId = state.activeLibraryId ?? preparedLibrary.id;

      store.getState().setLibraries(nextLibraries);
      store.getState().setActiveLibraryId(nextActiveLibraryId);

      await refreshBooks();
      return preparedLibrary;
    } catch (caught) {
      return null;
    }
  }

  async function addResolvedLibrary(library: Library) {
    const state = store.getState();
    const prepared =
      isRemoteSourceType(library.sourceType) ? library : (await readBookCountFromLibrary(library)).library;

    if (
      state.libraries.some(
        (item) => item.metadataUri === prepared.metadataUri || item.path === prepared.path,
      )
    ) {
      showAlertWithStatusBarRestore(i18n.t("sync.cannotAddDuplicate"), i18n.t("sync.alreadyAdded"), [{ text: i18n.t("common.gotIt") }]);
      return false;
    }

    const nextLibraries = [...state.libraries, prepared];
    const nextActiveLibraryId = state.activeLibraryId ?? prepared.id;

    store.getState().setLibraries(nextLibraries);
    store.getState().setActiveLibraryId(nextActiveLibraryId);

    await refreshBooks();
    return true;
  }

  async function removeLibrary(id: string) {
    const state = store.getState();
    const nextLibraries = state.libraries.filter((library) => library.id !== id);
    const removedActiveLibrary = state.activeLibraryId === id;
    const nextActiveLibraryId = removedActiveLibrary ? nextLibraries[0]?.id ?? null : state.activeLibraryId;

    store.getState().setLibraries(nextLibraries);
    store.getState().setActiveLibraryId(nextActiveLibraryId);
    clearLocalCopyCacheByLibrary(id);
    clearAllReaderCaches();

    await refreshBooks();
  }

  async function switchLibrary(id: string) {
    store.getState().setActiveLibraryId(id);
    await refreshBooks();
  }

  return {
    hydrateFromBackend,
    addLibrary,
    addResolvedLibrary,
    removeLibrary,
    switchLibrary,
    refreshBooks,
  };
}