import {
  coerceReaderFontFamily,
  normalizeReaderFontFamiliesByLanguage,
} from "@my-reader/fonts"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { clampCoverThumbnailGenerationConcurrency } from "../config/library-list-performance"
import {
  DEFAULT_LIBRARY_VIEW_MODE,
  defaultSettings,
  excludeLocalLibrarySource,
  MOBILE_CONFIG_KEY,
} from "./app-store.constants"
import type {
  AppState,
  LibraryViewMode,
  PersistedAppState,
  ReaderSettings,
} from "./app-store.types"
import { createDataSourceSlice } from "./data-source-slice"
import { createLibrarySlice } from "./library-slice"
import { createProgramSlice, createSettingsSlice } from "./settings-slice"
import { createStatusSlice } from "./status-slice"
import {
  coerceLibrarySyncHistory,
  createSyncStatusSlice,
} from "./sync-status-slice"
import { createAppConfigStorage } from "./app-config-storage"

const appConfigStorage = createAppConfigStorage()

/** Returns whether a persisted value matches the current library view modes. */
function isLibraryViewMode(value: unknown): value is LibraryViewMode {
  return value === "grid" || value === "list"
}

export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createStatusSlice(...args),
      ...createSyncStatusSlice(...args),
      ...createSettingsSlice(...args),
      ...createProgramSlice(...args),
      ...createDataSourceSlice(...args),
      ...createLibrarySlice(...args),
    }),
    {
      name: MOBILE_CONFIG_KEY,
      storage: createJSONStorage(() => appConfigStorage),
      partialize: (state) => ({
        settings: state.settings,
        libraryViewMode: state.libraryViewMode,
        librarySyncHistoryById: state.librarySyncHistoryById,
      }),
      merge: (persistedState, currentState) => {
        const typedPersisted =
          (persistedState as Partial<PersistedAppState>) ?? {}
        const persistedSettings = typedPersisted.settings as
          | (Partial<ReaderSettings> & { syncEnabled?: boolean })
          | undefined
        const legacyAutoSync = persistedSettings?.syncEnabled

        return {
          ...currentState,
          settings: {
            ...defaultSettings,
            ...persistedSettings,
            syncOnStartup:
              persistedSettings?.syncOnStartup ?? legacyAutoSync ?? true,
            enableAutoSync:
              persistedSettings?.enableAutoSync ?? legacyAutoSync ?? true,
            coverLoadingSkeletonPulseEnabled:
              persistedSettings?.coverLoadingSkeletonPulseEnabled ??
              defaultSettings.coverLoadingSkeletonPulseEnabled,
            coverThumbnailGenerationConcurrency:
              clampCoverThumbnailGenerationConcurrency(
                persistedSettings?.coverThumbnailGenerationConcurrency ??
                  defaultSettings.coverThumbnailGenerationConcurrency,
              ),
            reflowable: {
              ...defaultSettings.reflowable,
              ...persistedSettings?.reflowable,
              fontFamily: coerceReaderFontFamily(
                persistedSettings?.reflowable?.fontFamily,
                "mobile",
              ),
              fontFamiliesByLanguage: normalizeReaderFontFamiliesByLanguage(
                persistedSettings?.reflowable?.fontFamiliesByLanguage,
                "mobile",
              ),
            },
            fixed: { ...defaultSettings.fixed, ...persistedSettings?.fixed },
          },
          dataSources: excludeLocalLibrarySource(
            Array.isArray(typedPersisted.dataSources)
              ? typedPersisted.dataSources
              : [],
          ),
          libraries: Array.isArray(typedPersisted.libraries)
            ? typedPersisted.libraries
            : [],
          activeLibraryId:
            typeof typedPersisted.activeLibraryId === "string"
              ? typedPersisted.activeLibraryId
              : null,
          libraryViewMode: isLibraryViewMode(typedPersisted.libraryViewMode)
            ? typedPersisted.libraryViewMode
            : DEFAULT_LIBRARY_VIEW_MODE,
          librarySyncHistoryById: coerceLibrarySyncHistory(
            typedPersisted.librarySyncHistoryById,
          ),
        } as AppState
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return
        }

        state.setStoreReady(true)
      },
    },
  ),
)

export function useAppStoreReady() {
  return useAppStore((state) => state.storeReady)
}
