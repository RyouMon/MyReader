import type {
  AppStateSlice,
  FixedReaderSettings,
  HomeCardStyle,
  LibraryViewMode,
  ReaderSettings,
  ReflowableReaderSettings,
} from "./app-store.types"
import type { ThemeMode } from "../design/tokens"

import {
  DEFAULT_LIBRARY_VIEW_MODE,
  defaultSettings,
} from "./app-store.constants"

export type SettingsSlice = {
  settings: ReaderSettings
  setThemeMode: (mode: ThemeMode) => void
  setLanguage: (language: string) => void
  setSyncOnStartup: (enabled: boolean) => void
  setEnableAutoSync: (enabled: boolean) => void
  setHomeCardStyle: (style: HomeCardStyle) => void
  patchReflowableReaderSettings: (
    patch: Partial<ReflowableReaderSettings>,
  ) => void
  patchFixedReaderSettings: (patch: Partial<FixedReaderSettings>) => void
}

export const createSettingsSlice: AppStateSlice<SettingsSlice> = (set) => ({
  settings: defaultSettings,
  setThemeMode(mode) {
    set((state) => ({ settings: { ...state.settings, themeMode: mode } }))
  },
  setLanguage(language) {
    set((state) => ({ settings: { ...state.settings, language } }))
  },
  setSyncOnStartup(enabled) {
    set((state) => ({
      settings: { ...state.settings, syncOnStartup: enabled },
    }))
  },
  setEnableAutoSync(enabled) {
    set((state) => ({
      settings: { ...state.settings, enableAutoSync: enabled },
    }))
  },
  setHomeCardStyle(style) {
    set((state) => ({ settings: { ...state.settings, homeCardStyle: style } }))
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
    }))
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
    }))
  },
})

export type ProgramSlice = {
  libraryViewMode: LibraryViewMode
  setLibraryViewMode: (mode: LibraryViewMode) => void
}

export const createProgramSlice: AppStateSlice<ProgramSlice> = (set) => ({
  libraryViewMode: DEFAULT_LIBRARY_VIEW_MODE,
  setLibraryViewMode(mode) {
    set({ libraryViewMode: mode })
  },
})
