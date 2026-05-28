import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
    DEFAULT_LIBRARY_VIEW_MODE,
    excludeLocalLibrarySource,
    defaultSettings,
    STORE_NAME,
} from "./app-store.constants";
import type { AppState, LibraryViewMode, PersistedAppState } from "./app-store.types";
import { createDataSourceSlice } from "./data-source-slice";
import { createExpoJsonStorage } from "../services/storage/json-storage";
import { createLibrarySlice } from "./library-slice";
import { createSettingsSlice, createProgramSlice } from "./settings-slice";
import { createStatusSlice } from "./status-slice";

const jsonStorage = createExpoJsonStorage();

/** Returns whether a persisted value matches the current library view modes. */
function isLibraryViewMode(value: unknown): value is LibraryViewMode {
  return value === "grid" || value === "list";
}

export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createStatusSlice(...args),
      ...createSettingsSlice(...args),
      ...createProgramSlice(...args),
      ...createDataSourceSlice(...args),
      ...createLibrarySlice(...args),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => jsonStorage),
      partialize: (state) => ({
        settings: state.settings,
        dataSources: excludeLocalLibrarySource(state.dataSources),
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
          dataSources: excludeLocalLibrarySource(
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

        state.setStoreReady(true);
      },
    }
  )
);

export function useAppStoreReady() {
  return useAppStore((state) => state.storeReady);
}