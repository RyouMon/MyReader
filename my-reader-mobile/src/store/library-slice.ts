import {
  ensureLibraryMetadataCached,
  pickCalibreLibrary,
  readBooksFromLibrary,
} from "../data/calibre";
import type { MobileLibrary, WebDavDataSource } from "../data/types";
import { readBooksFromWebDavLibrary } from "../data/webdav";

import type { AppState, AppStateSlice } from "./app-store.types";
import { BUILT_IN_LOCAL_SOURCE, BUILT_IN_LOCAL_SOURCE_ID, mergeDataSources } from "./app-store.constants";

type LibrarySlice = Pick<
  AppState,
  | "libraries"
  | "activeLibraryId"
  | "books"
  | "loadingLibraries"
  | "loadingBooks"
  | "error"
  | "hasHydrated"
  | "setHasHydrated"
  | "initialize"
  | "clearError"
  | "addLibrary"
  | "addResolvedLibrary"
  | "removeLibrary"
  | "setActiveLibrary"
  | "refreshBooks"
>;

export const createLibrarySlice: AppStateSlice<LibrarySlice> = (set, get) => ({
  libraries: [],
  activeLibraryId: null,
  books: [],
  loadingLibraries: true,
  loadingBooks: false,
  error: null,
  hasHydrated: false,
  setHasHydrated(value) {
    set({ hasHydrated: value });
  },
  async initialize() {
    set({ loadingLibraries: true, error: null });

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
        loadingLibraries: false,
      });

      await get().refreshBooks();
    } catch (caught) {
      set({
        dataSources: [BUILT_IN_LOCAL_SOURCE],
        libraries: [],
        activeLibraryId: null,
        books: [],
        loadingLibraries: false,
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
      const state = get();

      if (
        state.libraries.some(
          (item) => item.metadataUri === picked.metadataUri || item.path === picked.path
        )
      ) {
        throw new Error("该书库已经添加过了");
      }

      const nextLibrary: MobileLibrary = {
        ...picked,
        dataSourceId: BUILT_IN_LOCAL_SOURCE_ID,
        sourceType: "local",
      };

      const nextLibraries = [...state.libraries, nextLibrary];
      const nextActiveLibraryId = state.activeLibraryId ?? nextLibrary.id;

      set({
        libraries: nextLibraries,
        activeLibraryId: nextActiveLibraryId,
      });

      await get().refreshBooks();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "添加书库失败";
      set({ error: message });
      throw caught;
    }
  },
  async addResolvedLibrary(library) {
    const state = get();

    if (
      state.libraries.some(
        (item) => item.metadataUri === library.metadataUri || item.path === library.path
      )
    ) {
      throw new Error("该书库已经添加过了");
    }

    const nextLibraries = [...state.libraries, library];
    const nextActiveLibraryId = state.activeLibraryId ?? library.id;

    set({
      libraries: nextLibraries,
      activeLibraryId: nextActiveLibraryId,
      error: null,
    });

    await get().refreshBooks();
  },
  /**
   * 移除指定书库，并在必要时回退当前激活书库。
   */
  async removeLibrary(id) {
    const state = get();
    const nextLibraries = state.libraries.filter((library) => library.id !== id);
    const removedActiveLibrary = state.activeLibraryId === id;
    const nextActiveLibraryId = removedActiveLibrary
      ? nextLibraries[0]?.id ?? null
      : state.activeLibraryId;

    set({
      libraries: nextLibraries,
      activeLibraryId: nextActiveLibraryId,
      error: null,
    });

    await get().refreshBooks();
  },
  async setActiveLibrary(id) {
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
          ? await readBooksFromWebDavLibrary(
              activeLibrary,
              state.dataSources.find(
                (item) => item.id === activeLibrary.dataSourceId && item.type === "webdav"
              ) as WebDavDataSource
            )
          : await readBooksFromLibrary(activeLibrary);

      set({ books: nextBooks, loadingBooks: false });
    } catch (caught) {
      set({
        books: [],
        loadingBooks: false,
        error: caught instanceof Error ? caught.message : "读取书库失败",
      });
    }
  },
});
