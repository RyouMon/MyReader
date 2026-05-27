import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
    DEFAULT_LIBRARY_VIEW_MODE,
    defaultSettings,
    mergeDataSources,
    persistableDataSources,
    STORE_NAME,
} from "./app-store.constants";
import type { AppState, AppStateSlice, LibraryViewMode, PersistedAppState } from "./app-store.types";
import { createDataSourceSlice } from "./data-source-slice";
import { createExpoJsonStorage } from "../services/storage/json-storage";
import { createLibrarySlice } from "./library-slice";

const jsonStorage = createExpoJsonStorage();

type SettingsSlice = Pick<
  AppState,
  | "settings"
  | "setThemeMode"
  | "setLanguage"
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
  setLanguage(language) {
    set((state) => ({ settings: { ...state.settings, language } }));
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

export const useAppStore = create<AppState>()(
  persist(
    (...args) => {
      const dataSourceSlice = createDataSourceSlice(...args)
      const librarySlice = createLibrarySlice(...args)
      return {
        ...createSettingsSlice(...args),
        ...createProgramStateSlice(...args),
        ...dataSourceSlice,
        ...librarySlice,
        async hydrateFromBackend() {
          await dataSourceSlice.hydrateFromBackend()
          await librarySlice.hydrateFromBackend()
        },
      }
    },
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
        const persistedSettings = typedPersisted.settings;

        return {
          ...currentState,
          settings: {
            ...defaultSettings,
            ...persistedSettings,
            reflowable: { ...defaultSettings.reflowable, ...persistedSettings?.reflowable },
            fixed: { ...defaultSettings.fixed, ...persistedSettings?.fixed },
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

        state.setHydrated(true);
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
  return useAppStore((state) => state.hydrated);
}
