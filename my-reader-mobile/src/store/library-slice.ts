import type { LibraryStore } from "my-reader-tools/store/library";

import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import { clearAllReaderCaches } from "../data/cache";
import {
  clearLocalCopyCacheByLibrary,
  ensureLibraryMetadataCached,
  pickCalibreLibrary,
  readBookCountFromLibrary,
  readBooksFromLibrary,
} from "../data/calibre";
import type { Library, WebDavDataSource } from "../data/types";
import { readBooksFromWebDavLibrary } from "../data/webdav";
import { mergeDataSources } from "./app-store.constants";
import type { AppState, AppStateSlice } from "./app-store.types";
import { readWebDavPassword } from "./secure-credential-store";
import { refreshLibrary as syncRefreshLibrary } from "../sync/refresh-library";

function mergeLibraryUpdate(libraries: Library[], updatedLibrary: Library) {
  return libraries.map((library) =>
    library.id === updatedLibrary.id ? updatedLibrary : library
  );
}

type LibrarySlice = Pick<AppState, keyof LibraryStore | "books" | "loadingBooks" | "error" | "setHydrated" | "clearError" | "addResolvedLibrary" | "refreshBooks" | "refreshLibrary">;

export const createLibrarySlice: AppStateSlice<LibrarySlice> = (set, get) =>
  ({
    libraries: [],
    activeLibraryId: null,
    books: [],
    loading: true,
    loadingBooks: false,
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
        const nextBooks =
          activeLibrary.sourceType === "webdav"
            ? await (async () => {
                const source = state.dataSources.find(
                  (item) => item.id === activeLibrary.dataSourceId && item.type === "webdav"
                );
                if (!source || source.type !== "webdav") {
                  throw new Error("当前书库关联的 WebDAV 数据源不存在。");
                }

                const password =
                  source.password ?? (await readWebDavPassword(source.id)) ?? "";
                if (!password) {
                  throw new Error("当前 WebDAV 数据源缺少密码，请重新编辑数据源。");
                }

                const { books, metadataUri } = await readBooksFromWebDavLibrary(activeLibrary, {
                  ...source,
                  password,
                } as WebDavDataSource);
                return { books, metadataUri };
              })()
            : { books: await readBooksFromLibrary(activeLibrary), metadataUri: activeLibrary.metadataUri };

        const { library: refreshedLibrary, bookCount } =
          activeLibrary.sourceType === "webdav"
            ? {
                library:
                  nextBooks.metadataUri === activeLibrary.metadataUri
                    ? activeLibrary
                    : { ...activeLibrary, metadataUri: nextBooks.metadataUri },
                bookCount: activeLibrary.bookCount,
              }
            : await readBookCountFromLibrary(activeLibrary);

        set((currentState) => ({
          books: nextBooks.books,
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

      set({ loadingBooks: true, error: null });
      try {
        const { diff, newBookCount, newLibrary } = await syncRefreshLibrary(
          library,
          state.dataSources
        );

        // Update the library in the list with new metadataUri / bookCount
        const nextLibraries = state.libraries.map((l) =>
          l.id === libraryId
            ? { ...newLibrary, bookCount: newBookCount }
            : l
        );
        set({ libraries: nextLibraries });

        // Refresh books list
        await get().refreshBooks();

        console.info("Library refreshed:", {
          libraryId,
          added: diff.added.length,
          removed: diff.removed.length,
          modified: diff.modified.length,
          newBookCount,
        });
      } catch (caught) {
        set({
          loadingBooks: false,
          error: caught instanceof Error ? caught.message : "刷新书库失败",
        });
      }
    },
  });
