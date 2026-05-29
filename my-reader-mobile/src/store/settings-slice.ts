import type { AppStateSlice, FixedReaderSettings, LibraryViewMode, ReaderSettings, ReflowableReaderSettings } from "./app-store.types";
import type { ThemeMode } from "../design/tokens";

import { DEFAULT_LIBRARY_VIEW_MODE, defaultSettings } from "./app-store.constants";

export type SettingsSlice = {
  settings: ReaderSettings;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguage: (language: string) => void;
  setSyncEnabled: (enabled: boolean) => void;
  patchCacheSettings: (patch: Partial<ReaderSettings["cache"]>) => void;
  patchReflowableReaderSettings: (patch: Partial<ReflowableReaderSettings>) => void;
  patchFixedReaderSettings: (patch: Partial<FixedReaderSettings>) => void;
};

export const createSettingsSlice: AppStateSlice<SettingsSlice> = (set) => ({
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

export type ProgramSlice = {
  libraryViewMode: LibraryViewMode;
  setLibraryViewMode: (mode: LibraryViewMode) => void;
};

export const createProgramSlice: AppStateSlice<ProgramSlice> = (set) => ({
  libraryViewMode: DEFAULT_LIBRARY_VIEW_MODE,
  setLibraryViewMode(mode) {
    set({ libraryViewMode: mode });
  },
});
