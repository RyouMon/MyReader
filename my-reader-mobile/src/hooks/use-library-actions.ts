import { useAppStore } from "../store/app-store";
import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import { clearAllReaderCaches } from "../services/fs/cache";
import {
  clearLocalCopyCacheByLibrary,
  ensureLibraryMetadataCached,
  pickCalibreLibrary,
  readBookCountFromLibrary,
} from "../data/calibre";
import { checkConnectivity } from "../sync/connectivity";
import { resolveSyncTarget } from "../sync/resolve";
import { refreshLibrary as syncRefreshLibrary } from "../sync/refresh-library";
import { fetchBooksWithMeta, libraryQueryKeys } from "./queries/useLibraryQuery";
import { queryClient } from "./queries/queryClient";
import type { Library } from "@my-reader/tools/types/library";
import type { BookItem } from "../data/types";
import { isRemoteSourceType } from "../data/types";
import { excludeLocalLibrarySource } from "../store/app-store.constants";
import i18n from "@/src/i18n";

function mergeLibraryUpdate(libraries: Library[], updatedLibrary: Library) {
  return libraries.map((library) =>
    library.id === updatedLibrary.id ? updatedLibrary : library,
  );
}

export function useLibraryActions() {
  const store = useAppStore;

  async function hydrateFromBackend() {
    store.getState().setLoading(true);
    store.getState().setError(null);

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
      store.getState().setLoading(false);

      await refreshBooks();
    } catch (caught) {
      store.getState().setLibraries([]);
      store.getState().setActiveLibraryId(null);
      store.getState().setLoading(false);
      store.getState().setError(
        caught instanceof Error ? caught.message : i18n.t("sync.loadLibraryFailed"),
      );
    }
  }

  async function addLibrary() {
    store.getState().setError(null);

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
      const message = caught instanceof Error ? caught.message : i18n.t("sync.addLibraryFailed");
      store.getState().setError(message);
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
    store.getState().setError(null);

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
    store.getState().setError(null);
    clearLocalCopyCacheByLibrary(id);
    clearAllReaderCaches();

    await refreshBooks();
  }

  async function switchLibrary(id: string) {
    store.getState().setActiveLibraryId(id);
    store.getState().setError(null);
    await refreshBooks();
  }

  async function refreshBooks() {
    const state = store.getState();
    const activeLibrary =
      state.libraries.find((library) => library.id === state.activeLibraryId) ?? null;

    if (!activeLibrary) {
      store.getState().setLoading(false);
      return;
    }

    // TODO: replace with proper loadingBooks setter after slice split
    useAppStore.setState({ loadingBooks: true, error: null });

    try {
      const { books: nextBooks, metadataUri } = await queryClient.fetchQuery({
        queryKey: libraryQueryKeys.books(state.activeLibraryId),
        queryFn: () => fetchBooksWithMeta(activeLibrary, state.dataSources),
      });

      const { library: refreshedLibrary, bookCount } =
        isRemoteSourceType(activeLibrary.sourceType)
          ? {
              library:
                metadataUri === activeLibrary.metadataUri
                  ? activeLibrary
                  : { ...activeLibrary, metadataUri },
              bookCount: activeLibrary.bookCount,
            }
          : await readBookCountFromLibrary(activeLibrary);

      store.getState().setLibraries(
        mergeLibraryUpdate(
          store.getState().libraries,
          refreshedLibrary.bookCount === bookCount ? refreshedLibrary : { ...refreshedLibrary, bookCount },
        ),
      );
      useAppStore.setState({ books: nextBooks, loadingBooks: false });
    } catch (caught) {
      useAppStore.setState({
        books: [],
        loadingBooks: false,
        error: caught instanceof Error ? caught.message : i18n.t("sync.readLibraryFailed"),
      });
    }
  }

  async function refreshLibrary(libraryId: string) {
    const state = store.getState();
    const library = state.libraries.find((l) => l.id === libraryId);
    if (!library) return;
    try {
      const { backend } = await resolveSyncTarget(library, state.dataSources);
      await checkConnectivity(backend);
    } catch {
      showAlertWithStatusBarRestore(i18n.t("sync.sourceUnreachable"), i18n.t("sync.sourceUnreachableSyncDetail"), [{ text: i18n.t("common.gotIt") }]);
      return;
    }
    store.getState().setRefreshingLibraryId(libraryId);
    store.getState().setError(null);
    try {
      const { diff, newBookCount, newLibrary } = await syncRefreshLibrary(library, state.dataSources);

      const nextLibraries = state.libraries.map((l) =>
        l.id === libraryId
          ? { ...newLibrary, bookCount: newBookCount }
          : l,
      );
      store.getState().setLibraries(nextLibraries);

      await refreshBooks();

      store.getState().setRefreshingLibraryId(null);
      console.info("Library refreshed:", {
        libraryId,
        added: diff.added.length,
        removed: diff.removed.length,
        modified: diff.modified.length,
        newBookCount,
      });
    } catch (caught) {
      store.getState().setRefreshingLibraryId(null);
      useAppStore.setState({
        loadingBooks: false,
        error: caught instanceof Error ? caught.message : i18n.t("sync.refreshLibraryFailed"),
      });
    }
  }

  return {
    hydrateFromBackend,
    addLibrary,
    addResolvedLibrary,
    removeLibrary,
    switchLibrary,
    refreshBooks,
    refreshLibrary,
  };
}