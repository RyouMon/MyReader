import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { showAlertWithStatusBarRestore } from "../constants/alert-with-status-bar";
import { clearAllReaderCaches } from "../data/cache";
import {
  clearLocalCopyCacheByLibrary,
  ensureLibraryMetadataCached,
  pickCalibreLibrary,
  readBookCountFromLibrary,
  readBooksFromLibrary,
} from "../data/calibre";
import type { MobileLibrary, WebDavDataSource } from "../data/types";
import { readBooksFromWebDavLibrary } from "../data/webdav";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "../constants/local-library-data-source";
import {
  DEFAULT_LIBRARY_VIEW_MODE,
  defaultSettings,
  mergeDataSources,
  persistableDataSources,
  STORE_NAME,
} from "./app-store.constants";
import type { AppState, AppStateSlice, LibraryViewMode, PersistedAppState } from "./app-store.types";
import { createDataSourceSlice } from "./data-source-slice";
import { createExpoJsonStorage } from "./json-storage";
import { readWebDavPassword } from "./secure-credential-store";

const jsonStorage = createExpoJsonStorage();

type SettingsSlice = Pick<
  AppState,
  | "settings"
  | "setThemeMode"
  | "setSyncEnabled"
  | "patchCacheSettings"
  | "patchReflowableReaderSettings"
  | "patchFixedReaderSettings"
>;

const createSettingsSlice: AppStateSlice<SettingsSlice> = (set) => ({
  settings: defaultSettings,
  setThemeMode(mode) {
    set((state) => ({ settings: { ...state.settings, themeMode: mode } }));
  },
  setSyncEnabled(enabled) {
    set((state) => ({ settings: { ...state.settings, syncEnabled: enabled } }));
  },
  patchCacheSettings(patch) {
    set((state) => ({
      settings: {
        ...state.settings,
        cache: {
          ...state.settings.cache,
          ...patch,
        },
      },
    }));
  },
  patchReflowableReaderSettings(patch) {
    set((state) => ({
      settings: {
        ...state.settings,
        reflowable: {
          ...state.settings.reflowable,
          ...patch,
        },
      },
    }));
  },
  patchFixedReaderSettings(patch) {
    set((state) => ({
      settings: {
        ...state.settings,
        fixed: {
          ...state.settings.fixed,
          ...patch,
        },
      },
    }));
  },
});

type ProgramStateSlice = Pick<AppState, "libraryViewMode" | "setLibraryViewMode">;

const createProgramStateSlice: AppStateSlice<ProgramStateSlice> = (set) => ({
  libraryViewMode: DEFAULT_LIBRARY_VIEW_MODE,
  setLibraryViewMode(mode) {
    set({ libraryViewMode: mode });
  },
});

/** Returns whether a persisted value matches the current library view modes. */
function isLibraryViewMode(value: unknown): value is LibraryViewMode {
  return value === "grid" || value === "list";
}

function mergeLibraryUpdate(libraries: MobileLibrary[], updatedLibrary: MobileLibrary) {
  return libraries.map((library) =>
    library.id === updatedLibrary.id ? updatedLibrary : library
  );
}

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

const createLibrarySlice: AppStateSlice<LibrarySlice> = (set, get) => ({
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
      if (picked === null) {
        return false;
      }

      const state = get();

      const nextLibrary: MobileLibrary = {
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
        return false;
      }

      const nextLibraries = [...state.libraries, preparedLibrary];
      const nextActiveLibraryId = state.activeLibraryId ?? preparedLibrary.id;

      set({
        libraries: nextLibraries,
        activeLibraryId: nextActiveLibraryId,
      });

      await get().refreshBooks();
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "添加书库失败";
      set({ error: message });
      return false;
    }
  },
  async addResolvedLibrary(library) {
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

              return readBooksFromWebDavLibrary(activeLibrary, {
                ...source,
                password,
              } as WebDavDataSource);
            })()
          : await readBooksFromLibrary(activeLibrary);

      const { library: refreshedLibrary, bookCount } =
        activeLibrary.sourceType === "webdav"
          ? { library: activeLibrary, bookCount: activeLibrary.bookCount }
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
});

export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createSettingsSlice(...args),
      ...createProgramStateSlice(...args),
      ...createDataSourceSlice(...args),
      ...createLibrarySlice(...args),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => jsonStorage),
      partialize: (state) => ({
        settings: state.settings,
        dataSources: persistableDataSources(state.dataSources),
        libraries: state.libraries,
        activeLibraryId: state.activeLibraryId,
        libraryViewMode: state.libraryViewMode,
      }),
      merge: (persistedState, currentState) => {
        const typedPersisted = (persistedState as Partial<PersistedAppState>) ?? {};

        return {
          ...currentState,
          settings: {
            ...defaultSettings,
            ...typedPersisted.settings,
          },
          dataSources: mergeDataSources(
            Array.isArray(typedPersisted.dataSources) ? typedPersisted.dataSources : []
          ),
          libraries: Array.isArray(typedPersisted.libraries) ? typedPersisted.libraries : [],
          activeLibraryId:
            typeof typedPersisted.activeLibraryId === "string"
              ? typedPersisted.activeLibraryId
              : null,
          libraryViewMode: isLibraryViewMode(typedPersisted.libraryViewMode)
            ? typedPersisted.libraryViewMode
            : DEFAULT_LIBRARY_VIEW_MODE,
        } as AppState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        state.setHasHydrated(true);
        void state.hydrateFromBackend();
      },
    }
  )
);

export function getActiveLibrary() {
  const state = useAppStore.getState();
  return state.libraries.find((library) => library.id === state.activeLibraryId) ?? null;
}

export function useAppStoreReady() {
  return useAppStore((state) => state.hasHydrated);
}
