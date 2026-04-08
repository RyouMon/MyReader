import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { defaultSettings, mergeDataSources, persistableDataSources, STORE_NAME } from "./app-store.constants";
import type { AppState, PersistedAppState } from "./app-store.types";
import { createDataSourceSlice } from "./data-source-slice";
import { createExpoJsonStorage } from "./json-storage";
import { createLibrarySlice } from "./library-slice";
import { createSettingsSlice } from "./settings-slice";

const jsonStorage = createExpoJsonStorage();

export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createSettingsSlice(...args),
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
        } as AppState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        state.setHasHydrated(true);
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
