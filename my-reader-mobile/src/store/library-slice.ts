import type { LibraryStore } from "@my-reader/tools/store/library";

import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import { clearAllReaderCaches } from "../data/cache";
import {
  clearLocalCopyCacheByLibrary,
  ensureLibraryMetadataCached,
  pickCalibreLibrary,
  readBookCountFromLibrary,
} from "../data/calibre";
import type { Library } from "../data/types";
import { checkLibraryConnectivity } from "../sync/connectivity";
import { refreshLibrary as syncRefreshLibrary } from "../sync/refresh-library";
import { fetchBooksWithMeta, libraryQueryKeys } from "../hooks/queries/useLibraryQuery";
import { queryClient } from "../hooks/queries/queryClient";
import { mergeDataSources } from "./app-store.constants";
import type { AppState, AppStateSlice } from "./app-store.types";

function mergeLibraryUpdate(libraries: Library[], updatedLibrary: Library) {
  return libraries.map((library) =>
    library.id === updatedLibrary.id ? updatedLibrary : library
  );
}

type LibrarySlice = Pick<AppState, keyof LibraryStore | "books" | "loadingBooks" | "refreshingLibraryId" | "error" | "setHydrated" | "clearError" | "addResolvedLibrary" | "refreshBooks" | "refreshLibrary">;

export const createLibrarySlice: AppStateSlice<LibrarySlice> = (set, get) =>
  ({
    libraries: [],
    activeLibraryId: null,
    books: [],
    loading: true,
    loadingBooks: false,
    refreshingLibraryId: null,
    error: null,
    hydrated: false,
    setHydrated(value: boolean) {
      set({ hydrated: value });
    },
    async hydrateFromBackend() {
      set({ loading: true, error: null });

      try {
        const state = get();
        const hydratedLibraries = await Promise.all(
          state.libraries.map(async (library) => {
            try {
              return await ensureLibraryMetadataCached(library);
            } catch {
              return library;
            }
          })
        );

        const nextActiveLibraryId =
          hydratedLibraries.find((library) => library.id === state.activeLibraryId)?.id ??
          hydratedLibraries[0]?.id ??
          null;

        set({
          libraries: hydratedLibraries,
          dataSources: mergeDataSources(state.dataSources),
          activeLibraryId: nextActiveLibraryId,
          loading: false,
        });

        await get().refreshBooks();
      } catch (caught) {
        set({
          libraries: [],
          activeLibraryId: null,
          books: [],
          loading: false,
          error: caught instanceof Error ? caught.message : "加载书库失败",
        });
      }
    },
    clearError() {
      set({ error: null });
    },
    async addLibrary() {
      set({ error: null });

      try {
        const picked = await pickCalibreLibrary();
        if (picked === null) {
          return null;
        }

        const state = get();

        const nextLibrary: Library = {
          ...picked,
          dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
          sourceType: "local",
        };

        const { library: preparedLibrary } = await readBookCountFromLibrary(nextLibrary);

        if (
          state.libraries.some(
            (item) =>
              item.metadataUri === preparedLibrary.metadataUri || item.path === preparedLibrary.path
          )
        ) {
          showAlertWithStatusBarRestore("无法添加", "该书库已经添加过了。", [{ text: "知道了" }]);
          return null;
        }

        const nextLibraries = [...state.libraries, preparedLibrary];
        const nextActiveLibraryId = state.activeLibraryId ?? preparedLibrary.id;

        set({
          libraries: nextLibraries,
          activeLibraryId: nextActiveLibraryId,
        });

        await get().refreshBooks();
        return preparedLibrary;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "添加书库失败";
        set({ error: message });
        return null;
      }
    },
    async addResolvedLibrary(library: Library) {
      const state = get();
      const prepared =
        library.sourceType === "webdav" ? library : (await readBookCountFromLibrary(library)).library;

      if (
        state.libraries.some(
          (item) => item.metadataUri === prepared.metadataUri || item.path === prepared.path
        )
      ) {
        showAlertWithStatusBarRestore("无法添加", "该书库已经添加过了。", [{ text: "知道了" }]);
        return false;
      }

      const nextLibraries = [...state.libraries, prepared];
      const nextActiveLibraryId = state.activeLibraryId ?? prepared.id;

      set({
        libraries: nextLibraries,
        activeLibraryId: nextActiveLibraryId,
        error: null,
      });

      await get().refreshBooks();
      return true;
    },
    async removeLibrary(id) {
      const state = get();
      const nextLibraries = state.libraries.filter((library) => library.id !== id);
      const removedActiveLibrary = state.activeLibraryId === id;
      const nextActiveLibraryId = removedActiveLibrary ? nextLibraries[0]?.id ?? null : state.activeLibraryId;

      set({
        libraries: nextLibraries,
        activeLibraryId: nextActiveLibraryId,
        error: null,
      });
      clearLocalCopyCacheByLibrary(id);
      clearAllReaderCaches();

      await get().refreshBooks();
    },
    async switchLibrary(id) {
      set({ activeLibraryId: id, error: null });
      await get().refreshBooks();
    },
    async refreshBooks() {
      const state = get();
      const activeLibrary =
        state.libraries.find((library) => library.id === state.activeLibraryId) ?? null;

      if (!activeLibrary) {
        set({ books: [], loadingBooks: false });
        return;
      }

      set({ loadingBooks: true, error: null });

      try {
        const { books: nextBooks, metadataUri } = await queryClient.fetchQuery({
          queryKey: libraryQueryKeys.books(state.activeLibraryId),
          queryFn: () => fetchBooksWithMeta(activeLibrary, state.dataSources),
        });

        const { library: refreshedLibrary, bookCount } =
          activeLibrary.sourceType === "webdav"
            ? {
                library:
                  metadataUri === activeLibrary.metadataUri
                    ? activeLibrary
                    : { ...activeLibrary, metadataUri },
                bookCount: activeLibrary.bookCount,
              }
            : await readBookCountFromLibrary(activeLibrary);

        set((currentState) => ({
          books: nextBooks,
          loadingBooks: false,
          libraries: mergeLibraryUpdate(
            currentState.libraries,
            refreshedLibrary.bookCount === bookCount ? refreshedLibrary : { ...refreshedLibrary, bookCount }
          ),
        }));
      } catch (caught) {
        set({
          books: [],
          loadingBooks: false,
          error: caught instanceof Error ? caught.message : "读取书库失败",
        });
      }
    },
    async refreshLibraries() {},
    async refreshLibrary(libraryId: string) {
      const state = get();
      const library = state.libraries.find((l) => l.id === libraryId);
      if (!library) return;
      try {
        await checkLibraryConnectivity(library.id);
      } catch {
        showAlertWithStatusBarRestore("数据源无法连接", "无法访问 WebDAV 数据源，同步已取消。\n\n可能的原因：\n• 当前网络连接不可用或不稳定\n• WebDAV 服务器未运行或无法访问\n• 服务器地址、端口或认证配置有误", [{ text: "知道了" }]);
        return;
      }
      set({ refreshingLibraryId: libraryId, error: null });
      try {
        const { diff, newBookCount, newLibrary } = await syncRefreshLibrary(
          library,
          state.dataSources
        );

        const nextLibraries = state.libraries.map((l) =>
          l.id === libraryId
            ? { ...newLibrary, bookCount: newBookCount }
            : l
        );
        set({ libraries: nextLibraries });

        await get().refreshBooks();

        set({ refreshingLibraryId: null });
        console.info("Library refreshed:", {
          libraryId,
          added: diff.added.length,
          removed: diff.removed.length,
          modified: diff.modified.length,
          newBookCount,
        });
      } catch (caught) {
        set({
          refreshingLibraryId: null,
          loadingBooks: false,
          error: caught instanceof Error ? caught.message : "刷新书库失败",
        });
      }
    },
  });
